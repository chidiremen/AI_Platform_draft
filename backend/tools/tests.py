"""Integration tests for tool CRUD + auth/permissions.

Regression focus: creating a tool returned 403 in real-API mode. With token
authentication (and Token listed before Session auth), a token-bearing request
must create a tool successfully even when CSRF checks are enforced.
"""
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient, APITestCase

from tools.models import Tool

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
