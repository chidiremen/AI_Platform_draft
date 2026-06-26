from django.contrib import admin

from .models import (
    AccessRequest,
    AspiceProcess,
    Comment,
    CommentLike,
    Like,
    Screenshot,
    Tool,
    ToolAspiceProcess,
)


class ScreenshotInline(admin.TabularInline):
    model = Screenshot
    extra = 1


class ToolAspiceProcessInline(admin.TabularInline):
    model = ToolAspiceProcess
    extra = 1


@admin.register(AspiceProcess)
class AspiceProcessAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "category", "v_model_position", "display_order")
    list_filter = ("category", "v_model_position")
    ordering = ("display_order",)


@admin.register(Tool)
class ToolAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "tool_type",
        "author",
        "is_published",
        "created_at",
    )
    list_filter = ("tool_type", "is_published", "created_at")
    search_fields = ("title", "summary", "readme", "tags")
    readonly_fields = ("id", "created_at", "updated_at")
    inlines = [ToolAspiceProcessInline, ScreenshotInline]
    raw_id_fields = ("author", "forked_from")


@admin.register(ToolAspiceProcess)
class ToolAspiceProcessAdmin(admin.ModelAdmin):
    list_display = ("tool", "process")


@admin.register(Like)
class LikeAdmin(admin.ModelAdmin):
    list_display = ("user", "tool", "created_at")
    raw_id_fields = ("user", "tool")


@admin.register(AccessRequest)
class AccessRequestAdmin(admin.ModelAdmin):
    list_display = ("requester", "tool", "status", "created_at", "resolved_at")
    list_filter = ("status",)
    raw_id_fields = ("requester", "tool")


@admin.register(Screenshot)
class ScreenshotAdmin(admin.ModelAdmin):
    list_display = ("id", "tool", "display_order")
    raw_id_fields = ("tool",)


@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    list_display = ("id", "tool", "author", "comment_type", "parent", "created_at")
    list_filter = ("comment_type",)
    search_fields = ("body",)
    raw_id_fields = ("tool", "author", "parent")


@admin.register(CommentLike)
class CommentLikeAdmin(admin.ModelAdmin):
    list_display = ("user", "comment", "created_at")
    raw_id_fields = ("user", "comment")
