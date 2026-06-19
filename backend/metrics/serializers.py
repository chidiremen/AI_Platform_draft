from rest_framework import serializers

from .models import ActivityLog


class ActivityLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = ActivityLog
        fields = ["id", "tool", "action", "session_id", "created_at"]
        read_only_fields = ["id", "created_at"]
