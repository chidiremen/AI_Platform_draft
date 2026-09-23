from django.contrib import admin

from .models import WebhookDelivery


@admin.register(WebhookDelivery)
class WebhookDeliveryAdmin(admin.ModelAdmin):
    """通知が届かないときの切り分け用。送信結果はここを見る。"""

    list_display = ("created_at", "event", "status", "response_status", "duration_ms", "detail")
    list_filter = ("status", "event")
    search_fields = ("event", "detail")
    readonly_fields = [f.name for f in WebhookDelivery._meta.fields]

    def has_add_permission(self, request):
        return False
