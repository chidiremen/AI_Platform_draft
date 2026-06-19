from django.contrib import admin

from .models import ActivityLog


@admin.register(ActivityLog)
class ActivityLogAdmin(admin.ModelAdmin):
    list_display = ("id", "action", "tool", "user", "created_at")
    list_filter = ("action", "created_at")
    raw_id_fields = ("tool", "user")
    search_fields = ("session_id",)
