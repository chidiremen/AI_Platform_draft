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


#: 投稿 ID に使う文字種。2ch の ID っぽく英大小文字＋数字を混在させる。
_B62_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"


def _to_base62(digest: bytes, length: int) -> str:
    """ダイジェストのバイト列を base62 文字列に変換する。"""
    n = int.from_bytes(digest, "big")
    if n == 0:
        return _B62_ALPHABET[0] * length
    out: list[str] = []
    base = len(_B62_ALPHABET)
    while n > 0 and len(out) < length:
        n, r = divmod(n, base)
        out.append(_B62_ALPHABET[r])
    while len(out) < length:
        out.append(_B62_ALPHABET[0])
    return "".join(out)


def make_poster_id(user_id: int | None, thread_id, on: date | None = None) -> str:
    """2ch 風の匿名 ID（日付 + ユーザー + スレッドで決まる 8 桁 base62）。

    同じ日・同じスレッドでは同一ユーザーが同じ ID になる（＝自演が分かる）が、
    日やスレッドが変わると別 ID になる、という 2ch の挙動を模したもの。
    英大文字・小文字・数字が混在するので見た目も 2ch の ID に近い。

    ソルトに SECRET_KEY を混ぜているため、ID から利用者を逆算することは
    実質できない（管理者による特定は ForumThread/ForumPost.author を用いた
    専用の reveal API 経由で行う）。
    """
    d = (on or date.today()).isoformat()
    salt = getattr(settings, "SECRET_KEY", "")
    raw = f"{user_id or 'anon'}:{thread_id}:{d}:{salt}"
    return _to_base62(hashlib.sha256(raw.encode("utf-8")).digest(), 8)


#: ``ForumAnonName`` が空のときに使う既定の名無し表記。
DEFAULT_ANON_NAMES = [
    "名無しの車載開発者",
    "名無しのエンジニア",
    "名無しのA-SPICE戦士",
    "名無しのプロンプター",
    "名無しのレビュー担当",
    "名無しの品質保証",
    "名無しの組込み屋",
    "名無しのアーキテクト",
    "名無しのテスター",
    "名無しの現場担当",
]


class ForumAnonName(models.Model):
    """匿名投稿時に表示する「名無し」表記の候補。

    スレッドごとに 1 つが決定的に選ばれ、そのスレッドの匿名表記になる
    （2ch のスレごとに名無しの呼び名が違う挙動を模したもの）。

    設定方法（GUI 不要）:
      * Django 管理画面（/admin/）から追加・削除・無効化
      * ``python manage.py forum_names --list / --add 名前 / --remove 名前``
    レコードが 1 件も無い（または全て無効）場合は
    :data:`DEFAULT_ANON_NAMES` にフォールバックする。
    """

    id = models.BigAutoField(primary_key=True)
    label = models.CharField(max_length=50, unique=True, help_text="例: 名無しの開発者")
    is_active = models.BooleanField(default=True, help_text="外すと選ばれなくなる")
    order = models.IntegerField(default=0, help_text="小さい順に並ぶ（表示用）")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["order", "label"]
        verbose_name = "名無し表記"
        verbose_name_plural = "名無し表記"

    def __str__(self) -> str:
        return self.label

    @classmethod
    def active_labels(cls) -> list[str]:
        labels = list(
            cls.objects.filter(is_active=True).order_by("order", "id").values_list(
                "label", flat=True
            )
        )
        return labels or list(DEFAULT_ANON_NAMES)

    @classmethod
    def for_thread(cls, thread_id) -> str:
        """スレッド ID から決定的に 1 つ選ぶ（同じスレなら常に同じ表記）。"""
        labels = cls.active_labels()
        if not labels:
            return "名無しさん"
        h = hashlib.sha256(str(thread_id).encode("utf-8")).digest()
        return labels[int.from_bytes(h[:8], "big") % len(labels)]


def resolve_display_name(poster_name: str, thread_id) -> str:
    """表示名を決める。

    * 空欄 → そのスレッドの名無し表記
    * ``@xxx`` → 固定ハンドルとしてそのまま表示
    * それ以外 → 入力された名前をそのまま表示（単発の名乗り）
    """
    name = (poster_name or "").strip()
    if not name:
        return ForumAnonName.for_thread(thread_id)
    return name


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
    #: 投稿時に名乗った名前。空欄なら「名無し」（スレッド毎の表記）になる。
    #: 先頭が @ の場合は固定ハンドルとして扱う。
    poster_name = models.CharField(max_length=50, blank=True)
    #: 実際の投稿者。権限判定と管理者による特定にのみ使い、通常の API
    #: レスポンスには一切含めない（匿名掲示板として振る舞わせるため）。
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

    @property
    def display_name(self) -> str:
        return resolve_display_name(self.poster_name, self.id)

    @property
    def is_handle(self) -> bool:
        """固定ハンドル（@付き）で名乗っているか。"""
        return (self.poster_name or "").strip().startswith("@")


class ForumPost(models.Model):
    """スレッドへのレス。``number`` はスレッド内 2 始まりの連番（1 はスレ本文）。"""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    thread = models.ForeignKey(
        ForumThread, on_delete=models.CASCADE, related_name="posts"
    )
    number = models.IntegerField(help_text="スレッド内のレス番号（>>N の N）")
    body = models.TextField(help_text="Markdown。>>N でレス参照")
    #: 投稿時に名乗った名前。空欄なら「名無し」（スレッド毎の表記）になる。
    poster_name = models.CharField(max_length=50, blank=True)
    #: 実際の投稿者。権限判定と管理者による特定にのみ使う（API 非公開）。
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

    @property
    def display_name(self) -> str:
        return resolve_display_name(self.poster_name, self.thread_id)

    @property
    def is_handle(self) -> bool:
        return (self.poster_name or "").strip().startswith("@")

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


class ForumRevealLog(models.Model):
    """管理者が匿名投稿の投稿者を特定した記録（監査用）。

    投稿者の実体は ``ForumThread.author`` / ``ForumPost.author`` として DB に
    残っているが、通常の API レスポンスには一切含めない。管理者が特定する
    場合も専用の reveal API を明示的に呼ぶ必要があり、その操作をここに残す。
    「普段は管理者からも見えないが、必要なら特定できる」を担保する仕組み。
    """

    class Target(models.TextChoices):
        THREAD = "thread", "スレッド"
        POST = "post", "レス"

    id = models.BigAutoField(primary_key=True)
    admin = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="forum_reveals",
        help_text="特定操作を行った管理者",
    )
    target_type = models.CharField(max_length=10, choices=Target.choices)
    target_id = models.UUIDField()
    revealed_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="forum_revealed_by",
        help_text="特定された投稿者",
    )
    reason = models.CharField(max_length=200, blank=True, help_text="特定理由（任意）")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "投稿者特定ログ"
        verbose_name_plural = "投稿者特定ログ"

    def __str__(self) -> str:
        return f"{self.admin} revealed {self.target_type}:{self.target_id}"
