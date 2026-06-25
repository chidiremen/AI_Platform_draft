from rest_framework import serializers

from accounts.serializers import UserSerializer

from .models import (
    AccessRequest,
    AspiceProcess,
    Like,
    Screenshot,
    Tool,
    ToolAspiceProcess,
)


def _coerce_string_list(value):
    """multipart 互換: JSON文字列・CSV・配列いずれの形式でも文字列リストに正規化。

    multipart/form-data ではJSONFieldや ListField を直接送れないため、
    クライアントは ``"[\"a\",\"b\"]"`` か ``"a,b"`` でも送れるようにする。
    """
    if value is None or value == "":
        return []
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    text = str(value).strip()
    if not text:
        return []
    if text.startswith("["):
        import json as _json
        try:
            data = _json.loads(text)
            if isinstance(data, list):
                return [str(v).strip() for v in data if str(v).strip()]
        except Exception:
            pass
    return [p.strip() for p in text.split(",") if p.strip()]


class AspiceProcessSerializer(serializers.ModelSerializer):
    class Meta:
        model = AspiceProcess
        fields = [
            "id",
            "name",
            "category",
            "v_model_position",
            "display_order",
        ]


class ScreenshotSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = Screenshot
        fields = ["id", "image", "image_url", "display_order"]

    def get_image_url(self, obj):
        if not obj.image:
            return None
        request = self.context.get("request")
        url = obj.image.url
        return request.build_absolute_uri(url) if request else url


class ToolSerializer(serializers.ModelSerializer):
    """Read representation of a tool with computed counts and relations."""

    author = UserSerializer(read_only=True)
    aspice_processes = AspiceProcessSerializer(many=True, read_only=True)
    screenshots = ScreenshotSerializer(many=True, read_only=True)
    like_count = serializers.SerializerMethodField()
    request_count = serializers.SerializerMethodField()
    liked_by_me = serializers.SerializerMethodField()
    zip_file_name = serializers.SerializerMethodField()

    class Meta:
        model = Tool
        fields = [
            "id",
            "title",
            "summary",
            "readme",
            "tool_type",
            "access_url",
            "zip_file",
            "zip_file_name",
            "tags",
            "work_categories",
            "effect_qualitative",
            "effect_hours_per_month",
            "author",
            "forked_from",
            "aspice_processes",
            "screenshots",
            "like_count",
            "request_count",
            "liked_by_me",
            "created_at",
            "updated_at",
            "is_published",
        ]
        read_only_fields = ["id", "author", "created_at", "updated_at"]

    def get_zip_file_name(self, obj):
        if not obj.zip_file:
            return None
        return obj.zip_file.name.split("/")[-1]

    def get_like_count(self, obj) -> int:
        return obj.likes.count()

    def get_request_count(self, obj) -> int:
        return obj.access_requests.count()

    def get_liked_by_me(self, obj) -> bool:
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        return obj.likes.filter(user=request.user).exists()


class ToolWriteSerializer(serializers.ModelSerializer):
    """Create / update serializer.

    Multipart 互換のため、リスト系フィールド（aspice_process_ids /
    work_categories）は配列・JSON文字列・CSVのいずれの形式でも受け入れる。
    """

    aspice_process_ids = serializers.CharField(
        write_only=True, required=False, allow_blank=True
    )
    work_categories = serializers.CharField(
        required=False, allow_blank=True
    )
    # multipart で未送信時に「未チェック扱い=False」に勝手に倒されないよう、
    # 既定 True にしておく（モデルの default と同値）。
    is_published = serializers.BooleanField(required=False, default=True)

    class Meta:
        model = Tool
        fields = [
            "id",
            "title",
            "summary",
            "readme",
            "tool_type",
            "access_url",
            "zip_file",
            "tags",
            "work_categories",
            "effect_qualitative",
            "effect_hours_per_month",
            "forked_from",
            "is_published",
            "aspice_process_ids",
        ]
        read_only_fields = ["id"]

    def to_internal_value(self, data):
        # multipart で送られる配列風フィールドを正規化してから検証する。
        # （ListField/JSONField は multipart と相性が悪いため CharField で受ける）
        if hasattr(data, "_mutable"):
            data._mutable = True  # QueryDict
        if "aspice_process_ids" in data:
            data = data.copy() if hasattr(data, "copy") else dict(data)
            data["aspice_process_ids"] = ",".join(
                _coerce_string_list(data.get("aspice_process_ids"))
            )
        if "work_categories" in data:
            data = data.copy() if hasattr(data, "copy") else dict(data)
            data["work_categories"] = ",".join(
                _coerce_string_list(data.get("work_categories"))
            )
        return super().to_internal_value(data)

    def validate_aspice_process_ids(self, value):
        return _coerce_string_list(value)

    def validate_work_categories(self, value):
        return _coerce_string_list(value)

    def _set_aspice(self, tool, process_ids):
        ToolAspiceProcess.objects.filter(tool=tool).delete()
        for pid in process_ids:
            process = AspiceProcess.objects.filter(id=pid).first()
            if process:
                ToolAspiceProcess.objects.get_or_create(
                    tool=tool, process=process
                )

    def create(self, validated_data):
        process_ids = validated_data.pop("aspice_process_ids", [])
        validated_data["author"] = self.context["request"].user
        tool = super().create(validated_data)
        self._set_aspice(tool, process_ids)
        return tool

    def update(self, instance, validated_data):
        process_ids = validated_data.pop("aspice_process_ids", None)
        tool = super().update(instance, validated_data)
        if process_ids is not None:
            self._set_aspice(tool, process_ids)
        return tool

    def to_representation(self, instance):
        return ToolSerializer(instance, context=self.context).data


class LikeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Like
        fields = ["id", "user", "tool", "created_at"]
        read_only_fields = fields


class AccessRequestSerializer(serializers.ModelSerializer):
    requester = UserSerializer(read_only=True)
    tool_title = serializers.CharField(source="tool.title", read_only=True)

    class Meta:
        model = AccessRequest
        fields = [
            "id",
            "requester",
            "tool",
            "tool_title",
            "reason",
            "status",
            "created_at",
            "resolved_at",
        ]
        read_only_fields = [
            "id",
            "requester",
            "tool_title",
            "created_at",
            "resolved_at",
        ]
