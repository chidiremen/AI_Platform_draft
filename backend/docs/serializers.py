from __future__ import annotations

from rest_framework import serializers

from accounts.serializers import UserSerializer

from .models import Answer, DocAttachment, DocCategory, GuideArticle, Question


class DocCategorySerializer(serializers.ModelSerializer):
    article_count = serializers.SerializerMethodField()
    question_count = serializers.SerializerMethodField()

    class Meta:
        model = DocCategory
        fields = [
            "id",
            "kind",
            "name",
            "slug",
            "parent",
            "order",
            "icon",
            "article_count",
            "question_count",
        ]

    def get_article_count(self, obj) -> int:
        if obj.kind != "guide":
            return 0
        return obj.guide_articles.filter(is_published=True).count()

    def get_question_count(self, obj) -> int:
        if obj.kind != "qa":
            return 0
        return obj.questions.count()


class GuideArticleSerializer(serializers.ModelSerializer):
    author = UserSerializer(read_only=True)
    category_slug = serializers.CharField(source="category.slug", read_only=True)
    category_name = serializers.CharField(source="category.name", read_only=True)

    class Meta:
        model = GuideArticle
        fields = [
            "id",
            "category",
            "category_slug",
            "category_name",
            "title",
            "slug",
            "body",
            "order",
            "author",
            "is_published",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "author", "created_at", "updated_at"]


class AnswerSerializer(serializers.ModelSerializer):
    author = UserSerializer(read_only=True)

    class Meta:
        model = Answer
        fields = [
            "id",
            "question",
            "body",
            "author",
            "is_accepted",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "author", "created_at", "updated_at"]


class QuestionSerializer(serializers.ModelSerializer):
    asker = UserSerializer(read_only=True)
    answers = AnswerSerializer(many=True, read_only=True)
    answer_count = serializers.SerializerMethodField()
    category_slug = serializers.CharField(
        source="category.slug", read_only=True, default=None
    )
    category_name = serializers.CharField(
        source="category.name", read_only=True, default=None
    )

    class Meta:
        model = Question
        fields = [
            "id",
            "category",
            "category_slug",
            "category_name",
            "title",
            "body",
            "tags",
            "asker",
            "is_resolved",
            "view_count",
            "answer_count",
            "answers",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "asker",
            "view_count",
            "created_at",
            "updated_at",
        ]

    def get_answer_count(self, obj) -> int:
        return obj.answers.count()


class DocAttachmentSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = DocAttachment
        fields = ["id", "image", "url", "created_at"]
        read_only_fields = ["id", "url", "created_at"]
        extra_kwargs = {"image": {"write_only": True}}

    def get_url(self, obj) -> str:
        request = self.context.get("request")
        if not obj.image:
            return ""
        url = obj.image.url
        if request:
            return request.build_absolute_uri(url)
        return url
