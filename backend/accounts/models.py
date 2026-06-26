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
        ADMIN = "admin", "管理者"
        MEMBER = "member", "メンバー"

    role = models.CharField(
        max_length=10,
        choices=Role.choices,
        default=Role.MEMBER,
    )
    display_name = models.CharField(max_length=150, blank=True)

    @property
    def is_admin_role(self) -> bool:
        return self.role == self.Role.ADMIN

    def save(self, *args, **kwargs):
        # Keep the application role and Django admin flags consistent in both
        # directions:
        #   - A Django superuser (e.g. created via ``createsuperuser``) is
        #     always treated as an application admin.
        #   - An admin-role user gets the Django admin flags as a convenience.
        if self.is_superuser:
            self.role = self.Role.ADMIN
        if self.role == self.Role.ADMIN:
            self.is_staff = True
            self.is_superuser = True
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.display_name or self.username
