"""Integration tests for authentication & role behaviour.

Covers two bugs found in real-API mode:
  1. A Django superuser (``createsuperuser``) was shown as "member".
  2. (auth path) token-bearing requests must work for unsafe methods.
"""
import os
from io import StringIO
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
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


class ToolAdminRoleTests(APITestCase):
    """ツール管理者 (tool_admin) が組織管理者 (admin) と同等の権限を持つこと。"""

    def setUp(self):
        self.tool_admin = User.objects.create_user(
            username="ta", password="pw", role="tool_admin", display_name="TA"
        )
        self.member = User.objects.create_user(
            username="m2", password="pw", role="member"
        )

    def test_tool_admin_reports_role_as_tool_admin(self):
        res = token_client(self.tool_admin).get("/api/me/")
        self.assertEqual(res.data["role"], "tool_admin")

    def test_tool_admin_can_access_admin_users_endpoint(self):
        res = token_client(self.tool_admin).get("/api/admin/users/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_tool_admin_can_delete_another_user(self):
        res = token_client(self.tool_admin).delete(
            f"/api/admin/users/{self.member.id}/"
        )
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)

    def test_tool_admin_gets_django_admin_flags(self):
        # 保存時に is_staff / is_superuser が同期される
        self.tool_admin.refresh_from_db()
        self.assertTrue(self.tool_admin.is_staff)
        self.assertTrue(self.tool_admin.is_superuser)


class AdminUserEditDeleteTests(APITestCase):
    """管理者によるユーザー編集（表示名/メール/ロール/PWリセット）と削除。"""

    def setUp(self):
        self.admin = User.objects.create_superuser(username="root", password="pw")
        self.member = User.objects.create_user(
            username="m1", password="pw", role="member", display_name="メンバー1"
        )

    def test_admin_can_update_display_name_and_email(self):
        res = token_client(self.admin).patch(
            f"/api/admin/users/{self.member.id}/",
            {"display_name": "改名後", "email": "new@example.com"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual(res.data["display_name"], "改名後")
        self.assertEqual(res.data["email"], "new@example.com")

    def test_admin_can_reset_user_password(self):
        res = token_client(self.admin).patch(
            f"/api/admin/users/{self.member.id}/",
            {"password": "newpass"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.member.refresh_from_db()
        self.assertTrue(self.member.check_password("newpass"))

    def test_admin_can_delete_user(self):
        res = token_client(self.admin).delete(f"/api/admin/users/{self.member.id}/")
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(User.objects.filter(pk=self.member.pk).exists())

    def test_admin_cannot_delete_self(self):
        res = token_client(self.admin).delete(f"/api/admin/users/{self.admin.id}/")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(User.objects.filter(pk=self.admin.pk).exists())

    def test_member_cannot_delete_anyone(self):
        member2 = User.objects.create_user(username="m2", password="pw", role="member")
        res = token_client(self.member).delete(f"/api/admin/users/{member2.id}/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


class MeUpdateAndPasswordTests(APITestCase):
    """自分のプロフィール更新・パスワード変更。"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="u", password="oldpw", role="member", display_name="旧名"
        )

    def test_me_patch_updates_display_name_and_email(self):
        res = token_client(self.user).patch(
            "/api/me/",
            {"display_name": "新名", "email": "u@example.com"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual(res.data["display_name"], "新名")
        self.user.refresh_from_db()
        self.assertEqual(self.user.display_name, "新名")
        self.assertEqual(self.user.email, "u@example.com")

    def test_me_patch_cannot_change_role(self):
        res = token_client(self.user).patch(
            "/api/me/",
            {"role": "admin", "display_name": "新名"},
            format="json",
        )
        # role はシリアライザのフィールド外なので黙って無視される（200, member のまま）
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.role, "member")

    def test_change_password_requires_correct_old(self):
        client = token_client(self.user)
        res = client.post(
            "/api/me/password/",
            {"old_password": "wrong", "new_password": "newpw"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("oldpw"))

    def test_change_password_success_and_invalidates_token(self):
        old_token, _ = Token.objects.get_or_create(user=self.user)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Token {old_token.key}")
        res = client.post(
            "/api/me/password/",
            {"old_password": "oldpw", "new_password": "newpw"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("newpw"))
        # 旧トークンは無効化されている
        self.assertFalse(Token.objects.filter(key=old_token.key).exists())


class DoctorCommandTests(TestCase):
    """`manage.py doctor` のスモークテスト。

    A/B の2フォルダ構成でDBをコピーしてきたときの切り分けに使うコマンドなので、
    「壊れた環境でも例外を出さずに報告して終わる」ことが最低条件。
    """

    def _run(self, **env):
        out = StringIO()
        with mock.patch.dict(os.environ, env):
            call_command("doctor", stdout=out, stderr=out)
        return out.getvalue()

    def test_runs_and_reports_sections(self):
        User.objects.create_user(username="d1", password="pw", role="member")
        text = self._run(VITE_USE_MOCK="false")
        for section in ("[.env]", "[データベース]", "[ユーザー]", "[メディア]", "[判定]"):
            self.assertIn(section, text)
        self.assertIn("d1", text)

    def test_flags_mock_mode(self):
        """モックモードだとDBのユーザーでログインできない、を検知する。"""
        text = self._run(VITE_USE_MOCK="true")
        self.assertIn("モックモード", text)
        self.assertIn("要確認", text)

    def test_unset_mock_flag_is_treated_as_mock(self):
        """未設定時、フロントは既定でモックになるので警告対象。"""
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("VITE_USE_MOCK", None)
            out = StringIO()
            call_command("doctor", stdout=out, stderr=out)
        self.assertIn("モックモード", out.getvalue())

    def test_flags_empty_user_table(self):
        """ユーザー0件（DBのコピー先違い / 空DB生成）を検知する。"""
        User.objects.all().delete()
        text = self._run(VITE_USE_MOCK="false")
        self.assertIn("ユーザーが0件", text)

    def test_does_not_raise_when_media_missing(self):
        with self.settings(MEDIA_ROOT="/存在しないパス/media"):
            text = self._run(VITE_USE_MOCK="false")
        self.assertIn("[判定]", text)
