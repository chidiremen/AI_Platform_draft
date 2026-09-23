"""通知（Power Automate 連携）のテスト。

最重要なのは「通知が落ちても本来の処理が失敗しないこと」。
Webhook 先が死んでいるせいでツール登録ができない、という事故を防ぐ。
"""
import json
from datetime import timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone
from io import StringIO
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient, APITestCase

from notifications import events
from notifications import hooks as notify
from notifications.models import WebhookDelivery
from themes.models import Theme, ThemeMember
from tools.models import AccessRequest, Comment, Tool

User = get_user_model()

WEBHOOK = "https://example.invalid/powerautomate"


class FakeResponse:
    status = 202

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def capture_requests():
    """urlopen を差し替えて、送られたリクエストを集める。"""
    sent = []

    def fake_urlopen(req, timeout=None):
        sent.append(req)
        return FakeResponse()

    return sent, fake_urlopen


@override_settings(
    POWER_AUTOMATE_WEBHOOK_URL=WEBHOOK, NOTIFY_SYNC=True, NOTIFY_EVENTS=""
)
class PayloadTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="tanaka", password="pw", role="member",
            display_name="田中 太郎", email="tanaka@example.invalid",
        )

    def test_payload_has_the_fields_a_flow_needs(self):
        """フロー側が title/summary/url だけで通知を組めること。"""
        p = events.build_payload(
            events.Event.TOOL_CREATED,
            title="t", summary="s", url="u", actor=self.user,
        )
        for key in ("source", "event", "event_id", "occurred_at", "title",
                    "summary", "url", "actor", "recipients", "data"):
            self.assertIn(key, p)
        self.assertEqual(p["event"], "tool.created")
        self.assertEqual(p["actor"]["name"], "田中 太郎")
        self.assertEqual(p["actor"]["email"], "tanaka@example.invalid")

    def test_recipients_are_deduplicated_and_cleaned(self):
        p = events.build_payload(
            events.Event.TOOL_CREATED, title="t", summary="s",
            to=["a@x.invalid", "", "  ", "a@x.invalid", " b@x.invalid "],
        )
        self.assertEqual(p["recipients"]["to"], ["a@x.invalid", "b@x.invalid"])

    @override_settings(NOTIFY_DEFAULT_EMAILS="ops@example.invalid, dev@example.invalid")
    def test_default_recipients_used_when_no_specific_target(self):
        p = events.build_payload(events.Event.TOOL_CREATED, title="t", summary="s")
        self.assertEqual(
            p["recipients"]["to"], ["ops@example.invalid", "dev@example.invalid"]
        )

    @override_settings(FRONTEND_BASE_URL="https://ai.example.invalid/")
    def test_links_use_the_configured_base_url(self):
        """社内配布時は localhost ではないので明示できること。"""
        self.assertEqual(events.link("/tools/1"), "https://ai.example.invalid/tools/1")


@override_settings(
    POWER_AUTOMATE_WEBHOOK_URL=WEBHOOK, NOTIFY_SYNC=True, NOTIFY_EVENTS=""
)
class SendTests(TestCase):
    def test_sends_json_with_token_header(self):
        sent, fake = capture_requests()
        with override_settings(NOTIFY_SHARED_TOKEN="s3cret"):
            with mock.patch("urllib.request.urlopen", fake):
                events.send(events.build_payload(
                    events.Event.TOOL_CREATED, title="t", summary="s"))
        self.assertEqual(len(sent), 1)
        req = sent[0]
        self.assertEqual(req.full_url, WEBHOOK)
        self.assertEqual(req.get_header("X-aitc-token"), "s3cret")
        body = json.loads(req.data.decode("utf-8"))
        self.assertEqual(body["event"], "tool.created")

    def test_records_a_delivery_log_on_success(self):
        _, fake = capture_requests()
        with mock.patch("urllib.request.urlopen", fake):
            events.send(events.build_payload(
                events.Event.TOOL_CREATED, title="t", summary="s"))
        log = WebhookDelivery.objects.get()
        self.assertEqual(log.status, "sent")
        self.assertEqual(log.response_status, 202)

    def test_records_a_delivery_log_on_failure(self):
        """通知が届かないときに切り分けられるよう、失敗も必ず残す。"""
        with mock.patch("urllib.request.urlopen", side_effect=OSError("接続できません")):
            result = events.send(events.build_payload(
                events.Event.TOOL_CREATED, title="t", summary="s"))
        self.assertEqual(result, events.WebhookStatus.FAILED)
        log = WebhookDelivery.objects.get()
        self.assertEqual(log.status, "failed")
        self.assertIn("接続できません", log.detail)

    @override_settings(POWER_AUTOMATE_WEBHOOK_URL="")
    def test_skipped_when_not_configured(self):
        sent, fake = capture_requests()
        with mock.patch("urllib.request.urlopen", fake):
            result = events.send(events.build_payload(
                events.Event.TOOL_CREATED, title="t", summary="s"))
        self.assertEqual(result, events.WebhookStatus.SKIPPED)
        self.assertEqual(sent, [])

    @override_settings(NOTIFY_EVENTS="access_request.created")
    def test_events_can_be_limited(self):
        sent, fake = capture_requests()
        with mock.patch("urllib.request.urlopen", fake):
            events.send(events.build_payload(
                events.Event.TOOL_CREATED, title="t", summary="s"))
            events.send(events.build_payload(
                events.Event.ACCESS_REQUEST_CREATED, title="t", summary="s"))
        self.assertEqual(len(sent), 1)
        body = json.loads(sent[0].data.decode("utf-8"))
        self.assertEqual(body["event"], "access_request.created")


@override_settings(
    POWER_AUTOMATE_WEBHOOK_URL=WEBHOOK, NOTIFY_SYNC=True, NOTIFY_EVENTS=""
)
class HookIntegrationTests(APITestCase):
    def setUp(self):
        self.author = User.objects.create_user(
            username="auth", password="pw", role="member",
            display_name="登録者", email="author@example.invalid",
        )
        self.other = User.objects.create_user(
            username="other", password="pw", role="member",
            display_name="別の人", email="other@example.invalid",
        )
        self.client = self._client(self.author)

    def _client(self, user):
        token, _ = Token.objects.get_or_create(user=user)
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        return c

    def _bodies(self, sent):
        return [json.loads(r.data.decode("utf-8")) for r in sent]

    def test_tool_registration_fires_the_event(self):
        sent, fake = capture_requests()
        with mock.patch("urllib.request.urlopen", fake):
            res = self.client.post(
                "/api/tools/",
                {
                    "title": "議事録要約くん",
                    "summary": "概要",
                    "readme": "## R",
                    "tool_type": "other",
                    "work_categories": "meeting",
                    "aspice_process_ids": "",
                },
                format="multipart",
            )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        bodies = self._bodies(sent)
        self.assertEqual(len(bodies), 1)
        b = bodies[0]
        self.assertEqual(b["event"], "tool.created")
        self.assertIn("議事録要約くん", b["summary"])
        self.assertEqual(b["data"]["title"], "議事録要約くん")
        self.assertTrue(b["url"].endswith(f"/tools/{res.data['id']}"))

    def test_tool_registration_succeeds_even_if_the_webhook_is_down(self):
        """通知先が死んでいてもツール登録は成功する（これが最重要）。"""
        with mock.patch("urllib.request.urlopen", side_effect=OSError("boom")):
            res = self.client.post(
                "/api/tools/",
                {
                    "title": "壊れた通知でも登録できる",
                    "summary": "概要",
                    "readme": "R",
                    "tool_type": "other",
                    "work_categories": "",
                    "aspice_process_ids": "",
                },
                format="multipart",
            )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertTrue(Tool.objects.filter(title="壊れた通知でも登録できる").exists())
        self.assertEqual(WebhookDelivery.objects.get().status, "failed")

    def test_access_request_is_addressed_to_the_tool_owner(self):
        """Teams の個人チャットが使えないので、個人宛はメールに寄せる。"""
        tool = Tool.objects.create(
            title="t", summary="s", tool_type="other", author=self.author
        )
        sent, fake = capture_requests()
        with mock.patch("urllib.request.urlopen", fake):
            res = self._client(self.other).post(
                f"/api/tools/{tool.id}/request-access/", {"reason": "使いたい"},
                format="json",
            )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        b = self._bodies(sent)[0]
        self.assertEqual(b["event"], "access_request.created")
        self.assertEqual(b["recipients"]["to"], ["author@example.invalid"])
        self.assertEqual(b["data"]["reason"], "使いたい")

    def test_resolving_an_access_request_notifies_the_requester(self):
        tool = Tool.objects.create(
            title="t", summary="s", tool_type="other", author=self.author
        )
        req = AccessRequest.objects.create(tool=tool, requester=self.other, reason="r")
        sent, fake = capture_requests()
        with mock.patch("urllib.request.urlopen", fake):
            res = self.client.post(
                f"/api/access-requests/{req.id}/resolve/", {"status": "granted"},
                format="json",
            )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        b = self._bodies(sent)[0]
        self.assertEqual(b["event"], "access_request.resolved")
        self.assertEqual(b["recipients"]["to"], ["other@example.invalid"])

    def test_comment_notifies_the_tool_owner(self):
        tool = Tool.objects.create(
            title="t", summary="s", tool_type="other", author=self.author
        )
        sent, fake = capture_requests()
        with mock.patch("urllib.request.urlopen", fake):
            self._client(self.other).post(
                f"/api/tools/{tool.id}/comments/",
                {"body": "便利です", "comment_type": "general"},
                format="json",
            )
        b = self._bodies(sent)[0]
        self.assertEqual(b["event"], "comment.created")
        self.assertEqual(b["recipients"]["to"], ["author@example.invalid"])

    def test_own_comment_on_own_tool_does_not_mail_yourself(self):
        tool = Tool.objects.create(
            title="t", summary="s", tool_type="other", author=self.author
        )
        sent, fake = capture_requests()
        with mock.patch("urllib.request.urlopen", fake):
            self.client.post(
                f"/api/tools/{tool.id}/comments/",
                {"body": "自分のメモ", "comment_type": "general"},
                format="json",
            )
        b = self._bodies(sent)[0]
        self.assertEqual(b["recipients"]["to"], [])

    def test_theme_creation_and_freeze_fire_events(self):
        sent, fake = capture_requests()
        with mock.patch("urllib.request.urlopen", fake):
            created = self.client.post(
                "/api/themes/",
                {"title": "議事録の自動要約", "summary": "s", "status": "recruiting"},
                format="json",
            )
            self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
            self.client.post(
                f"/api/themes/{created.data['id']}/freeze/",
                {"reason": "精度が出なかった"},
                format="json",
            )
        names = [b["event"] for b in self._bodies(sent)]
        self.assertIn("theme.created", names)
        self.assertIn("theme.frozen", names)
        frozen = next(b for b in self._bodies(sent) if b["event"] == "theme.frozen")
        # 失敗の知見を共有したいので理由が本文に入る
        self.assertIn("精度が出なかった", frozen["summary"])
        self.assertEqual(frozen["data"]["reason"], "精度が出なかった")

    def test_theme_progress_fires_but_comments_do_not(self):
        sent, fake = capture_requests()
        # 準備のテーマ作成もモック内で行う。外に出すと theme.created が
        # 実ネットワークへ出ようとして遅く・不安定になる。
        with mock.patch("urllib.request.urlopen", fake):
            created = self.client.post(
                "/api/themes/", {"title": "T", "summary": "s"}, format="json"
            )
            tid = created.data["id"]
            sent.clear()
            self.client.post(
                f"/api/themes/{tid}/entries/",
                {"kind": "progress", "body": "進んだ", "progress_percent": 40},
                format="json",
            )
            self.client.post(
                f"/api/themes/{tid}/entries/",
                {"kind": "comment", "body": "がんばって"},
                format="json",
            )
        names = [b["event"] for b in self._bodies(sent)]
        self.assertEqual(names, ["theme.progress"])

    def test_idea_and_question_fire_events(self):
        sent, fake = capture_requests()
        with mock.patch("urllib.request.urlopen", fake):
            self.client.post(
                "/api/ideas/", {"title": "経費精算を自動化したい"}, format="json"
            )
            self.client.post(
                "/api/questions/",
                {"title": "使い方が分かりません", "body": "?"},
                format="json",
            )
        names = [b["event"] for b in self._bodies(sent)]
        self.assertIn("idea.created", names)
        self.assertIn("question.created", names)


@override_settings(POWER_AUTOMATE_WEBHOOK_URL=WEBHOOK, TEAMS_WEBHOOK_URL="https://old.invalid/hook")
class LegacyTeamsPathTests(TestCase):
    def test_legacy_card_is_suppressed_when_power_automate_is_configured(self):
        """両方設定されていても二重通知にならないこと。"""
        from tools.notifications import notify_access_request

        author = User.objects.create_user(username="a", password="p", role="member")
        tool = Tool.objects.create(
            title="t", summary="s", tool_type="other", author=author
        )
        req = AccessRequest.objects.create(tool=tool, requester=author, reason="r")
        with mock.patch("urllib.request.urlopen") as urlopen:
            self.assertFalse(notify_access_request(req))
        urlopen.assert_not_called()

    @override_settings(POWER_AUTOMATE_WEBHOOK_URL="")
    def test_legacy_card_still_works_when_power_automate_is_unset(self):
        from tools.notifications import notify_access_request

        author = User.objects.create_user(username="b", password="p", role="member")
        tool = Tool.objects.create(
            title="t", summary="s", tool_type="other", author=author
        )
        req = AccessRequest.objects.create(tool=tool, requester=author, reason="r")
        with mock.patch("urllib.request.urlopen", return_value=FakeResponse()):
            self.assertTrue(notify_access_request(req))


@override_settings(
    POWER_AUTOMATE_WEBHOOK_URL=WEBHOOK, NOTIFY_SYNC=True,
    NOTIFY_EVENTS="", THEME_STALLED_AFTER_DAYS=30,
)
class StalledCommandTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="o", password="p", role="member", email="o@example.invalid"
        )

    def _stale_theme(self, title, days):
        t = Theme.objects.create(
            title=title, summary="s", status="active", owner=self.user
        )
        ThemeMember.objects.create(theme=t, user=self.user, role="owner")
        past = timezone.now() - timedelta(days=days)
        Theme.objects.filter(pk=t.pk).update(created_at=past, last_progress_at=past)
        return t

    def test_sends_one_combined_message(self):
        """1件ずつ送るとチャネルが埋まるので、必ず1通にまとめる。"""
        self._stale_theme("放置A", 60)
        self._stale_theme("放置B", 90)
        self._stale_theme("最近やった", 1)
        sent, fake = capture_requests()
        with mock.patch("urllib.request.urlopen", fake):
            call_command("notify_stalled_themes", stdout=StringIO())
        self.assertEqual(len(sent), 1)
        b = json.loads(sent[0].data.decode("utf-8"))
        self.assertEqual(b["event"], "theme.stalled")
        self.assertEqual(b["data"]["count"], 2)
        titles = [t["title"] for t in b["data"]["themes"]]
        self.assertCountEqual(titles, ["放置A", "放置B"])

    def test_no_stalled_themes_sends_nothing(self):
        self._stale_theme("最近やった", 1)
        sent, fake = capture_requests()
        with mock.patch("urllib.request.urlopen", fake):
            call_command("notify_stalled_themes", stdout=StringIO())
        self.assertEqual(sent, [])

    def test_dry_run_does_not_send(self):
        self._stale_theme("放置", 60)
        sent, fake = capture_requests()
        with mock.patch("urllib.request.urlopen", fake):
            call_command("notify_stalled_themes", dry_run=True, stdout=StringIO())
        self.assertEqual(sent, [])

    def test_frozen_themes_are_not_reported_as_stalled(self):
        t = self._stale_theme("凍結済み", 90)
        Theme.objects.filter(pk=t.pk).update(status="frozen")
        sent, fake = capture_requests()
        with mock.patch("urllib.request.urlopen", fake):
            call_command("notify_stalled_themes", stdout=StringIO())
        self.assertEqual(sent, [])


class TestEventCommandTests(TestCase):
    def test_lists_events_without_arguments(self):
        out = StringIO()
        call_command("send_test_event", stdout=out)
        text = out.getvalue()
        self.assertIn("tool.created", text)
        self.assertIn("theme.frozen", text)

    @override_settings(POWER_AUTOMATE_WEBHOOK_URL=WEBHOOK, NOTIFY_SYNC=True)
    def test_dry_run_prints_payload_without_sending(self):
        out = StringIO()
        sent, fake = capture_requests()
        with mock.patch("urllib.request.urlopen", fake):
            call_command("send_test_event", "tool.created", dry_run=True, stdout=out)
        self.assertEqual(sent, [])
        payload = json.loads(out.getvalue().split("\n--")[0])
        self.assertEqual(payload["event"], "tool.created")
        self.assertIn("tool_id", payload["data"])

    def test_unknown_event_is_rejected(self):
        from django.core.management.base import CommandError

        with self.assertRaises(CommandError):
            call_command("send_test_event", "nope.nope", stdout=StringIO())
