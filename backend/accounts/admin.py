from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = (
        "username",
        "display_name",
        "role",
        "email",
        "is_active",
        "is_staff",
    )
    list_filter = ("role", "is_active", "is_staff", "is_superuser")
    search_fields = ("username", "display_name", "email")
    fieldsets = BaseUserAdmin.fieldsets + (
        ("アプリ設定", {"fields": ("role", "display_name")}),
    )
    add_fieldsets = BaseUserAdmin.add_fieldsets + (
        ("アプリ設定", {"fields": ("role", "display_name")}),
    )
