from django.contrib.auth import get_user_model
from rest_framework import serializers

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    """Public-facing user representation."""

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "display_name",
            "role",
            "email",
            "is_active",
            "date_joined",
        ]
        read_only_fields = ["id", "date_joined"]


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(style={"input_type": "password"})


class RegisterSerializer(serializers.ModelSerializer):
    """Self/admin registration with id (username) + password + role."""

    password = serializers.CharField(
        write_only=True, style={"input_type": "password"}
    )

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "password",
            "display_name",
            "role",
            "email",
        ]
        read_only_fields = ["id"]

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class AdminUserCreateSerializer(RegisterSerializer):
    """Admin creates a user (initial registration)."""

    role = serializers.ChoiceField(
        choices=User.Role.choices, default=User.Role.MEMBER
    )


class AdminUserUpdateSerializer(serializers.ModelSerializer):
    """Admin updates an existing user's role / status / display name."""

    class Meta:
        model = User
        fields = ["role", "display_name", "is_active", "email"]
