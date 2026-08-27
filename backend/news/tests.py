import json
import tempfile
from io import StringIO
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.management import call_command
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient, APITestCase

from forum.models import ForumThread

from .models import NewsArticle

User = get_user_model()


def token_client(user):
    token, _ = Token.objects.get_or_create(user=user)
    c = APIClient()
    c.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
    return c


def write_jsonl(rows, suffix=".jsonl") -> Path:
    """テスト用の jsonl を一時ファイルに書き出す。"""
    f = tempfile.NamedTemporaryFile(
        mode="w", suffix=suffix, delete=False, encoding="utf-8"
    )
    for r in rows:
        f.write(r if isinstance(r, str) else json.dumps(r, ensure_ascii=False))
        f.write("\n")
    f.close()
    return Path(f.name)


ROW = {
    "collected_at": "2026-08-27T07:00:12+09:00",
    "published": "2026-08-26T18:30:00+00:00",
    "source": "OpenAI Blog",
    "category": "モデル",
    "title": "Introducing a faster model",
    "title_ja": "高速なモデルを発表",
    "summary": "要約テキスト",
    "link": "https://example.com/a",
}


class ImportNewsCommandTests(APITestCase):
    def _import(self, path, *args):
        out = StringIO()
        call_command("import_news", "--path", str(path), *args, stdout=out, stderr=StringIO())
        return out.getvalue()

    def test_imports_rows(self):
        p = write_jsonl([ROW])
        self._import(p)
        self.assertEqual(NewsArticle.objects.count(), 1)
        a = NewsArticle.objects.get()
        self.assertEqual(a.link, ROW["link"])
        self.assertEqual(a.title_ja, "高速なモデルを発表")
        self.assertEqual(a.source, "OpenAI Blog")
        self.assertIsNotNone(a.published)

    def test_is_idempotent(self):
        p = write_jsonl([ROW, ROW])
        self._import(p)
        self._import(p)
        self.assertEqual(NewsArticle.objects.count(), 1)

    def test_updates_existing_on_reimport(self):
        p1 = write_jsonl([ROW])
        self._import(p1)
        changed = dict(ROW, summary="更新後の要約")
        p2 = write_jsonl([changed])
        self._import(p2)
        self.assertEqual(NewsArticle.objects.count(), 1)
        self.assertEqual(NewsArticle.objects.get().summary, "更新後の要約")

    def test_tolerates_broken_lines(self):
        p = write_jsonl([ROW, "これはJSONではない", {"title": "linkなし"}])
        self._import(p)
        # 壊れた行と link 無しは飛ばし、正常な 1 件だけ入る
        self.assertEqual(NewsArticle.objects.count(), 1)

    def test_accepts_url_key_as_link(self):
        p = write_jsonl([{"url": "https://example.com/b", "title": "代替キー"}])
        self._import(p)
        self.assertTrue(NewsArticle.objects.filter(link="https://example.com/b").exists())

    def test_keeps_unknown_fields_in_raw(self):
        p = write_jsonl([dict(ROW, unknown_field={"nested": True}, score=0.87)])
        self._import(p)
        a = NewsArticle.objects.get()
        self.assertEqual(a.raw["unknown_field"], {"nested": True})
        self.assertEqual(a.raw["score"], 0.87)

    def test_missing_title_ja_falls_back_to_title(self):
        p = write_jsonl([{"link": "https://example.com/c", "title": "Only English"}])
        self._import(p)
        self.assertEqual(NewsArticle.objects.get().display_title, "Only English")

    def test_dry_run_writes_nothing(self):
        p = write_jsonl([ROW])
        out = self._import(p, "--dry-run")
        self.assertEqual(NewsArticle.objects.count(), 0)
        self.assertIn("dry-run", out)

    def test_limit(self):
        rows = [dict(ROW, link=f"https://example.com/{i}") for i in range(5)]
        p = write_jsonl(rows)
        self._import(p, "--limit", "2")
        self.assertEqual(NewsArticle.objects.count(), 2)

    def test_since_filters_by_published(self):
        rows = [
            dict(ROW, link="https://example.com/old", published="2026-01-01T00:00:00Z"),
            dict(ROW, link="https://example.com/new", published="2026-08-26T00:00:00Z"),
        ]
        p = write_jsonl(rows)
        self._import(p, "--since", "2026-06-01")
        self.assertEqual(NewsArticle.objects.count(), 1)
        self.assertEqual(NewsArticle.objects.get().link, "https://example.com/new")

    def test_directory_source_reads_all_jsonl(self):
        d = Path(tempfile.mkdtemp())
        (d / "a.jsonl").write_text(
            json.dumps(dict(ROW, link="https://example.com/1")) + "\n", encoding="utf-8"
        )
        (d / "b.jsonl").write_text(
            json.dumps(dict(ROW, link="https://example.com/2")) + "\n", encoding="utf-8"
        )
        (d / "ignored.txt").write_text("not jsonl", encoding="utf-8")
        self._import(d)
        self.assertEqual(NewsArticle.objects.count(), 2)

    def test_missing_source_reports_clearly(self):
        out = self._import("/nonexistent/path/articles.jsonl")
        self.assertIn("見つかりません", out)
        self.assertEqual(NewsArticle.objects.count(), 0)

    def test_date_only_published_is_parsed(self):
        p = write_jsonl([{"link": "https://example.com/d", "title": "t", "published": "2026-08-23"}])
        self._import(p)
        self.assertIsNotNone(NewsArticle.objects.get().published)


class NewsApiTests(APITestCase):
    def setUp(self):
        self.member = User.objects.create_user(
            username="nm", password="pw", role="member"
        )
        self.admin = User.objects.create_superuser(username="nadmin", password="pw")
        self.a1 = NewsArticle.objects.create(
            link="https://example.com/1",
            title="Alpha news",
            title_ja="アルファのニュース",
            summary="要約1",
            source="Source A",
            category="モデル",
        )
        self.a2 = NewsArticle.objects.create(
            link="https://example.com/2",
            title="Beta news",
            summary="要約2",
            source="Source B",
            category="研究",
        )

    def test_requires_auth(self):
        res = APIClient().get("/api/news/")
        self.assertIn(
            res.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )

    def test_list(self):
        res = token_client(self.member).get("/api/news/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["count"], 2)

    def test_search_filter(self):
        c = token_client(self.member)
        self.assertEqual(len(c.get("/api/news/?q=アルファ").data["results"]), 1)
        self.assertEqual(len(c.get("/api/news/?category=研究").data["results"]), 1)
        self.assertEqual(len(c.get("/api/news/?source=Source A").data["results"]), 1)

    def test_limit(self):
        res = token_client(self.member).get("/api/news/?limit=1")
        self.assertEqual(len(res.data["results"]), 1)

    def test_meta_returns_facets(self):
        res = token_client(self.member).get("/api/news/meta/")
        self.assertEqual(res.data["count"], 2)
        self.assertEqual(res.data["categories"], ["モデル", "研究"])
        self.assertEqual(res.data["sources"], ["Source A", "Source B"])

    def test_display_title_prefers_japanese(self):
        res = token_client(self.member).get(f"/api/news/{self.a1.id}/")
        self.assertEqual(res.data["display_title"], "アルファのニュース")
        res = token_client(self.member).get(f"/api/news/{self.a2.id}/")
        self.assertEqual(res.data["display_title"], "Beta news")

    def test_hidden_article_invisible_to_member_but_visible_to_admin(self):
        self.a2.is_visible = False
        self.a2.save()
        self.assertEqual(len(token_client(self.member).get("/api/news/").data["results"]), 1)
        self.assertEqual(len(token_client(self.admin).get("/api/news/").data["results"]), 2)

    def test_toggle_visible_admin_only(self):
        res = token_client(self.member).post(f"/api/news/{self.a1.id}/toggle-visible/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        res = token_client(self.admin).post(f"/api/news/{self.a1.id}/toggle-visible/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.a1.refresh_from_db()
        self.assertFalse(self.a1.is_visible)


class NewsDiscussTests(APITestCase):
    def setUp(self):
        self.member = User.objects.create_user(
            username="dm", password="pw", role="member"
        )
        self.other = User.objects.create_user(
            username="do", password="pw", role="member"
        )
        self.article = NewsArticle.objects.create(
            link="https://example.com/x",
            title="Discussable",
            title_ja="議論できるニュース",
            summary="要約テキスト",
            source="Source X",
            category="モデル",
        )

    def test_creates_thread_on_first_call(self):
        res = token_client(self.member).post(f"/api/news/{self.article.id}/discuss/")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(res.data["created"])
        thread = ForumThread.objects.get(id=res.data["thread_id"])
        self.assertIn("議論できるニュース", thread.title)
        # 1レス目に元記事リンクと要約が入る
        self.assertIn(self.article.link, thread.body)
        self.assertIn("要約テキスト", thread.body)

    def test_second_call_returns_same_thread(self):
        first = token_client(self.member).post(f"/api/news/{self.article.id}/discuss/")
        second = token_client(self.other).post(f"/api/news/{self.article.id}/discuss/")
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertFalse(second.data["created"])
        self.assertEqual(first.data["thread_id"], second.data["thread_id"])
        self.assertEqual(ForumThread.objects.count(), 1)

    def test_article_exposes_thread_id_and_count(self):
        c = token_client(self.member)
        before = c.get(f"/api/news/{self.article.id}/")
        self.assertIsNone(before.data["discussion_thread_id"])
        self.assertEqual(before.data["discussion_post_count"], 0)

        c.post(f"/api/news/{self.article.id}/discuss/")
        after = c.get(f"/api/news/{self.article.id}/")
        self.assertIsNotNone(after.data["discussion_thread_id"])
        # スレ本文（>>1）を 1 件として数える
        self.assertEqual(after.data["discussion_post_count"], 1)

    def test_thread_is_anonymous(self):
        """ニュース起点のスレも掲示板の匿名ルールに従う。"""
        res = token_client(self.member).post(f"/api/news/{self.article.id}/discuss/")
        thread = ForumThread.objects.get(id=res.data["thread_id"])
        self.assertEqual(thread.poster_name, "")
        self.assertTrue(thread.display_name.startswith("名無し"))
        # API レスポンスに投稿者の実体が出ないこと
        detail = token_client(self.other).get(f"/api/forum/threads/{thread.id}/")
        self.assertNotIn("author", detail.data)
        self.assertNotIn("dm", str(detail.data))
