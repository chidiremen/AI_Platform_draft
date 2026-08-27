from __future__ import annotations

from rest_framework import serializers

from .models import NewsArticle


class NewsArticleSerializer(serializers.ModelSerializer):
    display_title = serializers.CharField(read_only=True)
    #: 議論スレッドの ID（無ければ null）。フロントは有無でボタン文言を変える。
    discussion_thread_id = serializers.SerializerMethodField()
    #: そのスレッドのレス数。ニュース一覧に「💬 12」を出すため。
    discussion_post_count = serializers.SerializerMethodField()

    class Meta:
        model = NewsArticle
        fields = [
            "id",
            "link",
            "title",
            "title_ja",
            "display_title",
            "summary",
            "source",
            "category",
            "published",
            "collected_at",
            "thumbnail_url",
            "is_visible",
            "discussion_thread_id",
            "discussion_post_count",
            "imported_at",
        ]
        read_only_fields = [
            "id",
            "link",
            "title",
            "title_ja",
            "display_title",
            "summary",
            "source",
            "category",
            "published",
            "collected_at",
            "thumbnail_url",
            "discussion_thread_id",
            "discussion_post_count",
            "imported_at",
        ]

    def get_discussion_thread_id(self, obj) -> str | None:
        return str(obj.discussion_thread_id) if obj.discussion_thread_id else None

    def get_discussion_post_count(self, obj) -> int:
        thread = obj.discussion_thread
        if not thread:
            return 0
        # スレ本文（>>1）を含めた「レス数」として扱う
        return thread.posts.count() + 1
