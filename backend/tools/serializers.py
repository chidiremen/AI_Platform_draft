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
    class Meta:
        model = Screenshot
        fields = ["id", "image", "display_order"]


class ToolSerializer(serializers.ModelSerializer):
    """Read representation of a tool with computed counts and relations."""

    author = UserSerializer(read_only=True)
    aspice_processes = AspiceProcessSerializer(many=True, read_only=True)
    screenshots = ScreenshotSerializer(many=True, read_only=True)
    like_count = serializers.SerializerMethodField()
    request_count = serializers.SerializerMethodField()
    liked_by_me = serializers.SerializerMethodField()

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

    Accepts ``aspice_process_ids`` (list of process id strings) to manage the
    M2M relationship through ``ToolAspiceProcess``.
    """

    aspice_process_ids = serializers.ListField(
        child=serializers.CharField(),
        write_only=True,
        required=False,
        default=list,
    )

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
