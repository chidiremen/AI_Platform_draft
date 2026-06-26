"""Reusable DRF permission classes keyed off the application ``role``."""

from rest_framework import permissions


def is_admin(user) -> bool:
    return bool(
        user
        and user.is_authenticated
        and (getattr(user, "role", None) == "admin" or user.is_superuser)
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
