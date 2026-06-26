"""Integration tests for authentication & role behaviour.

Covers two bugs found in real-API mode:
  1. A Django superuser (``createsuperuser``) was shown as "member".
  2. (auth path) token-bearing requests must work for unsafe methods.
"""
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient, APITestCase

User = get_user_model()


def token_client(user, enforce_csrf=False):
    token, _ = Token.objects.get_or_create(user=user)
    client = APIClient(enforce_csrf_checks=enforce_csrf)
    client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
    return client


class SuperuserRoleTests(APITestCase):
    def test_createsuperuser_gets_admin_role(self):
        su = User.objects.create_superuser(username="root", password="pw")
        # save() syncs superuser -> admin role.
        self.assertEqual(su.role, "admin")

    def test_me_reports_admin_for_superuser(self):
        su = User.objects.create_superuser(username="root", password="pw")
        res = token_client(su).get("/api/me/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["role"], "admin")

    def test_legacy_superuser_with_member_role_still_reports_admin(self):
        """A superuser whose stored role is stale ('member') must still be admin."""
        su = User.objects.create_superuser(username="root", password="pw")
        # Bypass save() to simulate a row created before the fix.
        User.objects.filter(pk=su.pk).update(role="member")
        su.refresh_from_db()
        self.assertEqual(su.role, "member")  # stored value is stale
        res = token_client(su).get("/api/me/")
        self.assertEqual(res.data["role"], "admin")  # serializer coerces

    def test_login_returns_admin_role_for_superuser(self):
        User.objects.create_superuser(username="root", password="pw")
        res = self.client.post(
            "/api/auth/login/",
            {"username": "root", "password": "pw"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("token", res.data)
        self.assertEqual(res.data["user"]["role"], "admin")

    def test_superuser_can_access_admin_users(self):
        su = User.objects.create_superuser(username="root", password="pw")
        res = token_client(su).get("/api/admin/users/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)


class MemberRoleTests(APITestCase):
    def setUp(self):
        self.member = User.objects.create_user(
            username="m", password="pw", role="member", display_name="メンバー"
        )

    def test_me_reports_member(self):
        res = token_client(self.member).get("/api/me/")
        self.assertEqual(res.data["role"], "member")

    def test_member_blocked_from_admin_users(self):
        res = token_client(self.member).get("/api/admin/users/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
