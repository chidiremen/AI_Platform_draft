from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient, APITestCase

from .models import Answer, DocCategory, Question

User = get_user_model()


def token_client(user):
    token, _ = Token.objects.get_or_create(user=user)
    c = APIClient()
    c.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
    return c


class DocsPermissionTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(username="a", password="p")
        self.tool_admin = User.objects.create_user(
            username="ta", password="p", role="tool_admin"
        )
        self.member = User.objects.create_user(
            username="m", password="p", role="member"
        )
        self.cat_guide = DocCategory.objects.create(
            kind="guide", slug="s", name="Section"
        )
        self.cat_qa = DocCategory.objects.create(kind="qa", slug="u", name="Usage")

    # ── ガイド記事 ──
    def test_member_can_read_guides_but_not_create(self):
        res = token_client(self.member).get("/api/guides/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        res = token_client(self.member).post(
            "/api/guides/",
            {"category": self.cat_guide.id, "title": "t", "slug": "t", "body": ""},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_create_guide(self):
        res = token_client(self.admin).post(
            "/api/guides/",
            {"category": self.cat_guide.id, "title": "t", "slug": "t", "body": "b"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    def test_tool_admin_can_create_guide(self):
        res = token_client(self.tool_admin).post(
            "/api/guides/",
            {"category": self.cat_guide.id, "title": "t", "slug": "t", "body": "b"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    # ── 質問 ──
    def test_member_can_ask_question(self):
        res = token_client(self.member).post(
            "/api/questions/",
            {"category": self.cat_qa.id, "title": "q?", "body": "help"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["asker"]["username"], "m")

    def test_question_view_count_increments_on_detail(self):
        q = Question.objects.create(title="a", body="b", asker=self.member)
        c = token_client(self.member)
        self.assertEqual(c.get(f"/api/questions/{q.id}/").data["view_count"], 1)
        c.get(f"/api/questions/{q.id}/")
        self.assertEqual(c.get(f"/api/questions/{q.id}/").data["view_count"], 3)

    def test_question_filter_search_and_resolved(self):
        Question.objects.create(title="Alpha", body="a", asker=self.member)
        Question.objects.create(
            title="Beta", body="b", asker=self.member, is_resolved=True
        )
        c = token_client(self.member)
        self.assertEqual(len(c.get("/api/questions/?q=Alpha").data["results"]), 1)
        self.assertEqual(len(c.get("/api/questions/?resolved=true").data["results"]), 1)
        self.assertEqual(len(c.get("/api/questions/?resolved=false").data["results"]), 1)
        self.assertEqual(len(c.get("/api/questions/?mine=true").data["results"]), 2)

    # ── 回答 ──
    def test_member_cannot_answer(self):
        q = Question.objects.create(title="a", asker=self.member)
        res = token_client(self.member).post(
            "/api/answers/", {"question": str(q.id), "body": "x"}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_answer_and_accept(self):
        q = Question.objects.create(title="a", asker=self.member)
        res = token_client(self.tool_admin).post(
            "/api/answers/", {"question": str(q.id), "body": "x"}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        ans_id = res.data["id"]
        # 質問者が accept → question.is_resolved も True
        res = token_client(self.member).post(f"/api/answers/{ans_id}/accept/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data["is_accepted"])
        q.refresh_from_db()
        self.assertTrue(q.is_resolved)

    def test_third_party_cannot_accept(self):
        q = Question.objects.create(title="a", asker=self.member)
        a = Answer.objects.create(question=q, body="x", author=self.tool_admin)
        other = User.objects.create_user(username="o", password="p", role="member")
        res = token_client(other).post(f"/api/answers/{a.id}/accept/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_toggle_resolved_by_owner_or_admin(self):
        q = Question.objects.create(title="a", asker=self.member)
        other = User.objects.create_user(username="o2", password="p", role="member")
        res = token_client(other).post(f"/api/questions/{q.id}/toggle-resolved/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        res = token_client(self.member).post(f"/api/questions/{q.id}/toggle-resolved/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data["is_resolved"])

    def test_edit_own_question(self):
        q = Question.objects.create(title="a", body="b", asker=self.member)
        res = token_client(self.member).patch(
            f"/api/questions/{q.id}/", {"title": "改題"}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["title"], "改題")

    def test_delete_own_question(self):
        q = Question.objects.create(title="a", asker=self.member)
        res = token_client(self.member).delete(f"/api/questions/{q.id}/")
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)


class DocCategoryTests(APITestCase):
    def test_kind_filter(self):
        DocCategory.objects.create(kind="guide", slug="a", name="A")
        DocCategory.objects.create(kind="qa", slug="b", name="B")
        user = User.objects.create_user(username="u", password="p")
        c = token_client(user)
        self.assertEqual(len(c.get("/api/doc-categories/?kind=guide").data), 1)
        self.assertEqual(len(c.get("/api/doc-categories/?kind=qa").data), 1)
