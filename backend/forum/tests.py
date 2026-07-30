from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient, APITestCase

from .models import DEFAULT_ANON_NAMES, ForumAnonName, ForumRevealLog, ForumPost, ForumThread, ThreadVote, make_poster_id

User = get_user_model()


def token_client(user):
    token, _ = Token.objects.get_or_create(user=user)
    c = APIClient()
    c.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
    return c


class ForumThreadTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(username="a", password="p")
        self.member = User.objects.create_user(username="m", password="p", role="member")
        self.other = User.objects.create_user(username="o", password="p", role="member")

    def test_member_can_create_thread(self):
        res = token_client(self.member).post(
            "/api/forum/threads/",
            {"title": "ほしいツール", "body": "本文", "category": "idea", "tags": "a,b"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        # 匿名掲示板なので author は返さない。代わりに is_mine / can_edit で判別する
        self.assertNotIn("author", res.data)
        self.assertTrue(res.data["is_mine"])
        self.assertTrue(res.data["can_edit"])
        self.assertEqual(res.data["post_count"], 0)

    def test_unauthenticated_cannot_read(self):
        res = APIClient().get("/api/forum/threads/")
        self.assertIn(
            res.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )

    def test_view_count_increments_on_detail(self):
        t = ForumThread.objects.create(title="t", author=self.member)
        c = token_client(self.member)
        self.assertEqual(c.get(f"/api/forum/threads/{t.id}/").data["view_count"], 1)
        self.assertEqual(c.get(f"/api/forum/threads/{t.id}/").data["view_count"], 2)

    def test_vote_toggle(self):
        t = ForumThread.objects.create(title="t", author=self.member)
        c = token_client(self.other)
        res = c.post(f"/api/forum/threads/{t.id}/vote/")
        self.assertEqual(res.data["vote_count"], 1)
        self.assertTrue(res.data["voted_by_me"])
        res = c.post(f"/api/forum/threads/{t.id}/vote/")
        self.assertEqual(res.data["vote_count"], 0)
        self.assertFalse(res.data["voted_by_me"])

    def test_owner_can_edit_others_cannot(self):
        t = ForumThread.objects.create(title="t", author=self.member)
        res = token_client(self.other).patch(
            f"/api/forum/threads/{t.id}/", {"title": "改"}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        res = token_client(self.member).patch(
            f"/api/forum/threads/{t.id}/", {"title": "改"}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_admin_can_delete_any_thread(self):
        t = ForumThread.objects.create(title="t", author=self.member)
        res = token_client(self.admin).delete(f"/api/forum/threads/{t.id}/")
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)

    def test_only_admin_can_pin(self):
        t = ForumThread.objects.create(title="t", author=self.member)
        res = token_client(self.member).post(f"/api/forum/threads/{t.id}/toggle-pinned/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        res = token_client(self.admin).post(f"/api/forum/threads/{t.id}/toggle-pinned/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data["is_pinned"])

    def test_owner_can_close_thread(self):
        t = ForumThread.objects.create(title="t", author=self.member)
        res = token_client(self.other).post(f"/api/forum/threads/{t.id}/toggle-closed/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        res = token_client(self.member).post(f"/api/forum/threads/{t.id}/toggle-closed/")
        self.assertTrue(res.data["is_closed"])

    def test_search_and_category_filter(self):
        ForumThread.objects.create(title="Alpha", author=self.member, category="idea")
        ForumThread.objects.create(
            title="Beta", author=self.member, category="discussion", tags="zzz"
        )
        c = token_client(self.member)
        self.assertEqual(len(c.get("/api/forum/threads/?q=Alpha").data["results"]), 1)
        self.assertEqual(len(c.get("/api/forum/threads/?q=zzz").data["results"]), 1)
        self.assertEqual(
            len(c.get("/api/forum/threads/?category=idea").data["results"]), 1
        )
        self.assertEqual(len(c.get("/api/forum/threads/?mine=true").data["results"]), 2)

    def test_sort_by_votes(self):
        t1 = ForumThread.objects.create(title="one", author=self.member)
        t2 = ForumThread.objects.create(title="two", author=self.member)
        ThreadVote.objects.create(thread=t2, user=self.other)
        res = token_client(self.member).get("/api/forum/threads/?sort=votes")
        self.assertEqual(res.data["results"][0]["title"], "two")


class ForumPostTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(username="a2", password="p")
        self.member = User.objects.create_user(username="m2", password="p", role="member")
        self.thread = ForumThread.objects.create(title="t", author=self.member)

    def test_post_numbers_start_at_2_and_increment(self):
        c = token_client(self.member)
        r1 = c.post(
            "/api/forum/posts/",
            {"thread": str(self.thread.id), "body": "one"},
            format="json",
        )
        r2 = c.post(
            "/api/forum/posts/",
            {"thread": str(self.thread.id), "body": "two"},
            format="json",
        )
        self.assertEqual(r1.data["number"], 2)
        self.assertEqual(r2.data["number"], 3)

    def test_posting_updates_thread_last_posted_at(self):
        self.assertIsNone(self.thread.last_posted_at)
        token_client(self.member).post(
            "/api/forum/posts/",
            {"thread": str(self.thread.id), "body": "x"},
            format="json",
        )
        self.thread.refresh_from_db()
        self.assertIsNotNone(self.thread.last_posted_at)

    def test_cannot_post_to_closed_thread(self):
        self.thread.is_closed = True
        self.thread.save()
        res = token_client(self.member).post(
            "/api/forum/posts/",
            {"thread": str(self.thread.id), "body": "x"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_admin_can_post_to_closed_thread(self):
        self.thread.is_closed = True
        self.thread.save()
        res = token_client(self.admin).post(
            "/api/forum/posts/",
            {"thread": str(self.thread.id), "body": "x"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    def test_thread_detail_includes_posts(self):
        ForumPost.objects.create(thread=self.thread, body="a", author=self.member)
        res = token_client(self.member).get(f"/api/forum/threads/{self.thread.id}/")
        self.assertEqual(len(res.data["posts"]), 1)
        self.assertEqual(res.data["posts"][0]["number"], 2)

    def test_poster_id_is_stable_per_day_and_thread(self):
        p1 = ForumPost.objects.create(thread=self.thread, body="a", author=self.member)
        p2 = ForumPost.objects.create(thread=self.thread, body="b", author=self.member)
        # 同一ユーザー・同一スレ・同一日 → 同じ ID
        self.assertEqual(p1.poster_id, p2.poster_id)
        # 別スレなら別 ID
        other = ForumThread.objects.create(title="other", author=self.member)
        self.assertNotEqual(
            p1.poster_id, make_poster_id(self.member.id, other.id, p1.created_at.date())
        )


class ForumAnonNameTests(APITestCase):
    """名無し表記（スレッド毎に決定・設定可能）。"""

    def setUp(self):
        self.member = User.objects.create_user(
            username="anonm", password="pw", role="member"
        )

    def test_falls_back_to_defaults_when_table_empty(self):
        ForumAnonName.objects.all().delete()
        self.assertEqual(ForumAnonName.active_labels(), list(DEFAULT_ANON_NAMES))

    def test_label_is_deterministic_per_thread(self):
        ForumAnonName.objects.all().delete()
        for i, l in enumerate(["A", "B", "C"]):
            ForumAnonName.objects.create(label=l, order=i)
        t = ForumThread.objects.create(title="t", author=self.member)
        first = ForumAnonName.for_thread(t.id)
        # 何度呼んでも同じスレなら同じ表記
        for _ in range(5):
            self.assertEqual(ForumAnonName.for_thread(t.id), first)
        self.assertIn(first, ["A", "B", "C"])

    def test_different_threads_can_get_different_labels(self):
        ForumAnonName.objects.all().delete()
        for i in range(10):
            ForumAnonName.objects.create(label=f"名無し{i}", order=i)
        labels = {
            ForumAnonName.for_thread(
                ForumThread.objects.create(title=f"t{i}", author=self.member).id
            )
            for i in range(30)
        }
        # 30 スレも作れば複数種類に分かれる（全部同じにはならない）
        self.assertGreater(len(labels), 1)

    def test_inactive_labels_are_excluded(self):
        ForumAnonName.objects.all().delete()
        ForumAnonName.objects.create(label="使う", order=1)
        ForumAnonName.objects.create(label="使わない", order=2, is_active=False)
        self.assertEqual(ForumAnonName.active_labels(), ["使う"])

    def test_blank_poster_name_renders_thread_anon_label(self):
        ForumAnonName.objects.all().delete()
        ForumAnonName.objects.create(label="名無しの検証者")
        t = ForumThread.objects.create(title="t", author=self.member)
        p = ForumPost.objects.create(thread=t, body="x", author=self.member)
        self.assertEqual(t.display_name, "名無しの検証者")
        self.assertEqual(p.display_name, "名無しの検証者")
        self.assertFalse(p.is_handle)

    def test_cli_command_add_remove_disable(self):
        from io import StringIO

        from django.core.management import call_command

        ForumAnonName.objects.all().delete()
        call_command("forum_names", "--add", "名無しのCLI", stdout=StringIO())
        self.assertTrue(ForumAnonName.objects.filter(label="名無しのCLI").exists())
        call_command("forum_names", "--disable", "名無しのCLI", stdout=StringIO())
        self.assertNotIn("名無しのCLI", ForumAnonName.active_labels())
        call_command("forum_names", "--enable", "名無しのCLI", stdout=StringIO())
        self.assertIn("名無しのCLI", ForumAnonName.active_labels())
        call_command("forum_names", "--remove", "名無しのCLI", stdout=StringIO())
        self.assertFalse(ForumAnonName.objects.filter(label="名無しのCLI").exists())


class ForumNameInputTests(APITestCase):
    """名前入力欄（空欄=名無し / @xxx=固定ハンドル）。"""

    def setUp(self):
        self.member = User.objects.create_user(
            username="nm", password="pw", role="member"
        )
        self.thread = ForumThread.objects.create(title="t", author=self.member)

    def test_handle_is_displayed_as_typed(self):
        res = token_client(self.member).post(
            "/api/forum/posts/",
            {"thread": str(self.thread.id), "body": "x", "poster_name": "@jiro"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["display_name"], "@jiro")
        self.assertTrue(res.data["is_handle"])

    def test_plain_name_is_displayed_but_not_handle(self):
        res = token_client(self.member).post(
            "/api/forum/posts/",
            {"thread": str(self.thread.id), "body": "x", "poster_name": "通りすがり"},
            format="json",
        )
        self.assertEqual(res.data["display_name"], "通りすがり")
        self.assertFalse(res.data["is_handle"])

    def test_blank_name_becomes_anonymous(self):
        res = token_client(self.member).post(
            "/api/forum/posts/",
            {"thread": str(self.thread.id), "body": "x", "poster_name": "  "},
            format="json",
        )
        self.assertFalse(res.data["is_handle"])
        self.assertEqual(res.data["display_name"], ForumAnonName.for_thread(self.thread.id))

    def test_handle_is_remembered_on_user(self):
        token_client(self.member).post(
            "/api/forum/posts/",
            {"thread": str(self.thread.id), "body": "x", "poster_name": "@kotehan"},
            format="json",
        )
        self.member.refresh_from_db()
        self.assertEqual(self.member.forum_handle, "@kotehan")

    def test_plain_name_is_not_remembered(self):
        token_client(self.member).post(
            "/api/forum/posts/",
            {"thread": str(self.thread.id), "body": "x", "poster_name": "一見さん"},
            format="json",
        )
        self.member.refresh_from_db()
        self.assertEqual(self.member.forum_handle, "")


class PosterIdFormatTests(APITestCase):
    """投稿 ID は英大文字・小文字・数字が混在する 8 桁。"""

    def setUp(self):
        self.member = User.objects.create_user(
            username="idm", password="pw", role="member"
        )

    def test_is_eight_chars_base62(self):
        import re

        t = ForumThread.objects.create(title="t", author=self.member)
        pid = t.poster_id
        self.assertEqual(len(pid), 8)
        self.assertRegex(pid, r"^[0-9A-Za-z]{8}$")

    def test_uses_mixed_case_across_samples(self):
        """多数サンプルを見れば大文字・小文字・数字が現れる（hex ではない）。"""
        ids = "".join(
            ForumThread.objects.create(title=f"t{i}", author=self.member).poster_id
            for i in range(40)
        )
        self.assertTrue(any(c.isupper() for c in ids), ids)
        self.assertTrue(any(c.islower() for c in ids), ids)
        self.assertTrue(any(c.isdigit() for c in ids), ids)
        # hex 表現なら a-f/0-9 のみになるので、g 以降の文字が出ることを確認
        self.assertTrue(any(c in "ghijklmnopqrstuvwxyz" for c in ids.lower()), ids)


class ForumAnonymityTests(APITestCase):
    """投稿者は通常レスポンスに出ず、管理者の明示操作でのみ特定できる。"""

    def setUp(self):
        self.member = User.objects.create_user(
            username="secret", password="pw", role="member", display_name="秘密さん"
        )
        self.other = User.objects.create_user(
            username="other2", password="pw", role="member"
        )
        self.admin = User.objects.create_superuser(username="adm2", password="pw")
        self.tool_admin = User.objects.create_user(
            username="tadm2", password="pw", role="tool_admin"
        )
        self.thread = ForumThread.objects.create(title="t", author=self.member)
        self.post = ForumPost.objects.create(
            thread=self.thread, body="x", author=self.member
        )

    # ── 通常レスポンスに実体が出ないこと ──
    def test_thread_list_hides_author(self):
        res = token_client(self.other).get("/api/forum/threads/")
        row = res.data["results"][0]
        self.assertNotIn("author", row)
        body = str(res.data)
        self.assertNotIn("secret", body)
        self.assertNotIn("秘密さん", body)

    def test_thread_detail_hides_author_even_for_admin(self):
        res = token_client(self.admin).get(f"/api/forum/threads/{self.thread.id}/")
        self.assertNotIn("author", res.data)
        self.assertNotIn("secret", str(res.data))

    def test_post_list_hides_author(self):
        res = token_client(self.other).get("/api/forum/posts/")
        self.assertNotIn("author", res.data[0])
        self.assertNotIn("secret", str(res.data))

    def test_poster_name_is_write_only(self):
        self.post.poster_name = "@kotehan"
        self.post.save()
        res = token_client(self.other).get("/api/forum/posts/")
        self.assertNotIn("poster_name", res.data[0])
        # 表示名としては出る
        self.assertEqual(res.data[0]["display_name"], "@kotehan")

    # ── 権限判定は can_edit で伝える ──
    def test_can_edit_true_for_author(self):
        res = token_client(self.member).get("/api/forum/posts/")
        self.assertTrue(res.data[0]["can_edit"])
        self.assertTrue(res.data[0]["is_mine"])

    def test_can_edit_false_for_others(self):
        res = token_client(self.other).get("/api/forum/posts/")
        self.assertFalse(res.data[0]["can_edit"])
        self.assertFalse(res.data[0]["is_mine"])

    def test_can_edit_true_for_admin(self):
        res = token_client(self.admin).get("/api/forum/posts/")
        self.assertTrue(res.data[0]["can_edit"])
        self.assertFalse(res.data[0]["is_mine"])

    # ── reveal ──
    def test_member_cannot_reveal(self):
        res = token_client(self.other).post(
            f"/api/forum/posts/{self.post.id}/reveal/"
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_reveal_post(self):
        res = token_client(self.admin).post(
            f"/api/forum/posts/{self.post.id}/reveal/", {"reason": "荒らし調査"}
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["username"], "secret")
        self.assertEqual(res.data["user_display_name"], "秘密さん")
        self.assertEqual(res.data["poster_id"], self.post.poster_id)

    def test_tool_admin_can_reveal(self):
        res = token_client(self.tool_admin).post(
            f"/api/forum/posts/{self.post.id}/reveal/"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["username"], "secret")

    def test_admin_can_reveal_thread(self):
        res = token_client(self.admin).post(
            f"/api/forum/threads/{self.thread.id}/reveal/"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["username"], "secret")

    def test_reveal_is_audit_logged(self):
        token_client(self.admin).post(
            f"/api/forum/posts/{self.post.id}/reveal/", {"reason": "調査A"}
        )
        log = ForumRevealLog.objects.get()
        self.assertEqual(log.admin, self.admin)
        self.assertEqual(log.revealed_user, self.member)
        self.assertEqual(log.target_type, "post")
        self.assertEqual(log.target_id, self.post.id)
        self.assertEqual(log.reason, "調査A")

    def test_failed_reveal_is_not_logged(self):
        token_client(self.other).post(f"/api/forum/posts/{self.post.id}/reveal/")
        self.assertEqual(ForumRevealLog.objects.count(), 0)
