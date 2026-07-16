"""Integration tests for tool CRUD + auth/permissions.

Regression focus: creating a tool returned 403 in real-API mode. With token
authentication (and Token listed before Session auth), a token-bearing request
must create a tool successfully even when CSRF checks are enforced.
"""
from io import BytesIO
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient, APITestCase

from tools.models import AccessRequest, Tool
from tools import notifications

User = get_user_model()

TOOL_PAYLOAD = {
    "title": "新ツール",
    "summary": "概要",
    "readme": "## README",
    "tool_type": "copilot_agent",
    "access_url": "https://example.com",
    "aspice_process_ids": [],
    "work_categories": ["meeting"],
}


def token_client(user, enforce_csrf=False):
    token, _ = Token.objects.get_or_create(user=user)
    client = APIClient(enforce_csrf_checks=enforce_csrf)
    client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
    return client


class ToolCreateAuthTests(APITestCase):
    def setUp(self):
        self.member = User.objects.create_user(
            username="m", password="pw", role="member", display_name="メンバー"
        )

    def test_token_auth_creates_tool_even_with_csrf_enforced(self):
        """Regression for 403-on-create: token auth bypasses session CSRF."""
        client = token_client(self.member, enforce_csrf=True)
        res = client.post("/api/tools/", TOOL_PAYLOAD, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(res.data["author"]["username"], "m")
        self.assertEqual(res.data["work_categories"], ["meeting"])

    def test_unauthenticated_create_is_rejected(self):
        res = self.client.post("/api/tools/", TOOL_PAYLOAD, format="json")
        self.assertIn(
            res.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )

    def test_session_post_without_csrf_token_is_forbidden(self):
        """Documents WHY the frontend must use token auth (no session cookie):
        a session-authenticated POST without a CSRF token is rejected."""
        client = APIClient(enforce_csrf_checks=True)
        client.force_login(self.member)  # session only, no token header
        res = client.post("/api/tools/", TOOL_PAYLOAD, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


class ToolEditDeletePermissionTests(APITestCase):
    def setUp(self):
        self.author = User.objects.create_user(
            username="author", password="pw", role="member"
        )
        self.other = User.objects.create_user(
            username="other", password="pw", role="member"
        )
        self.admin = User.objects.create_superuser(username="root", password="pw")
        self.tool = Tool.objects.create(
            title="x", summary="s", readme="r", tool_type="other", author=self.author
        )

    def test_author_can_edit_own_tool(self):
        res = token_client(self.author).patch(
            f"/api/tools/{self.tool.id}/", {"title": "更新"}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["title"], "更新")

    def test_member_cannot_edit_others_tool(self):
        res = token_client(self.other).patch(
            f"/api/tools/{self.tool.id}/", {"title": "hacked"}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_edit_and_delete_any_tool(self):
        client = token_client(self.admin, enforce_csrf=True)
        patch = client.patch(
            f"/api/tools/{self.tool.id}/", {"title": "管理者修正"}, format="json"
        )
        self.assertEqual(patch.status_code, status.HTTP_200_OK)
        delete = client.delete(f"/api/tools/{self.tool.id}/")
        self.assertEqual(delete.status_code, status.HTTP_204_NO_CONTENT)


class AccessRequestNotificationTests(APITestCase):
    def setUp(self):
        self.author = User.objects.create_user(
            username="author", password="pw", role="member", display_name="作者"
        )
        self.requester = User.objects.create_user(
            username="req", password="pw", role="member", display_name="申請者"
        )
        self.tool = Tool.objects.create(
            title="t", summary="s", readme="r", tool_type="copilot_agent", author=self.author
        )

    def _client(self, user):
        token, _ = Token.objects.get_or_create(user=user)
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        return c

    @override_settings(TEAMS_WEBHOOK_URL="https://example.com/webhook")
    def test_request_access_sends_teams_notification(self):
        with mock.patch("tools.views.notify_access_request") as notify:
            res = self._client(self.requester).post(
                f"/api/tools/{self.tool.id}/request-access/",
                {"reason": "使いたい"},
                format="json",
            )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(AccessRequest.objects.count(), 1)
        notify.assert_called_once()

    @override_settings(TEAMS_WEBHOOK_URL="")
    def test_request_access_succeeds_without_webhook(self):
        # Webhook 未設定でも申請は成功する
        res = self._client(self.requester).post(
            f"/api/tools/{self.tool.id}/request-access/",
            {"reason": "x"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    def test_notify_skipped_when_no_url(self):
        req = AccessRequest.objects.create(
            requester=self.requester, tool=self.tool, reason="r"
        )
        with override_settings(TEAMS_WEBHOOK_URL=""):
            self.assertFalse(notifications.notify_access_request(req))

    @override_settings(TEAMS_WEBHOOK_URL="https://example.com/webhook")
    def test_notify_posts_card_when_url_set(self):
        req = AccessRequest.objects.create(
            requester=self.requester, tool=self.tool, reason="理由テキスト"
        )
        with mock.patch("urllib.request.urlopen") as urlopen:
            ok = notifications.notify_access_request(req)
        self.assertTrue(ok)
        urlopen.assert_called_once()
        # 送信ペイロードにツール名・申請者名が含まれる
        sent = urlopen.call_args[0][0]
        body = sent.data.decode("utf-8")
        self.assertIn(self.tool.title, body)
        self.assertIn("申請者", body)


class MultipartAndFileTests(APITestCase):
    """multipart でのツール登録、スクリーンショット追加、ZIPダウンロードのE2E。"""

    def setUp(self):
        self.author = User.objects.create_user(
            username="auth", password="pw", role="member", display_name="作者"
        )
        self.other = User.objects.create_user(
            username="other", password="pw", role="member"
        )

    def _auth_client(self, user):
        token, _ = Token.objects.get_or_create(user=user)
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        return c

    def test_create_tool_with_zip_via_multipart(self):
        zip_bytes = b"PK\x03\x04dummyzip"
        zip_file = SimpleUploadedFile(
            "sample.zip", zip_bytes, content_type="application/zip"
        )
        client = self._auth_client(self.author)
        res = client.post(
            "/api/tools/",
            {
                "title": "zipツール",
                "summary": "概要",
                "readme": "## R",
                "tool_type": "zip_upload",
                # CSV 受け入れの動作確認
                "work_categories": "meeting,document",
                "aspice_process_ids": "",
                "zip_file": zip_file,
            },
            format="multipart",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        # ストレージは衝突時にサフィックスを付ける場合があるため部分一致で判定
        self.assertIn("sample", res.data["zip_file_name"])
        self.assertTrue(res.data["zip_file_name"].endswith(".zip"))
        self.assertEqual(res.data["work_categories"], ["meeting", "document"])

    def test_multipart_without_is_published_keeps_default_true(self):
        """回帰: multipart で is_published が未送信のとき DRF が False に倒すバグ。"""
        client = self._auth_client(self.author)
        res = client.post(
            "/api/tools/",
            {
                "title": "t",
                "summary": "s",
                "readme": "r",
                "tool_type": "copilot_agent",
                "work_categories": "meeting",
            },
            format="multipart",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(res.data["is_published"])

    def test_work_categories_accepts_json_string(self):
        client = self._auth_client(self.author)
        res = client.post(
            "/api/tools/",
            {
                "title": "t",
                "summary": "s",
                "readme": "r",
                "tool_type": "copilot_agent",
                "work_categories": '["meeting","mail"]',
            },
            format="multipart",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["work_categories"], ["meeting", "mail"])

    def test_post_screenshot_and_appears_in_detail(self):
        tool = Tool.objects.create(
            title="t", summary="s", readme="r", tool_type="copilot_agent", author=self.author
        )
        # 1x1 PNG
        png = (
            b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
            b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xfc\xff"
            b"\xff?\x00\x05\xfe\x02\xfeA-?\xb0\x00\x00\x00\x00IEND\xaeB`\x82"
        )
        image = SimpleUploadedFile("a.png", png, content_type="image/png")
        client = self._auth_client(self.author)
        res = client.post(
            f"/api/tools/{tool.id}/screenshots/",
            {"image": image, "display_order": "1"},
            format="multipart",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        # 詳細にスクリーンショットが含まれる
        detail = client.get(f"/api/tools/{tool.id}/")
        self.assertEqual(len(detail.data["screenshots"]), 1)
        self.assertTrue(detail.data["screenshots"][0]["image_url"])

    def test_member_cannot_add_screenshot_to_others_tool(self):
        tool = Tool.objects.create(
            title="t", summary="s", readme="r", tool_type="copilot_agent", author=self.author
        )
        png = b"\x89PNG\r\n\x1a\n"
        image = SimpleUploadedFile("a.png", png, content_type="image/png")
        client = self._auth_client(self.other)
        res = client.post(
            f"/api/tools/{tool.id}/screenshots/",
            {"image": image},
            format="multipart",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_zip_download_returns_file(self):
        tool = Tool.objects.create(
            title="t", summary="s", readme="r", tool_type="zip_upload", author=self.author
        )
        tool.zip_file.save("a.zip", BytesIO(b"PKzipdata"), save=True)
        client = self._auth_client(self.author)
        res = client.get(f"/api/tools/{tool.id}/download/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # FileResponse のヘッダ
        self.assertIn("attachment", res.headers.get("Content-Disposition", ""))

    def test_download_endpoint_increments_download_count(self):
        """ダウンロード数は ActivityLog を集計。/download/ が自動記録し、
        後続の /tools/{id}/ で download_count が返ってくる。"""
        from metrics.models import ActivityLog
        tool = Tool.objects.create(
            title="t", summary="s", readme="r", tool_type="zip_upload", author=self.author
        )
        tool.zip_file.save("a.zip", BytesIO(b"PKzipdata"), save=True)
        client = self._auth_client(self.author)
        # 初期値
        res = client.get(f"/api/tools/{tool.id}/")
        self.assertEqual(res.data["download_count"], 0)
        # ダウンロードを2回
        client.get(f"/api/tools/{tool.id}/download/")
        client.get(f"/api/tools/{tool.id}/download/")
        self.assertEqual(
            ActivityLog.objects.filter(tool=tool, action="download").count(), 2
        )
        # 詳細取得時に反映されている
        res = client.get(f"/api/tools/{tool.id}/")
        self.assertEqual(res.data["download_count"], 2)


class AccessRequestResolveTests(APITestCase):
    def setUp(self):
        self.author = User.objects.create_user(
            username="auth", password="pw", role="member"
        )
        self.requester = User.objects.create_user(
            username="req", password="pw", role="member"
        )
        self.other = User.objects.create_user(
            username="other", password="pw", role="member"
        )
        self.admin = User.objects.create_superuser(username="root2", password="pw")
        self.tool = Tool.objects.create(
            title="t", summary="s", readme="r", tool_type="copilot_agent", author=self.author
        )
        self.req = AccessRequest.objects.create(
            requester=self.requester, tool=self.tool, reason="r"
        )

    def _client(self, user):
        token, _ = Token.objects.get_or_create(user=user)
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        return c

    def test_author_can_grant(self):
        res = self._client(self.author).post(
            f"/api/access-requests/{self.req.id}/resolve/",
            {"status": "granted"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "granted")
        self.assertIsNotNone(res.data["resolved_at"])

    def test_admin_can_reject(self):
        res = self._client(self.admin).post(
            f"/api/access-requests/{self.req.id}/resolve/",
            {"status": "rejected"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "rejected")

    def test_third_party_member_cannot_resolve(self):
        res = self._client(self.other).post(
            f"/api/access-requests/{self.req.id}/resolve/",
            {"status": "granted"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_invalid_status_rejected(self):
        res = self._client(self.author).post(
            f"/api/access-requests/{self.req.id}/resolve/",
            {"status": "in_review"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)


class CommentTests(APITestCase):
    """Comment posting / replies / likes / edit / delete permissions."""

    def setUp(self):
        self.author = User.objects.create_user(
            username="author", password="pw", role="member", display_name="作者"
        )
        self.other = User.objects.create_user(
            username="other", password="pw", role="member", display_name="他人"
        )
        self.admin = User.objects.create_superuser(username="root", password="pw")
        self.tool = Tool.objects.create(
            title="t", summary="s", readme="r", tool_type="other", author=self.author
        )

    def test_post_and_list_comments(self):
        client = token_client(self.other)
        res = client.post(
            f"/api/tools/{self.tool.id}/comments/",
            {"body": "バグです", "comment_type": "bug"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(res.data["author"]["username"], "other")
        self.assertEqual(res.data["comment_type"], "bug")

        res2 = self.client.get(f"/api/tools/{self.tool.id}/comments/")
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        # paginated: results キー or list
        data = res2.data["results"] if isinstance(res2.data, dict) else res2.data
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["body"], "バグです")

    def test_unauthenticated_cannot_post(self):
        res = self.client.post(
            f"/api/tools/{self.tool.id}/comments/",
            {"body": "anon", "comment_type": "general"},
            format="json",
        )
        self.assertIn(
            res.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )

    def test_reply_threading(self):
        client = token_client(self.author)
        parent = client.post(
            f"/api/tools/{self.tool.id}/comments/",
            {"body": "親", "comment_type": "general"},
            format="json",
        )
        self.assertEqual(parent.status_code, status.HTTP_201_CREATED)
        reply = token_client(self.other).post(
            f"/api/tools/{self.tool.id}/comments/",
            {"body": "返信", "comment_type": "general", "parent": parent.data["id"]},
            format="json",
        )
        self.assertEqual(reply.status_code, status.HTTP_201_CREATED, reply.data)
        self.assertEqual(str(reply.data["parent"]), str(parent.data["id"]))

    def test_toggle_like(self):
        client = token_client(self.author)
        comment = client.post(
            f"/api/tools/{self.tool.id}/comments/",
            {"body": "本文", "comment_type": "general"},
            format="json",
        ).data
        cid = comment["id"]
        liker = token_client(self.other)
        res1 = liker.post(f"/api/comments/{cid}/like/")
        self.assertEqual(res1.status_code, status.HTTP_200_OK)
        self.assertTrue(res1.data["liked"])
        self.assertEqual(res1.data["like_count"], 1)
        res2 = liker.post(f"/api/comments/{cid}/like/")
        self.assertFalse(res2.data["liked"])
        self.assertEqual(res2.data["like_count"], 0)

    def test_only_author_or_admin_can_delete(self):
        client = token_client(self.author)
        cid = client.post(
            f"/api/tools/{self.tool.id}/comments/",
            {"body": "本文", "comment_type": "general"},
            format="json",
        ).data["id"]
        # 他人は削除不可
        res = token_client(self.other).delete(f"/api/comments/{cid}/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        # 管理者は削除可
        res2 = token_client(self.admin).delete(f"/api/comments/{cid}/")
        self.assertEqual(res2.status_code, status.HTTP_204_NO_CONTENT)

    def test_me_incoming_comments_returns_others_on_my_tools(self):
        # 自分が登録したツールに、他人が付けたコメント
        token_client(self.other).post(
            f"/api/tools/{self.tool.id}/comments/",
            {"body": "他人コメント", "comment_type": "general"},
            format="json",
        )
        # 自分自身が付けたコメントは除外される
        token_client(self.author).post(
            f"/api/tools/{self.tool.id}/comments/",
            {"body": "自分コメント", "comment_type": "general"},
            format="json",
        )
        res = token_client(self.author).get("/api/me/incoming-comments/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.data["results"] if isinstance(res.data, dict) else res.data
        bodies = [c["body"] for c in data]
        self.assertIn("他人コメント", bodies)
        self.assertNotIn("自分コメント", bodies)


class AccessRequestDeleteTests(APITestCase):
    """解決済みアクセス申請の履歴削除。"""

    def setUp(self):
        self.author = User.objects.create_user(
            username="author", password="pw", role="member", display_name="作者"
        )
        self.requester = User.objects.create_user(
            username="req", password="pw", role="member", display_name="申請者"
        )
        self.stranger = User.objects.create_user(
            username="stranger", password="pw", role="member"
        )
        self.admin = User.objects.create_superuser(username="root", password="pw")
        self.tool = Tool.objects.create(
            title="t", summary="s", readme="r", tool_type="other", author=self.author
        )

    def _make_req(self, status_value="granted"):
        from django.utils import timezone as tz
        return AccessRequest.objects.create(
            requester=self.requester,
            tool=self.tool,
            reason="r",
            status=status_value,
            resolved_at=tz.now() if status_value != "pending" else None,
        )

    def test_requester_can_delete_resolved(self):
        req = self._make_req("granted")
        res = token_client(self.requester).delete(f"/api/access-requests/{req.id}/")
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(AccessRequest.objects.filter(pk=req.pk).exists())

    def test_author_can_delete_resolved(self):
        req = self._make_req("rejected")
        res = token_client(self.author).delete(f"/api/access-requests/{req.id}/")
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)

    def test_admin_can_delete_any_resolved(self):
        req = self._make_req("granted")
        res = token_client(self.admin).delete(f"/api/access-requests/{req.id}/")
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)

    def test_stranger_cannot_delete(self):
        req = self._make_req("granted")
        res = token_client(self.stranger).delete(f"/api/access-requests/{req.id}/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_pending_cannot_be_deleted(self):
        req = self._make_req("pending")
        res = token_client(self.author).delete(f"/api/access-requests/{req.id}/")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(AccessRequest.objects.filter(pk=req.pk).exists())
