"""フォーラムの管理画面登録。

`名無し表記` はここから追加・削除・無効化できる（専用の GUI は作らず、
Django 管理画面と management command の 2 経路で設定する方針）。
"""

from django.contrib import admin

from .models import ForumAnonName, ForumPost, ForumRevealLog, ForumThread


@admin.register(ForumAnonName)
class ForumAnonNameAdmin(admin.ModelAdmin):
    list_display = ("label", "is_active", "order", "created_at")
    list_editable = ("is_active", "order")
    search_fields = ("label",)
    list_filter = ("is_active",)


@admin.register(ForumThread)
class ForumThreadAdmin(admin.ModelAdmin):
    list_display = ("title", "category", "display_name", "author", "created_at")
    list_filter = ("category", "is_pinned", "is_closed")
    search_fields = ("title", "body", "tags")
    readonly_fields = ("poster_id", "display_name")


@admin.register(ForumPost)
class ForumPostAdmin(admin.ModelAdmin):
    list_display = ("thread", "number", "display_name", "author", "created_at")
    search_fields = ("body",)
    readonly_fields = ("poster_id", "display_name")


@admin.register(ForumRevealLog)
class ForumRevealLogAdmin(admin.ModelAdmin):
    """監査ログは閲覧専用（改変させない）。"""

    list_display = ("created_at", "admin", "target_type", "target_id", "revealed_user")
    list_filter = ("target_type",)
    readonly_fields = (
        "admin",
        "target_type",
        "target_id",
        "revealed_user",
        "reason",
        "created_at",
    )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
