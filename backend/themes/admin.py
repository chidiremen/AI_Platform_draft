from django.contrib import admin

from .models import (
    Idea,
    IdeaComment,
    IdeaVote,
    Theme,
    ThemeEntry,
    ThemeJoinRequest,
    ThemeMember,
)


class ThemeMemberInline(admin.TabularInline):
    model = ThemeMember
    extra = 0


@admin.register(Theme)
class ThemeAdmin(admin.ModelAdmin):
    list_display = ("title", "status", "owner", "last_progress_at", "updated_at")
    list_filter = ("status",)
    search_fields = ("title", "summary", "tags")
    inlines = [ThemeMemberInline]


@admin.register(ThemeEntry)
class ThemeEntryAdmin(admin.ModelAdmin):
    list_display = ("theme", "kind", "author", "progress_percent", "created_at")
    list_filter = ("kind",)


@admin.register(ThemeJoinRequest)
class ThemeJoinRequestAdmin(admin.ModelAdmin):
    list_display = ("theme", "user", "status", "created_at")
    list_filter = ("status",)


@admin.register(Idea)
class IdeaAdmin(admin.ModelAdmin):
    list_display = ("title", "status", "author", "created_at")
    list_filter = ("status",)
    search_fields = ("title", "body", "tags")


admin.site.register([IdeaVote, IdeaComment, ThemeMember])
