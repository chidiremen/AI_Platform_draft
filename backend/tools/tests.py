"""Integration tests for tool CRUD + auth/permissions.

Regression focus: creating a tool returned 403 in real-API mode. With token
authentication (and Token listed before Session auth), a token-bearing request
must create a tool successfully even when CSRF checks are enforced.
"""
from unittest import mock

from django.contrib.auth import get_user_model
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
