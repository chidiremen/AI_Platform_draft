"""送信ログ。

Webhook はベストエフォートで送るため、失敗しても画面上は何も起きない。
それだと「通知が来ないんだけど」の切り分けができないので、送信の結果を
必ず残す。Power Automate 側のフローを組んでいる最中の確認にも使う。
"""
import uuid

from django.db import models


class WebhookDelivery(models.Model):
    class Status(models.TextChoices):
        SENT = "sent", "送信成功"
        FAILED = "failed", "送信失敗"
        SKIPPED = "skipped", "送信せず"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event = models.CharField(max_length=60, db_index=True)
    status = models.CharField(max_length=10, choices=Status.choices)
    #: HTTP ステータス。接続すらできなかった場合は null
    response_status = models.IntegerField(null=True, blank=True)
    #: 失敗理由 / 送信しなかった理由
    detail = models.CharField(max_length=300, blank=True)
    payload = models.JSONField(default=dict, blank=True)
    duration_ms = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Webhook送信ログ"
        verbose_name_plural = "Webhook送信ログ"

    def __str__(self) -> str:
        return f"{self.event} ({self.status})"
