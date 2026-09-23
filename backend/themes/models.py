"""進行中の取り組み（テーマ）と、その種になるアイデアを管理するモデル。

このアプリの狙いは「成果物になったものしか可視化できない」状態からの脱却である。

  - いま誰が何に着手していて、どこまで進んでいるかを抽出できるようにする
  - 同じことを別々にやっている人を合流（チーム化）させ、重複開発を防ぐ
  - 「アイデアはあるが自分では作れない」層の受け皿を用意する
  - 完走しなかった取り組み（凍結）も、理由とセットで知見として残す

Idea（アイデア）と Theme（テーマ）は別の入れ物にしてある。
アイデアは「作ってほしい / こんなのが欲しい」の投稿で、実装者が現れたら
Theme に昇格（promote）する。昇格元は Theme.origin_idea から辿れる。
"""
import uuid
from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone


def stalled_after_days() -> int:
    """「停滞」と見なすまでの無進捗日数。settings で変更できる。"""
    return int(getattr(settings, "THEME_STALLED_AFTER_DAYS", 30))


# --------------------------------------------------------------------------- #
# アイデア
# --------------------------------------------------------------------------- #
class Idea(models.Model):
    """「こんなのが欲しい」の投稿。実装者が見つかれば Theme に昇格する。"""

    class Status(models.TextChoices):
        OPEN = "open", "募集中"
        ADOPTED = "adopted", "テーマ化済み"
        DECLINED = "declined", "見送り"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=200)
    body = models.TextField(blank=True, help_text="Markdown")
    tags = models.CharField(max_length=200, blank=True, help_text="カンマ区切り")
    work_categories = models.JSONField(
        default=list, blank=True, help_text="業務カテゴリ id の配列（ツールと同じ軸）"
    )
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.OPEN
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="ideas"
    )
    promoted_theme = models.OneToOneField(
        "Theme",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="_promoted_from",
        help_text="昇格先のテーマ",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "アイデア"
        verbose_name_plural = "アイデア"

    def __str__(self) -> str:
        return self.title

    @property
    def vote_count(self) -> int:
        return self.votes.count()


class IdeaVote(models.Model):
    """「欲しい！」の表明。需要の大きさを測り、昇格の判断材料にする。"""

    id = models.BigAutoField(primary_key=True)
    idea = models.ForeignKey(Idea, on_delete=models.CASCADE, related_name="votes")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="idea_votes"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["idea", "user"], name="uniq_idea_vote_per_user"
            )
        ]
        verbose_name = "アイデアへの賛同"
        verbose_name_plural = "アイデアへの賛同"


class IdeaComment(models.Model):
    """アイデアへのコメント（交流用）。"""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    idea = models.ForeignKey(Idea, on_delete=models.CASCADE, related_name="comments")
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="idea_comments"
    )
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["created_at"]
        verbose_name = "アイデアへのコメント"
        verbose_name_plural = "アイデアへのコメント"


# --------------------------------------------------------------------------- #
# テーマ
# --------------------------------------------------------------------------- #
class Theme(models.Model):
    """着手中／着手予定の取り組み。

    「停滞」はステータスとして持たない。最終進捗からの経過日数で判定する
    派生値なので、放置しただけで勝手にデータが書き換わることがない。
    """

    class Status(models.TextChoices):
        RECRUITING = "recruiting", "仲間募集中"
        ACTIVE = "active", "着手中"
        FROZEN = "frozen", "凍結"
        DONE = "done", "完了"
        MERGED = "merged", "統合済み"

    #: 進捗の更新が期待されるステータス（停滞判定の対象）
    LIVE_STATUSES = frozenset({Status.RECRUITING, Status.ACTIVE})

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=200)
    summary = models.CharField(max_length=280, help_text="一覧に出る一行説明")
    body = models.TextField(blank=True, help_text="背景・目的・進め方（Markdown）")
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.ACTIVE
    )
    tags = models.CharField(max_length=200, blank=True, help_text="カンマ区切り")
    work_categories = models.JSONField(
        default=list, blank=True, help_text="業務カテゴリ id の配列（ツールと同じ軸）"
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="owned_themes"
    )

    # 凍結（失敗・中断）も成果として残すため、理由を必須にしている。
    freeze_reason = models.TextField(
        blank=True, help_text="凍結理由。何が課題で止めたのかを知見として残す"
    )
    frozen_at = models.DateTimeField(null=True, blank=True)

    # 完了時の成果物。ツールカタログと相互に辿れるようにする。
    resulting_tool = models.ForeignKey(
        "tools.Tool",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="source_themes",
        help_text="このテーマから生まれたツール",
    )

    # 重複していたテーマを合流させたときの吸収先。
    merged_into = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="merged_from",
    )
    merged_at = models.DateTimeField(null=True, blank=True)

    origin_idea = models.ForeignKey(
        Idea,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="promoted_themes",
        help_text="このテーマの元になったアイデア",
    )

    #: 最終進捗の時刻。停滞判定のたびに集計しないよう非正規化している。
    last_progress_at = models.DateTimeField(null=True, blank=True)
    view_count = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        verbose_name = "テーマ"
        verbose_name_plural = "テーマ"
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["-updated_at"]),
        ]

    def __str__(self) -> str:
        return self.title

    # -- 停滞判定 ---------------------------------------------------------- #
    @property
    def reference_time(self):
        """進捗の新しさを測る基準時刻。進捗が1件も無ければ作成日時を使う。"""
        return self.last_progress_at or self.created_at

    @property
    def days_since_progress(self) -> int | None:
        ref = self.reference_time
        if ref is None:
            return None
        return (timezone.now() - ref).days

    @property
    def is_stalled(self) -> bool:
        """一定期間進捗が無い「着手中／仲間募集中」のテーマか。

        凍結・完了・統合済みは対象外。止まっているのが正常な状態なので、
        停滞として数えるとノイズになる。
        """
        if self.status not in self.LIVE_STATUSES:
            return False
        ref = self.reference_time
        if ref is None:
            return False
        return timezone.now() - ref > timedelta(days=stalled_after_days())

    # -- メンバー ---------------------------------------------------------- #
    def is_member(self, user) -> bool:
        if not user or not user.is_authenticated:
            return False
        return self.members.filter(user=user).exists()

    def can_edit(self, user) -> bool:
        if not user or not user.is_authenticated:
            return False
        return user == self.owner or getattr(user, "is_admin_role", False)

    def touch_progress(self, when=None) -> None:
        self.last_progress_at = when or timezone.now()
        self.save(update_fields=["last_progress_at", "updated_at"])


class ThemeMember(models.Model):
    """テーマに参加しているメンバー。"""

    class Role(models.TextChoices):
        OWNER = "owner", "発起人"
        MEMBER = "member", "メンバー"

    id = models.BigAutoField(primary_key=True)
    theme = models.ForeignKey(Theme, on_delete=models.CASCADE, related_name="members")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="theme_memberships",
    )
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.MEMBER)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["joined_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["theme", "user"], name="uniq_theme_member"
            )
        ]
        verbose_name = "テーマメンバー"
        verbose_name_plural = "テーマメンバー"


class ThemeJoinRequest(models.Model):
    """合流（参加）申請。発起人が承認するとメンバーになる。"""

    class Status(models.TextChoices):
        PENDING = "pending", "承認待ち"
        APPROVED = "approved", "承認"
        REJECTED = "rejected", "却下"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    theme = models.ForeignKey(
        Theme, on_delete=models.CASCADE, related_name="join_requests"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="theme_join_requests",
    )
    message = models.TextField(blank=True, help_text="やりたいこと・できることなど")
    status = models.CharField(
        max_length=10, choices=Status.choices, default=Status.PENDING
    )
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="decided_theme_requests",
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            # 同じテーマに承認待ちの申請を二重に出せないようにする。
            models.UniqueConstraint(
                fields=["theme", "user"],
                condition=models.Q(status="pending"),
                name="uniq_pending_join_request",
            )
        ]
        verbose_name = "参加申請"
        verbose_name_plural = "参加申請"


class ThemeEntry(models.Model):
    """テーマのタイムライン1件。

    進捗・コメント・システムログを1本の時系列にまとめている。こうすると
    「どんな軌跡でここまで来たのか」が1画面で読め、ステータス変更や合流も
    同じ流れの中に残る。
    """

    class Kind(models.TextChoices):
        PROGRESS = "progress", "進捗"
        COMMENT = "comment", "コメント"
        SYSTEM = "system", "記録"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    theme = models.ForeignKey(Theme, on_delete=models.CASCADE, related_name="entries")
    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.PROGRESS)
    body = models.TextField(help_text="Markdown")
    #: 進捗率（任意）。抽出・集計しやすいよう数値でも持てるようにしてある。
    progress_percent = models.IntegerField(null=True, blank=True)
    #: 投稿時点のステータス。後から振り返ったときに文脈が失われないようにする。
    status_at_post = models.CharField(max_length=20, blank=True)
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="theme_entries",
        help_text="システム記録の場合は null",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["created_at"]
        verbose_name = "テーマの記録"
        verbose_name_plural = "テーマの記録"

    def can_edit(self, user) -> bool:
        if not user or not user.is_authenticated:
            return False
        if self.kind == self.Kind.SYSTEM:
            return False
        return user == self.author or getattr(user, "is_admin_role", False)
