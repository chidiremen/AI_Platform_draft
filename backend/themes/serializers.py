"""テーマ / アイデアのシリアライザ。

multipart は使わない（ファイル添付が無い）ので、配列は素直に JSONField /
ListField で受ける。タグは既存のツール側と揃えてカンマ区切り文字列で保持し、
API 上は配列として見せる。
"""
from django.contrib.auth import get_user_model
from rest_framework import serializers

from accounts.serializers import UserSerializer

from .models import (
    Idea,
    IdeaComment,
    IdeaVote,
    Theme,
    ThemeEntry,
    ThemeJoinRequest,
    ThemeMember,
    stalled_after_days,
)

User = get_user_model()


def _split_tags(value) -> list[str]:
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    return [p.strip() for p in str(value or "").split(",") if p.strip()]


class TagListField(serializers.Field):
    """DB はカンマ区切り文字列、API は配列、という変換を担う。"""

    def to_representation(self, value):
        return _split_tags(value)

    def to_internal_value(self, data):
        return ", ".join(_split_tags(data))


# --------------------------------------------------------------------------- #
# アイデア
# --------------------------------------------------------------------------- #
class IdeaCommentSerializer(serializers.ModelSerializer):
    author = UserSerializer(read_only=True)
    can_edit = serializers.SerializerMethodField()

    class Meta:
        model = IdeaComment
        fields = ["id", "idea", "author", "body", "can_edit", "created_at", "updated_at"]
        read_only_fields = ["id", "idea", "author", "created_at", "updated_at"]

    def get_can_edit(self, obj) -> bool:
        user = self.context["request"].user
        return user == obj.author or getattr(user, "is_admin_role", False)


class IdeaSerializer(serializers.ModelSerializer):
    author = UserSerializer(read_only=True)
    tags = TagListField(required=False)
    vote_count = serializers.SerializerMethodField()
    voted_by_me = serializers.SerializerMethodField()
    comment_count = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()
    promoted_theme_title = serializers.SerializerMethodField()
    #: 詳細取得時のみ入る
    comments = serializers.SerializerMethodField()

    class Meta:
        model = Idea
        fields = [
            "id",
            "title",
            "body",
            "tags",
            "work_categories",
            "status",
            "author",
            "promoted_theme",
            "promoted_theme_title",
            "vote_count",
            "voted_by_me",
            "comment_count",
            "comments",
            "can_edit",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "author", "promoted_theme", "created_at", "updated_at"]

    def get_vote_count(self, obj) -> int:
        return getattr(obj, "vote_total", None) or obj.votes.count()

    def get_voted_by_me(self, obj) -> bool:
        user = self.context["request"].user
        if not user.is_authenticated:
            return False
        return obj.votes.filter(user=user).exists()

    def get_comment_count(self, obj) -> int:
        return getattr(obj, "comment_total", None) or obj.comments.count()

    def get_can_edit(self, obj) -> bool:
        user = self.context["request"].user
        return user == obj.author or getattr(user, "is_admin_role", False)

    def get_promoted_theme_title(self, obj):
        return obj.promoted_theme.title if obj.promoted_theme_id else None

    def get_comments(self, obj):
        # 一覧では返さない（N+1 と転送量を避けるため）。詳細だけで入れる。
        if not self.context.get("with_comments"):
            return None
        return IdeaCommentSerializer(
            obj.comments.select_related("author"), many=True, context=self.context
        ).data


# --------------------------------------------------------------------------- #
# テーマ
# --------------------------------------------------------------------------- #
class ThemeMemberSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)

    class Meta:
        model = ThemeMember
        fields = ["id", "user", "role", "joined_at"]
        read_only_fields = fields


class ThemeJoinRequestSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    decided_by = UserSerializer(read_only=True)

    class Meta:
        model = ThemeJoinRequest
        fields = [
            "id",
            "theme",
            "user",
            "message",
            "status",
            "decided_by",
            "decided_at",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "theme",
            "user",
            "status",
            "decided_by",
            "decided_at",
            "created_at",
        ]


class ThemeEntrySerializer(serializers.ModelSerializer):
    author = UserSerializer(read_only=True)
    can_edit = serializers.SerializerMethodField()

    class Meta:
        model = ThemeEntry
        fields = [
            "id",
            "theme",
            "kind",
            "body",
            "progress_percent",
            "status_at_post",
            "author",
            "can_edit",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "theme",
            "author",
            "status_at_post",
            "created_at",
            "updated_at",
        ]

    def get_can_edit(self, obj) -> bool:
        return obj.can_edit(self.context["request"].user)

    def validate_progress_percent(self, value):
        if value is None:
            return value
        if not 0 <= value <= 100:
            raise serializers.ValidationError("進捗率は0〜100で入力してください。")
        return value


class ThemeSerializer(serializers.ModelSerializer):
    """一覧・詳細共通。詳細取得時のみ members / entries が入る。"""

    owner = UserSerializer(read_only=True)
    tags = TagListField(required=False)

    is_stalled = serializers.BooleanField(read_only=True)
    days_since_progress = serializers.IntegerField(read_only=True)
    stalled_after_days = serializers.SerializerMethodField()

    member_count = serializers.SerializerMethodField()
    entry_count = serializers.SerializerMethodField()
    latest_progress = serializers.SerializerMethodField()
    latest_progress_percent = serializers.SerializerMethodField()

    is_member = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()
    my_join_request_status = serializers.SerializerMethodField()
    pending_join_count = serializers.SerializerMethodField()

    resulting_tool_title = serializers.SerializerMethodField()
    merged_into_title = serializers.SerializerMethodField()
    origin_idea_title = serializers.SerializerMethodField()

    members = serializers.SerializerMethodField()
    entries = serializers.SerializerMethodField()

    class Meta:
        model = Theme
        fields = [
            "id",
            "title",
            "summary",
            "body",
            "status",
            "tags",
            "work_categories",
            "owner",
            "freeze_reason",
            "frozen_at",
            "resulting_tool",
            "resulting_tool_title",
            "merged_into",
            "merged_into_title",
            "merged_at",
            "origin_idea",
            "origin_idea_title",
            "last_progress_at",
            "days_since_progress",
            "is_stalled",
            "stalled_after_days",
            "member_count",
            "entry_count",
            "latest_progress",
            "latest_progress_percent",
            "is_member",
            "can_edit",
            "my_join_request_status",
            "pending_join_count",
            "members",
            "entries",
            "view_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "owner",
            "frozen_at",
            "merged_into",
            "merged_at",
            "origin_idea",
            "last_progress_at",
            "view_count",
            "created_at",
            "updated_at",
        ]

    # -- 派生値 ------------------------------------------------------------ #
    def get_stalled_after_days(self, obj) -> int:
        return stalled_after_days()

    def get_member_count(self, obj) -> int:
        return obj.members.count()

    def get_entry_count(self, obj) -> int:
        return obj.entries.exclude(kind=ThemeEntry.Kind.SYSTEM).count()

    def _latest_progress(self, obj):
        if not hasattr(obj, "_cached_latest_progress"):
            obj._cached_latest_progress = (
                obj.entries.filter(kind=ThemeEntry.Kind.PROGRESS)
                .order_by("-created_at")
                .first()
            )
        return obj._cached_latest_progress

    def get_latest_progress(self, obj):
        entry = self._latest_progress(obj)
        return entry.body[:140] if entry else None

    def get_latest_progress_percent(self, obj):
        entry = self._latest_progress(obj)
        return entry.progress_percent if entry else None

    # -- 閲覧者との関係 ----------------------------------------------------- #
    def get_is_member(self, obj) -> bool:
        return obj.is_member(self.context["request"].user)

    def get_can_edit(self, obj) -> bool:
        return obj.can_edit(self.context["request"].user)

    def get_my_join_request_status(self, obj):
        user = self.context["request"].user
        if not user.is_authenticated:
            return None
        req = obj.join_requests.filter(user=user).order_by("-created_at").first()
        return req.status if req else None

    def get_pending_join_count(self, obj) -> int:
        # 承認待ちの件数は、承認権限を持つ人にだけ意味がある数字。
        if not obj.can_edit(self.context["request"].user):
            return 0
        return obj.join_requests.filter(
            status=ThemeJoinRequest.Status.PENDING
        ).count()

    # -- 関連の表示名 ------------------------------------------------------- #
    def get_resulting_tool_title(self, obj):
        return obj.resulting_tool.title if obj.resulting_tool_id else None

    def get_merged_into_title(self, obj):
        return obj.merged_into.title if obj.merged_into_id else None

    def get_origin_idea_title(self, obj):
        return obj.origin_idea.title if obj.origin_idea_id else None

    # -- 詳細のみ ----------------------------------------------------------- #
    def get_members(self, obj):
        if not self.context.get("with_detail"):
            return None
        return ThemeMemberSerializer(
            obj.members.select_related("user"), many=True, context=self.context
        ).data

    def get_entries(self, obj):
        if not self.context.get("with_detail"):
            return None
        return ThemeEntrySerializer(
            obj.entries.select_related("author"), many=True, context=self.context
        ).data


class ThemeFreezeSerializer(serializers.Serializer):
    """凍結専用。理由を必須にするためだけの入れ物。"""

    reason = serializers.CharField(
        allow_blank=False,
        help_text="何が課題で止めたのか。知見として残るので必須",
    )

    def validate_reason(self, value):
        if not value.strip():
            raise serializers.ValidationError("凍結理由を入力してください。")
        return value.strip()


class ThemeMergeSerializer(serializers.Serializer):
    """統合。自分のテーマを相手テーマに合流させる。"""

    target = serializers.UUIDField(help_text="合流先テーマの id")
