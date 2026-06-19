from django.conf import settings
from django.db import models

from tools.models import Tool


class ActivityLog(models.Model):
    """A single user interaction with a tool, used to build the funnel."""

    class Action(models.TextChoices):
        IMPRESSION = "impression", "表示（一覧露出）"
        VIEW = "view", "詳細閲覧"
        README_SCROLL = "readme_scroll", "README閲覧"
        DOWNLOAD = "download", "ダウンロード/アクセス"

    id = models.BigAutoField(primary_key=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="activity_logs",
    )
    tool = models.ForeignKey(
        Tool, on_delete=models.CASCADE, related_name="activity_logs"
    )
    action = models.CharField(max_length=30, choices=Action.choices)
    created_at = models.DateTimeField(auto_now_add=True)
    session_id = models.CharField(max_length=64, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["tool", "action"]),
            models.Index(fields=["created_at"]),
        ]
        verbose_name = "アクティビティログ"
        verbose_name_plural = "アクティビティログ"

    def __str__(self) -> str:
        return f"{self.action} tool={self.tool_id}"
