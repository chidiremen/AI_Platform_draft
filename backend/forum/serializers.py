from __future__ import annotations

from rest_framework import serializers

from accounts.permissions import is_admin

from .models import ForumPost, ForumThread


class _AnonMixin:
    """匿名掲示板としての共通シリアライズ規則。

    投稿者の実体（``author``）は **絶対にレスポンスへ含めない**。
    代わりに以下を返す:
      * ``display_name`` — 名乗った名前 / スレッド毎の名無し表記
      * ``is_handle``    — 固定ハンドル（@付き）かどうか
      * ``poster_id``    — 日付+スレッド+ユーザーから導く 8 桁 base62
      * ``can_edit``     — 編集/削除の可否（本人 or 管理者）
      * ``is_mine``      — 自分の投稿か（一覧の「自分のスレ」絞り込み用）
    管理者による投稿者の特定は専用の reveal API のみで行う。
    """

    def _request_user(self):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return None
        return request.user

    def get_can_edit(self, obj) -> bool:
        user = self._request_user()
        if not user:
            return False
        return is_admin(user) or obj.author_id == user.id

    def get_is_mine(self, obj) -> bool:
        user = self._request_user()
        return bool(user and obj.author_id == user.id)


class ForumPostSerializer(_AnonMixin, serializers.ModelSerializer):
    display_name = serializers.CharField(read_only=True)
    is_handle = serializers.BooleanField(read_only=True)
    poster_id = serializers.CharField(read_only=True)
    can_edit = serializers.SerializerMethodField()
    is_mine = serializers.SerializerMethodField()

    class Meta:
        model = ForumPost
        fields = [
            "id",
            "thread",
            "number",
            "body",
            "poster_name",
            "display_name",
            "is_handle",
            "poster_id",
            "can_edit",
            "is_mine",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "number",
            "display_name",
            "is_handle",
            "poster_id",
            "can_edit",
            "is_mine",
            "created_at",
            "updated_at",
        ]
        extra_kwargs = {
            # 入力専用。他人が名乗った生の値を読み出せる必要はない。
            "poster_name": {"write_only": True, "required": False},
        }


class ForumThreadSerializer(_AnonMixin, serializers.ModelSerializer):
    """一覧・詳細共用。``posts`` は詳細のみ（一覧では除外して軽くする）。"""

    display_name = serializers.CharField(read_only=True)
    is_handle = serializers.BooleanField(read_only=True)
    poster_id = serializers.CharField(read_only=True)
    can_edit = serializers.SerializerMethodField()
    is_mine = serializers.SerializerMethodField()
    #: このスレッドで使われる名無し表記（クライアントの表示・プレビュー用）
    anon_name = serializers.SerializerMethodField()
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
            "poster_name",
            "display_name",
            "is_handle",
            "poster_id",
            "anon_name",
            "can_edit",
            "is_mine",
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
            "display_name",
            "is_handle",
            "poster_id",
            "anon_name",
            "can_edit",
            "is_mine",
            "view_count",
            "last_posted_at",
            "created_at",
            "updated_at",
        ]
        extra_kwargs = {
            "poster_name": {"write_only": True, "required": False},
        }

    def get_anon_name(self, obj) -> str:
        from .models import ForumAnonName

        return ForumAnonName.for_thread(obj.id)

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
            obj.posts.all(), many=True, context=self.context
        ).data


class ForumRevealSerializer(serializers.Serializer):
    """管理者による投稿者特定のレスポンス。"""

    target_type = serializers.CharField()
    target_id = serializers.CharField()
    poster_id = serializers.CharField()
    display_name = serializers.CharField()
    username = serializers.CharField(allow_null=True)
    user_display_name = serializers.CharField(allow_null=True)
    email = serializers.CharField(allow_null=True, allow_blank=True)
    role = serializers.CharField(allow_null=True)
