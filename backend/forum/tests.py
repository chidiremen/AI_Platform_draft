from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient, APITestCase

from .models import ForumPost, ForumThread, ThreadVote, make_poster_id

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
        self.assertEqual(res.data["author"]["username"], "m")
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
