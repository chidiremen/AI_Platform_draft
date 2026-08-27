"""AI_WeeklyNews から取り込んだニュース記事。

外部プロジェクト AI_WeeklyNews（RSS 収集 → 日本語ダイジェスト生成）が出力する
``output/data/articles.jsonl`` を取り込んで保持する。

設計メモ:
  * **link（記事URL）が実質の主キー**。AI_WeeklyNews 側のデータセットが
    「追記専用・URL がプライマリキー」で運用されているため、こちらも同じ規約に
    合わせて upsert する（同じ URL の記事は 1 行に保たれる）。
  * 取り込みは冪等。同じ jsonl を何度流し込んでも件数は増えない。
  * jsonl のスキーマ揺れ（フィールドの欠落・追加）に耐えること。
    取り込み側でフィールドを固定的に要求すると、連携先の更新で簡単に壊れるため。
  * 掲示板での議論は :class:`~forum.models.ForumThread` に委譲し、
    記事 1 件につきスレッド 1 本を対応づける（`discussion_thread`）。
"""

from __future__ import annotations

import uuid

from django.db import models


class NewsArticle(models.Model):
    """取り込み済みのニュース記事 1 件。"""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    #: 記事URL。AI_WeeklyNews 側の articles.jsonl でも主キー扱いなので unique。
    link = models.URLField(max_length=1000, unique=True)
    #: 原題（多くは英語）
    title = models.CharField(max_length=500)
    #: 日本語タイトル。LLM 無しで動く運用のため、無い場合は空文字のまま。
    title_ja = models.CharField(max_length=500, blank=True)
    summary = models.TextField(blank=True)
    source = models.CharField(max_length=200, blank=True, db_index=True)
    category = models.CharField(max_length=100, blank=True, db_index=True)

    #: 記事の公開日時（フィード由来。取れないことがあるので null 許容）
    published = models.DateTimeField(null=True, blank=True, db_index=True)
    #: AI_WeeklyNews が収集した日時
    collected_at = models.DateTimeField(null=True, blank=True)

    #: サムネイル画像URL（jsonl に無い場合は空）
    thumbnail_url = models.URLField(max_length=1000, blank=True)

    #: 管理者が個別に非表示にできる（不適切・重複などの運用対応用）
    is_visible = models.BooleanField(default=True, db_index=True)

    #: 議論用の掲示板スレッド。「ディスカッションする」で作られる。
    discussion_thread = models.OneToOneField(
        "forum.ForumThread",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="news_article",
    )

    #: このプラットフォームに取り込んだ日時
    imported_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    #: 取り込み元の生データ。スキーマ揺れで取りこぼした情報を失わないための保険。
    raw = models.JSONField(default=dict, blank=True)

    class Meta:
        # 公開日時が無い記事は収集日時で並べたいので、両方を降順に見る
        ordering = ["-published", "-collected_at", "-imported_at"]
        indexes = [
            models.Index(fields=["-published"]),
            models.Index(fields=["category", "-published"]),
        ]
        verbose_name = "ニュース記事"
        verbose_name_plural = "ニュース記事"

    def __str__(self) -> str:
        return self.display_title

    @property
    def display_title(self) -> str:
        """表示用タイトル。日本語があればそちらを優先する。"""
        return self.title_ja or self.title

    @property
    def has_discussion(self) -> bool:
        return self.discussion_thread_id is not None
