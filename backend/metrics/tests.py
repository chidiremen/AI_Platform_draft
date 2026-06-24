"""Integration tests: activity logging feeds the dashboard aggregates."""
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient, APITestCase

from tools.models import Tool

User = get_user_model()


def token_client(user):
    token, _ = Token.objects.get_or_create(user=user)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
    return client


class ActivityDashboardTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(username="root", password="pw")
        self.tool = Tool.objects.create(
            title="t", summary="s", readme="r", tool_type="copilot_agent", author=self.admin
        )

    def test_activity_batch_then_dashboard_reflects_counts(self):
        client = token_client(self.admin)
        # バッチ送信（impression x2, view x1, readme_scroll x1）
        payload = [
            {"tool": str(self.tool.id), "action": "impression"},
            {"tool": str(self.tool.id), "action": "impression"},
            {"tool": str(self.tool.id), "action": "view"},
            {"tool": str(self.tool.id), "action": "readme_scroll"},
        ]
        res = client.post("/api/activity/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["created"], 4)

        summary = client.get("/api/dashboard/summary/")
        self.assertEqual(summary.data["total_impressions"], 2)
        self.assertEqual(summary.data["total_views"], 1)

        funnel = client.get("/api/dashboard/funnel/")
        stages = {row["stage"]: row["count"] for row in funnel.data["funnel"]}
        self.assertEqual(stages["impression"], 2)
        self.assertEqual(stages["view"], 1)
        self.assertEqual(stages["readme_scroll"], 1)

    def test_single_activity_post(self):
        client = token_client(self.admin)
        res = client.post(
            "/api/activity/",
            {"tool": str(self.tool.id), "action": "download"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        summary = client.get("/api/dashboard/summary/")
        self.assertEqual(summary.data["total_downloads"], 1)
