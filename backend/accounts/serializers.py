from django.contrib.auth import get_user_model
from rest_framework import serializers

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    """Public-facing user representation."""

    # Report the *effective* role: a Django superuser is always an admin,
    # even if the stored ``role`` column still says "member" (e.g. a user
    # created via ``createsuperuser`` before the role sync was in place).
    role = serializers.SerializerMethodField()

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

    def get_role(self, obj) -> str:
        if obj.is_superuser or obj.role == User.Role.ADMIN:
            return User.Role.ADMIN
        return obj.role


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
    """Admin updates an existing user's role / status / display name / password.

    `password` を含めると管理者によるパスワードリセットとして扱う。
    """

    password = serializers.CharField(
        write_only=True, required=False, allow_blank=False, min_length=4
    )

    class Meta:
        model = User
        fields = ["role", "display_name", "is_active", "email", "password"]

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        for k, v in validated_data.items():
            setattr(instance, k, v)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class MeUpdateSerializer(serializers.ModelSerializer):
    """ログインユーザー本人が編集可能なフィールド（ロールやusernameは不可）。"""

    class Meta:
        model = User
        fields = ["display_name", "email"]


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(style={"input_type": "password"})
    new_password = serializers.CharField(
        style={"input_type": "password"}, min_length=4
    )
