"""アイデアフォーラム（2ch 風スレッド掲示板）。

「こんなツールが欲しい」といったアイデアを投下し、スレッド形式で議論する。
レスは ``number`` でスレッド内連番を持ち、本文中の ``>>3`` はクライアント側で
その番号のレスへのリンクとして解釈される。
"""

from __future__ import annotations

import hashlib
import uuid
from datetime import date

from django.conf import settings
from django.db import models, transaction
from django.db.models import Max


def make_poster_id(user_id: int | None, thread_id, on: date | None = None) -> str:
    """2ch 風の匿名 ID（日付 + ユーザー + スレッドで決まる 8 桁）。

    同じ日・同じスレッドでは同一ユーザーが同じ ID になる（＝自演が分かる）が、
    日やスレッドが変わると別 ID になる、という 2ch の挙動を模したもの。
    """
    d = (on or date.today()).isoformat()
    raw = f"{user_id or 'anon'}:{thread_id}:{d}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:8]


class ForumThread(models.Model):
    """スレッド（＝アイデア 1 件、または議論のお題 1 件）。"""

    class Category(models.TextChoices):
        IDEA = "idea", "💡 ほしいツール"
        DISCUSSION = "discussion", "🗣️ 相談・議論"
        SHARE = "share", "📣 事例共有"
        OTHER = "other", "💬 雑談"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=200)
    body = models.TextField(blank=True, help_text="1レス目の本文（Markdown）")
    category = models.CharField(
        max_length=20, choices=Category.choices, default=Category.IDEA
    )
    tags = models.CharField(max_length=200, blank=True, help_text="カンマ区切り")
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="forum_threads",
    )
    is_pinned = models.BooleanField(default=False, help_text="上部に固定")
    is_closed = models.BooleanField(default=False, help_text="レス受付を停止")
    view_count = models.IntegerField(default=0)
    #: 最終レス日時（レス投稿時に更新。一覧の既定ソートに使う）
    last_posted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-is_pinned", "-last_posted_at", "-created_at"]
        verbose_name = "フォーラムスレッド"
        verbose_name_plural = "フォーラムスレッド"

    def __str__(self) -> str:
        return self.title

    @property
    def poster_id(self) -> str:
        return make_poster_id(
            self.author_id, self.id, self.created_at.date() if self.created_at else None
        )


class ForumPost(models.Model):
    """スレッドへのレス。``number`` はスレッド内 2 始まりの連番（1 はスレ本文）。"""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    thread = models.ForeignKey(
        ForumThread, on_delete=models.CASCADE, related_name="posts"
    )
    number = models.IntegerField(help_text="スレッド内のレス番号（>>N の N）")
    body = models.TextField(help_text="Markdown。>>N でレス参照")
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="forum_posts",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["number"]
        constraints = [
            models.UniqueConstraint(
                fields=["thread", "number"], name="uniq_thread_post_number"
            ),
        ]
        verbose_name = "フォーラムレス"
        verbose_name_plural = "フォーラムレス"

    def save(self, *args, **kwargs):
        if not self.number:
            with transaction.atomic():
                # 1 はスレ本文が占めるので、レスは 2 から始まる
                current = (
                    ForumPost.objects.select_for_update()
                    .filter(thread=self.thread)
                    .aggregate(m=Max("number"))["m"]
                    or 1
                )
                self.number = current + 1
                super().save(*args, **kwargs)
                return
        super().save(*args, **kwargs)

    @property
    def poster_id(self) -> str:
        return make_poster_id(
            self.author_id,
            self.thread_id,
            self.created_at.date() if self.created_at else None,
        )

    def __str__(self) -> str:
        return f">>{self.number} @ {self.thread_id}"


class ThreadVote(models.Model):
    """スレッドへの「👍 ほしい！」投票（1 ユーザー 1 票）。"""

    id = models.BigAutoField(primary_key=True)
    thread = models.ForeignKey(
        ForumThread, on_delete=models.CASCADE, related_name="votes"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="thread_votes"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["thread", "user"], name="uniq_thread_vote_user"
            ),
        ]
        verbose_name = "スレッド投票"
        verbose_name_plural = "スレッド投票"
