import uuid

from django.conf import settings
from django.db import models


class AspiceProcess(models.Model):
    """An Automotive SPICE process area (e.g. SWE.1)."""

    class Category(models.TextChoices):
        SYS = "SYS", "システム"
        SWE = "SWE", "ソフトウェア"
        SUP = "SUP", "支援"
        MAN = "MAN", "管理"
        ACQ = "ACQ", "取得"

    class VModelPosition(models.TextChoices):
        LEFT = "left", "左辺（要件・設計）"
        BOTTOM = "bottom", "底辺（実装）"
        RIGHT = "right", "右辺（検証・テスト）"
        SUPPORT = "support", "支援プロセス"

    id = models.CharField(max_length=10, primary_key=True)
    name = models.CharField(max_length=100)
    category = models.CharField(max_length=10, choices=Category.choices)
    v_model_position = models.CharField(
        max_length=20, choices=VModelPosition.choices
    )
    display_order = models.IntegerField(default=0)

    class Meta:
        ordering = ["display_order"]
        verbose_name = "A-SPICEプロセス"
        verbose_name_plural = "A-SPICEプロセス"

    def __str__(self) -> str:
        return f"{self.id} {self.name}"


class Tool(models.Model):
    """A catalog entry for an internal AI tool."""

    class ToolType(models.TextChoices):
        COPILOT_AGENT = "copilot_agent", "Copilotエージェント"
        NOTEBOOK_LM = "notebook_lm", "NotebookLM"
        GITHUB_REPO = "github_repo", "GitHubリポジトリ"
        ZIP_UPLOAD = "zip_upload", "ZIPアップロード"
        OTHER = "other", "その他"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=200)
    summary = models.CharField(max_length=280)
    readme = models.TextField(blank=True)
    tool_type = models.CharField(
        max_length=20,
        choices=ToolType.choices,
        default=ToolType.OTHER,
    )
    access_url = models.URLField(null=True, blank=True)
    zip_file = models.FileField(
        upload_to="tool_zips/", null=True, blank=True
    )
    tags = models.CharField(max_length=500, blank=True)
    work_categories = models.JSONField(
        default=list,
        blank=True,
        help_text="作業カテゴリのタグ一覧 (例: meeting, mail, document)",
    )
    effect_qualitative = models.TextField(blank=True)
    effect_hours_per_month = models.DecimalField(
        max_digits=8, decimal_places=2, null=True, blank=True
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="tools",
    )
    forked_from = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="forks",
    )
    aspice_processes = models.ManyToManyField(
        AspiceProcess,
        through="ToolAspiceProcess",
        related_name="tools",
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_published = models.BooleanField(default=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "ツール"
        verbose_name_plural = "ツール"

    def __str__(self) -> str:
        return self.title


class ToolAspiceProcess(models.Model):
    """Through model linking a Tool to an AspiceProcess."""

    tool = models.ForeignKey(Tool, on_delete=models.CASCADE)
    process = models.ForeignKey(AspiceProcess, on_delete=models.CASCADE)

    class Meta:
        unique_together = ("tool", "process")
        verbose_name = "ツール-A-SPICE紐付け"
        verbose_name_plural = "ツール-A-SPICE紐付け"

    def __str__(self) -> str:
        return f"{self.tool_id} <-> {self.process_id}"


class Like(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="likes",
    )
    tool = models.ForeignKey(
        Tool, on_delete=models.CASCADE, related_name="likes"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("user", "tool")
        verbose_name = "いいね"
        verbose_name_plural = "いいね"

    def __str__(self) -> str:
        return f"{self.user_id} ♥ {self.tool_id}"


class AccessRequest(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "承認待ち"
        GRANTED = "granted", "承認"
        REJECTED = "rejected", "却下"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    requester = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="access_requests",
    )
    tool = models.ForeignKey(
        Tool, on_delete=models.CASCADE, related_name="access_requests"
    )
    reason = models.TextField(blank=True)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING
    )
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "アクセス申請"
        verbose_name_plural = "アクセス申請"

    def __str__(self) -> str:
        return f"{self.requester_id} -> {self.tool_id} ({self.status})"


class Screenshot(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tool = models.ForeignKey(
        Tool, on_delete=models.CASCADE, related_name="screenshots"
    )
    image = models.ImageField(upload_to="screenshots/")
    display_order = models.IntegerField(default=0)

    class Meta:
        ordering = ["display_order"]
        verbose_name = "スクリーンショット"
        verbose_name_plural = "スクリーンショット"

    def __str__(self) -> str:
        return f"screenshot:{self.id}"


class Comment(models.Model):
    """A user comment on a Tool. Supports threaded replies via `parent`."""

    class Kind(models.TextChoices):
        BUG = "bug", "バグ報告"
        FEATURE = "feature", "変更要望"
        QUESTION = "question", "質問"
        GENERAL = "general", "一般コメント"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tool = models.ForeignKey(
        Tool, on_delete=models.CASCADE, related_name="comments"
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="comments",
    )
    body = models.TextField()
    comment_type = models.CharField(
        max_length=16, choices=Kind.choices, default=Kind.GENERAL
    )
    parent = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="replies",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
        verbose_name = "コメント"
        verbose_name_plural = "コメント"

    def __str__(self) -> str:
        return f"comment:{self.id}"


class CommentLike(models.Model):
    """A "like" reaction on a comment (one per user per comment)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    comment = models.ForeignKey(
        Comment, on_delete=models.CASCADE, related_name="likes"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="comment_likes",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("comment", "user")
        verbose_name = "コメントいいね"
        verbose_name_plural = "コメントいいね"

    def __str__(self) -> str:
        return f"{self.user_id} ♥ comment:{self.comment_id}"
