from django.contrib import admin

from .models import NewsArticle


@admin.register(NewsArticle)
class NewsArticleAdmin(admin.ModelAdmin):
    list_display = (
        "display_title",
        "source",
        "category",
        "published",
        "is_visible",
        "has_discussion",
    )
    list_filter = ("is_visible", "category", "source")
    search_fields = ("title", "title_ja", "summary", "link")
    readonly_fields = ("id", "imported_at", "updated_at", "raw")
    list_editable = ("is_visible",)

    @admin.display(boolean=True, description="議論スレ")
    def has_discussion(self, obj):
        return obj.has_discussion
