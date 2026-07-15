"""Reusable DRF permission classes keyed off the application ``role``."""

from rest_framework import permissions


#: 管理者権限を持つ role 値の集合。組織管理者 (admin) とツール管理者
#: (tool_admin) は同等の権限として扱う。
ADMIN_ROLES = frozenset({"admin", "tool_admin"})


def is_admin(user) -> bool:
    return bool(
        user
        and user.is_authenticated
        and (getattr(user, "role", None) in ADMIN_ROLES or user.is_superuser)
    )


class IsAdmin(permissions.BasePermission):
    """Allow access only to authenticated users with the admin role."""

    def has_permission(self, request, view):
        return is_admin(request.user)


class IsAuthorOrAdminOrReadOnly(permissions.BasePermission):
    """Read for anyone; write only for the object's author or an admin."""

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        author = getattr(obj, "author", None)
        return is_admin(request.user) or author == request.user
