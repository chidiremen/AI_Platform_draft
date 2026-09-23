"""テーマ / アイデア機能のテスト。

この機能の目的（重複開発の抑止・途中経過と失敗の可視化）が、API として
成立しているかを確認する。
"""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient, APITestCase

from themes.models import Idea, Theme, ThemeEntry, ThemeJoinRequest, ThemeMember
from tools.models import Tool

User = get_user_model()


class ThemeTestBase(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner", password="pw", role="member", display_name="発起人"
        )
        self.other = User.objects.create_user(
            username="other", password="pw", role="member", display_name="別の人"
        )
        self.admin = User.objects.create_user(
            username="adm", password="pw", role="admin"
        )
        self.client = self._client(self.owner)

    def _client(self, user):
        token, _ = Token.objects.get_or_create(user=user)
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        return c

    def _list(self, url, client=None):
        """一覧APIのレスポンスから results を取り出す。

        DRF の PageNumberPagination が全体で有効なので、一覧は
        {count, next, previous, results} で返る。
        """
        res = (client or self.client).get(url)
        assert res.status_code == status.HTTP_200_OK, res.data
        return res.data["results"]

    def _create_theme(self, client=None, **overrides):
        payload = {
            "title": "議事録の自動要約",
            "summary": "Teams の議事録を要約する",
            "body": "## 背景\n手作業がつらい",
            "status": "active",
            "tags": ["議事録", "要約"],
            "work_categories": ["meeting"],
        }
        payload.update(overrides)
        res = (client or self.client).post("/api/themes/", payload, format="json")
        assert res.status_code == status.HTTP_201_CREATED, res.data
        return res.data


class ThemeCrudTests(ThemeTestBase):
    def test_create_registers_owner_as_member_and_logs_timeline(self):
        data = self._create_theme()
        theme = Theme.objects.get(pk=data["id"])
        self.assertEqual(theme.owner, self.owner)
        self.assertTrue(
            theme.members.filter(user=self.owner, role=ThemeMember.Role.OWNER).exists()
        )
        # 軌跡が残ること自体がこの機能の価値なので、登録も記録する
        self.assertTrue(theme.entries.filter(kind=ThemeEntry.Kind.SYSTEM).exists())

    def test_tags_round_trip_as_list(self):
        data = self._create_theme(tags=["a", "b"])
        self.assertEqual(data["tags"], ["a", "b"])
        res = self.client.get(f"/api/themes/{data['id']}/")
        self.assertEqual(res.data["tags"], ["a", "b"])

    def test_detail_includes_members_and_entries_but_list_does_not(self):
        data = self._create_theme()
        detail = self.client.get(f"/api/themes/{data['id']}/").data
        self.assertIsNotNone(detail["members"])
        self.assertIsNotNone(detail["entries"])
        row = self._list("/api/themes/")[0]
        self.assertIsNone(row["members"])
        self.assertIsNone(row["entries"])

    def test_non_owner_cannot_edit(self):
        data = self._create_theme()
        res = self._client(self.other).patch(
            f"/api/themes/{data['id']}/", {"title": "乗っ取り"}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_edit_any_theme(self):
        data = self._create_theme()
        res = self._client(self.admin).patch(
            f"/api/themes/{data['id']}/", {"title": "整理"}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)

    def test_status_change_is_recorded_on_the_timeline(self):
        data = self._create_theme()
        self.client.patch(
            f"/api/themes/{data['id']}/", {"status": "recruiting"}, format="json"
        )
        bodies = list(
            ThemeEntry.objects.filter(
                theme_id=data["id"], kind=ThemeEntry.Kind.SYSTEM
            ).values_list("body", flat=True)
        )
        self.assertTrue(any("ステータス" in b for b in bodies), bodies)

    def test_unauthenticated_is_rejected(self):
        self.assertEqual(
            APIClient().get("/api/themes/").status_code, status.HTTP_401_UNAUTHORIZED
        )


class ThemeProgressTests(ThemeTestBase):
    def test_member_can_post_progress_and_it_updates_last_progress_at(self):
        data = self._create_theme()
        res = self.client.post(
            f"/api/themes/{data['id']}/entries/",
            {"kind": "progress", "body": "プロトタイプができた", "progress_percent": 40},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        theme = Theme.objects.get(pk=data["id"])
        self.assertIsNotNone(theme.last_progress_at)
        # 投稿時のステータスを残すので、後から文脈が読める
        self.assertEqual(res.data["status_at_post"], "active")

    def test_non_member_cannot_post_progress(self):
        data = self._create_theme()
        res = self._client(self.other).post(
            f"/api/themes/{data['id']}/entries/",
            {"kind": "progress", "body": "勝手に進捗"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_non_member_can_post_comment(self):
        """外からの助言や「それ自分もやってる」を拾えるようにしている。"""
        data = self._create_theme()
        res = self._client(self.other).post(
            f"/api/themes/{data['id']}/entries/",
            {"kind": "comment", "body": "似たことをやっています"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)

    def test_comment_does_not_count_as_progress(self):
        data = self._create_theme()
        self._client(self.other).post(
            f"/api/themes/{data['id']}/entries/",
            {"kind": "comment", "body": "がんばって"},
            format="json",
        )
        self.assertIsNone(Theme.objects.get(pk=data["id"]).last_progress_at)

    def test_progress_percent_is_bounded(self):
        data = self._create_theme()
        res = self.client.post(
            f"/api/themes/{data['id']}/entries/",
            {"kind": "progress", "body": "x", "progress_percent": 120},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_system_entries_cannot_be_posted_or_edited(self):
        data = self._create_theme()
        res = self.client.post(
            f"/api/themes/{data['id']}/entries/",
            {"kind": "system", "body": "偽の記録"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        sys_entry = ThemeEntry.objects.filter(
            theme_id=data["id"], kind=ThemeEntry.Kind.SYSTEM
        ).first()
        res = self.client.patch(
            f"/api/theme-entries/{sys_entry.id}/", {"body": "改ざん"}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_author_can_edit_own_entry(self):
        data = self._create_theme()
        entry = self.client.post(
            f"/api/themes/{data['id']}/entries/",
            {"kind": "progress", "body": "初稿"},
            format="json",
        ).data
        res = self.client.patch(
            f"/api/theme-entries/{entry['id']}/", {"body": "修正"}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)


@override_settings(THEME_STALLED_AFTER_DAYS=30)
class ThemeStalledTests(ThemeTestBase):
    def _age(self, theme_id, days):
        """作成日時と最終進捗を過去にずらす（停滞の再現）。"""
        past = timezone.now() - timedelta(days=days)
        Theme.objects.filter(pk=theme_id).update(created_at=past, last_progress_at=past)

    def test_fresh_theme_is_not_stalled(self):
        data = self._create_theme()
        self.assertFalse(self.client.get(f"/api/themes/{data['id']}/").data["is_stalled"])

    def test_theme_without_progress_for_a_long_time_is_stalled(self):
        data = self._create_theme()
        self._age(data["id"], 40)
        detail = self.client.get(f"/api/themes/{data['id']}/").data
        self.assertTrue(detail["is_stalled"])
        self.assertGreaterEqual(detail["days_since_progress"], 40)

    def test_frozen_theme_is_never_stalled(self):
        """止まっているのが正常な状態なので、停滞として数えない。"""
        data = self._create_theme()
        self.client.post(
            f"/api/themes/{data['id']}/freeze/", {"reason": "精度が出ない"}, format="json"
        )
        self._age(data["id"], 100)
        self.assertFalse(self.client.get(f"/api/themes/{data['id']}/").data["is_stalled"])

    def test_stalled_filter_matches_the_derived_flag(self):
        fresh = self._create_theme(title="新しい")
        old = self._create_theme(title="古い")
        self._age(old["id"], 60)
        ids = [t["id"] for t in self._list("/api/themes/?stalled=true")]
        self.assertIn(old["id"], ids)
        self.assertNotIn(fresh["id"], ids)

    @override_settings(THEME_STALLED_AFTER_DAYS=7)
    def test_threshold_is_configurable(self):
        data = self._create_theme()
        self._age(data["id"], 10)
        detail = self.client.get(f"/api/themes/{data['id']}/").data
        self.assertTrue(detail["is_stalled"])
        self.assertEqual(detail["stalled_after_days"], 7)


class ThemeFreezeTests(ThemeTestBase):
    def test_freeze_requires_a_reason(self):
        """失敗の中身こそ残す価値があるので、理由なしの凍結は通さない。"""
        data = self._create_theme()
        res = self.client.post(f"/api/themes/{data['id']}/freeze/", {}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        res = self.client.post(
            f"/api/themes/{data['id']}/freeze/", {"reason": "   "}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_freeze_records_reason_and_timeline(self):
        data = self._create_theme()
        res = self.client.post(
            f"/api/themes/{data['id']}/freeze/",
            {"reason": "社内データでは精度が出ず断念"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual(res.data["status"], "frozen")
        self.assertIn("精度", res.data["freeze_reason"])
        self.assertIsNotNone(res.data["frozen_at"])
        bodies = ThemeEntry.objects.filter(theme_id=data["id"]).values_list("body", flat=True)
        self.assertTrue(any("凍結" in b for b in bodies))

    def test_reopen_keeps_the_reason_as_history(self):
        data = self._create_theme()
        self.client.post(
            f"/api/themes/{data['id']}/freeze/", {"reason": "一旦保留"}, format="json"
        )
        res = self.client.post(f"/api/themes/{data['id']}/reopen/", {}, format="json")
        self.assertEqual(res.data["status"], "active")
        self.assertIsNone(res.data["frozen_at"])
        self.assertEqual(res.data["freeze_reason"], "一旦保留")

    def test_only_owner_can_freeze(self):
        data = self._create_theme()
        res = self._client(self.other).post(
            f"/api/themes/{data['id']}/freeze/", {"reason": "やめろ"}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


class ThemeJoinTests(ThemeTestBase):
    def test_join_request_then_approval_makes_a_member(self):
        data = self._create_theme()
        other = self._client(self.other)
        req = other.post(
            f"/api/themes/{data['id']}/join/", {"message": "手伝えます"}, format="json"
        )
        self.assertEqual(req.status_code, status.HTTP_201_CREATED, req.data)

        res = self.client.post(
            f"/api/themes/{data['id']}/join-requests/{req.data['id']}/resolve/",
            {"status": "approved"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertTrue(Theme.objects.get(pk=data["id"]).is_member(self.other))

    def test_rejected_request_does_not_add_a_member(self):
        data = self._create_theme()
        req = self._client(self.other).post(f"/api/themes/{data['id']}/join/", {}, format="json")
        self.client.post(
            f"/api/themes/{data['id']}/join-requests/{req.data['id']}/resolve/",
            {"status": "rejected"},
            format="json",
        )
        self.assertFalse(Theme.objects.get(pk=data["id"]).is_member(self.other))

    def test_cannot_request_twice(self):
        data = self._create_theme()
        other = self._client(self.other)
        other.post(f"/api/themes/{data['id']}/join/", {}, format="json")
        res = other.post(f"/api/themes/{data['id']}/join/", {}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_owner_cannot_request_to_join_own_theme(self):
        data = self._create_theme()
        res = self.client.post(f"/api/themes/{data['id']}/join/", {}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_only_owner_sees_join_requests(self):
        data = self._create_theme()
        self._client(self.other).post(f"/api/themes/{data['id']}/join/", {}, format="json")
        self.assertEqual(
            self._client(self.other).get(f"/api/themes/{data['id']}/join-requests/").status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.get(f"/api/themes/{data['id']}/join-requests/").status_code,
            status.HTTP_200_OK,
        )

    def test_member_can_leave_but_owner_cannot(self):
        data = self._create_theme()
        req = self._client(self.other).post(f"/api/themes/{data['id']}/join/", {}, format="json")
        self.client.post(
            f"/api/themes/{data['id']}/join-requests/{req.data['id']}/resolve/",
            {"status": "approved"},
            format="json",
        )
        self.assertEqual(
            self._client(self.other).post(f"/api/themes/{data['id']}/leave/").status_code,
            status.HTTP_204_NO_CONTENT,
        )
        self.assertEqual(
            self.client.post(f"/api/themes/{data['id']}/leave/").status_code,
            status.HTTP_400_BAD_REQUEST,
        )

    def test_my_join_request_status_is_exposed_to_the_requester(self):
        data = self._create_theme()
        other = self._client(self.other)
        other.post(f"/api/themes/{data['id']}/join/", {}, format="json")
        self.assertEqual(
            other.get(f"/api/themes/{data['id']}/").data["my_join_request_status"],
            "pending",
        )


class ThemeMergeTests(ThemeTestBase):
    def test_merge_moves_members_and_progress_to_the_target(self):
        mine = self._create_theme(title="こっちを吸収させる")
        target = self._create_theme(client=self._client(self.other), title="合流先")
        self.client.post(
            f"/api/themes/{mine['id']}/entries/",
            {"kind": "progress", "body": "ここまでやった"},
            format="json",
        )

        res = self.client.post(
            f"/api/themes/{mine['id']}/merge/", {"target": target["id"]}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)

        merged = Theme.objects.get(pk=mine["id"])
        self.assertEqual(merged.status, "merged")
        self.assertEqual(str(merged.merged_into_id), target["id"])
        # 進捗の軌跡は合流先へ移る
        self.assertTrue(
            ThemeEntry.objects.filter(
                theme_id=target["id"], body="ここまでやった"
            ).exists()
        )
        # 吸収された側の発起人は合流先のメンバーになる
        self.assertTrue(Theme.objects.get(pk=target["id"]).is_member(self.owner))

    def test_merge_target_last_progress_is_recalculated(self):
        mine = self._create_theme(title="A")
        target = self._create_theme(client=self._client(self.other), title="B")
        self.client.post(
            f"/api/themes/{mine['id']}/entries/",
            {"kind": "progress", "body": "進捗"},
            format="json",
        )
        self.client.post(
            f"/api/themes/{mine['id']}/merge/", {"target": target["id"]}, format="json"
        )
        self.assertIsNotNone(Theme.objects.get(pk=target["id"]).last_progress_at)

    def test_cannot_merge_into_itself(self):
        mine = self._create_theme()
        res = self.client.post(
            f"/api/themes/{mine['id']}/merge/", {"target": mine["id"]}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_only_owner_can_merge(self):
        mine = self._create_theme()
        target = self._create_theme(client=self._client(self.other), title="B")
        res = self._client(self.other).post(
            f"/api/themes/{mine['id']}/merge/", {"target": target["id"]}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_cannot_join_a_merged_theme(self):
        mine = self._create_theme()
        target = self._create_theme(client=self._client(self.other), title="B")
        self.client.post(
            f"/api/themes/{mine['id']}/merge/", {"target": target["id"]}, format="json"
        )
        res = self._client(self.admin).post(f"/api/themes/{mine['id']}/join/", {}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)


class ThemeSimilarTests(ThemeTestBase):
    def test_similar_finds_overlapping_titles_and_tags(self):
        """登録前に重複を気づかせるのがこの API の役目。"""
        self._create_theme(title="議事録の自動要約", tags=["議事録", "要約"])
        res = self.client.get(
            "/api/themes/similar/?title=議事録 要約 ツール&tags=議事録"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(any("議事録" in t["title"] for t in res.data), res.data)

    def test_similar_returns_nothing_without_input(self):
        self._create_theme()
        self.assertEqual(self.client.get("/api/themes/similar/").data, [])

    def test_similar_excludes_merged_and_self(self):
        mine = self._create_theme(title="議事録の自動要約")
        res = self.client.get(
            f"/api/themes/similar/?title=議事録の自動要約&exclude={mine['id']}"
        )
        self.assertNotIn(mine["id"], [t["id"] for t in res.data])

    def test_unrelated_theme_is_not_suggested(self):
        self._create_theme(title="議事録の自動要約", tags=["議事録"])
        res = self.client.get("/api/themes/similar/?title=経費精算の自動化")
        self.assertEqual(list(res.data), [])


class ThemeToolLinkTests(ThemeTestBase):
    def test_completed_theme_can_point_at_a_registered_tool(self):
        tool = Tool.objects.create(
            title="議事録要約くん", summary="s", tool_type="other", author=self.owner
        )
        data = self._create_theme()
        res = self.client.patch(
            f"/api/themes/{data['id']}/",
            {"status": "done", "resulting_tool": str(tool.id)},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual(res.data["resulting_tool_title"], "議事録要約くん")
        # ツール側からも経緯が辿れる
        self.assertEqual(tool.source_themes.count(), 1)


class IdeaTests(ThemeTestBase):
    def _create_idea(self, client=None, **overrides):
        payload = {"title": "経費精算を自動化したい", "body": "毎月つらい", "tags": ["経費"]}
        payload.update(overrides)
        res = (client or self.client).post("/api/ideas/", payload, format="json")
        assert res.status_code == status.HTTP_201_CREATED, res.data
        return res.data

    def test_create_and_vote_toggle(self):
        idea = self._create_idea()
        other = self._client(self.other)
        res = other.post(f"/api/ideas/{idea['id']}/vote/")
        self.assertEqual(res.data, {"voted_by_me": True, "vote_count": 1})
        res = other.post(f"/api/ideas/{idea['id']}/vote/")
        self.assertEqual(res.data, {"voted_by_me": False, "vote_count": 0})

    def test_comments_round_trip(self):
        idea = self._create_idea()
        res = self._client(self.other).post(
            f"/api/ideas/{idea['id']}/comments/", {"body": "欲しい"}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        detail = self.client.get(f"/api/ideas/{idea['id']}/").data
        self.assertEqual(len(detail["comments"]), 1)
        self.assertEqual(detail["comment_count"], 1)

    def test_promote_creates_a_theme_owned_by_the_volunteer(self):
        """アイデアを出した人ではなく、手を挙げた人が発起人になる。"""
        idea = self._create_idea()
        res = self._client(self.other).post(f"/api/ideas/{idea['id']}/promote/", {}, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        theme = Theme.objects.get(pk=res.data["id"])
        self.assertEqual(theme.owner, self.other)
        self.assertEqual(str(theme.origin_idea_id), idea["id"])
        self.assertEqual(theme.tags, "経費")

        idea_after = self.client.get(f"/api/ideas/{idea['id']}/").data
        self.assertEqual(idea_after["status"], "adopted")
        # res.data は JSON レンダリング前なので UUID オブジェクトのまま入る
        # （実際にフロントへ届く JSON では文字列になる）
        self.assertEqual(str(idea_after["promoted_theme"]), str(theme.id))

    def test_cannot_promote_twice(self):
        idea = self._create_idea()
        self._client(self.other).post(f"/api/ideas/{idea['id']}/promote/", {}, format="json")
        res = self.client.post(f"/api/ideas/{idea['id']}/promote/", {}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_order_by_votes(self):
        quiet = self._create_idea(title="静か")
        loud = self._create_idea(title="人気")
        self._client(self.other).post(f"/api/ideas/{loud['id']}/vote/")
        ids = [i["id"] for i in self._list("/api/ideas/?order=votes")]
        self.assertLess(ids.index(loud["id"]), ids.index(quiet["id"]))

    def test_non_author_cannot_edit_idea(self):
        idea = self._create_idea()
        res = self._client(self.other).patch(
            f"/api/ideas/{idea['id']}/", {"title": "改変"}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


@override_settings(THEME_STALLED_AFTER_DAYS=30)
class ThemeSummaryTests(ThemeTestBase):
    def test_summary_reports_counts_and_frozen_reasons(self):
        """部門として「いま何が動いているか」を1発で取れること。"""
        active = self._create_theme(title="動いてる")
        frozen = self._create_theme(title="止まった")
        self.client.post(
            f"/api/themes/{frozen['id']}/freeze/",
            {"reason": "データが足りなかった"},
            format="json",
        )
        stale = self._create_theme(title="放置")
        Theme.objects.filter(pk=stale["id"]).update(
            created_at=timezone.now() - timedelta(days=90),
            last_progress_at=timezone.now() - timedelta(days=90),
        )
        Idea.objects.create(title="i", author=self.owner)

        res = self.client.get("/api/themes/summary/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["total"], 3)
        self.assertEqual(res.data["by_status"]["active"], 2)
        self.assertEqual(res.data["by_status"]["frozen"], 1)
        self.assertEqual(res.data["stalled"], 1)
        self.assertEqual(res.data["idea_open"], 1)
        self.assertEqual(res.data["stalled_after_days"], 30)
        reasons = [r["reason"] for r in res.data["frozen_reasons"]]
        self.assertIn("データが足りなかった", reasons)

    def test_mine_filter_includes_themes_joined_as_member(self):
        mine = self._create_theme(title="自分の")
        theirs = self._create_theme(client=self._client(self.other), title="他人の")
        req = self.client.post(f"/api/themes/{theirs['id']}/join/", {}, format="json")
        self._client(self.other).post(
            f"/api/themes/{theirs['id']}/join-requests/{req.data['id']}/resolve/",
            {"status": "approved"},
            format="json",
        )
        ids = [t["id"] for t in self._list("/api/themes/?mine=true")]
        self.assertCountEqual(ids, [mine["id"], theirs["id"]])
