from __future__ import annotations

from rest_framework import serializers

from accounts.serializers import UserSerializer

from .models import ForumPost, ForumThread


class ForumPostSerializer(serializers.ModelSerializer):
    author = UserSerializer(read_only=True)
    poster_id = serializers.CharField(read_only=True)

    class Meta:
        model = ForumPost
        fields = [
            "id",
            "thread",
            "number",
            "body",
            "author",
            "poster_id",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "number", "author", "poster_id", "created_at", "updated_at"]


class ForumThreadSerializer(serializers.ModelSerializer):
    """一覧・詳細共用。``posts`` は詳細のみ（一覧では除外して軽くする）。"""

    author = UserSerializer(read_only=True)
    poster_id = serializers.CharField(read_only=True)
    post_count = serializers.SerializerMethodField()
    vote_count = serializers.SerializerMethodField()
    voted_by_me = serializers.SerializerMethodField()
    posts = serializers.SerializerMethodField()

    class Meta:
        model = ForumThread
        fields = [
            "id",
            "title",
            "body",
            "category",
            "tags",
            "author",
            "poster_id",
            "is_pinned",
            "is_closed",
            "view_count",
            "post_count",
            "vote_count",
            "voted_by_me",
            "posts",
            "last_posted_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "author",
            "poster_id",
            "view_count",
            "last_posted_at",
            "created_at",
            "updated_at",
        ]

    def get_post_count(self, obj) -> int:
        return obj.posts.count()

    def get_vote_count(self, obj) -> int:
        return obj.votes.count()

    def get_voted_by_me(self, obj) -> bool:
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        return obj.votes.filter(user=request.user).exists()

    def get_posts(self, obj):
        # 詳細取得時のみレスを含める（ViewSet が context に with_posts を立てる）
        if not self.context.get("with_posts"):
            return None
        return ForumPostSerializer(
            obj.posts.select_related("author").all(), many=True, context=self.context
        ).data
