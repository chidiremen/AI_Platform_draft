from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """Custom user model.

    Authentication is performed with the standard ``username`` (treated as the
    employee / login ID) plus password. ``role`` is the source of truth for
    application-level permissions; ``is_staff`` / ``is_superuser`` are kept in
    sync as a convenience for the Django admin.
    """

    class Role(models.TextChoices):
        ADMIN = "admin", "組織管理者"
        TOOL_ADMIN = "tool_admin", "ツール管理者"
        MEMBER = "member", "メンバー"

    # 管理者権限を持つロールの集合（ADMIN / TOOL_ADMIN）。
    # 追加のロールを増やすときはここに列挙するだけで済むように定数化。
    ADMIN_ROLES = frozenset({Role.ADMIN, Role.TOOL_ADMIN})

    role = models.CharField(
        max_length=16,  # 'tool_admin' が入るよう拡張
        choices=Role.choices,
        default=Role.MEMBER,
    )
    display_name = models.CharField(max_length=150, blank=True)

    @property
    def is_admin_role(self) -> bool:
        return self.role in self.ADMIN_ROLES

    def save(self, *args, **kwargs):
        # Keep the application role and Django admin flags consistent in both
        # directions:
        #   - A Django superuser (e.g. created via ``createsuperuser``) is
        #     always treated as an application admin.
        #   - An admin-role user gets the Django admin flags as a convenience.
        if self.is_superuser and self.role not in self.ADMIN_ROLES:
            self.role = self.Role.ADMIN
        if self.role in self.ADMIN_ROLES:
            self.is_staff = True
            self.is_superuser = True
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.display_name or self.username
