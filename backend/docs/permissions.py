"""Per-resource permissions for the docs app."""

from rest_framework import permissions

from accounts.permissions import is_admin


class IsAdminOrReadOnly(permissions.BasePermission):
    """Read for anyone authenticated; write only for admin / tool_admin."""

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return bool(request.user and request.user.is_authenticated)
        return is_admin(request.user)


class IsOwnerOrAdminOrReadOnly(permissions.BasePermission):
    """Read for anyone authenticated; write for the owner or admin."""

    #: Attribute on the object that identifies the owner.
    owner_field = "asker"

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return bool(request.user and request.user.is_authenticated)
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        owner = getattr(obj, self.owner_field, None)
        return is_admin(request.user) or owner == request.user


class IsQuestionOwnerOrAdminOrReadOnly(IsOwnerOrAdminOrReadOnly):
    owner_field = "asker"


class IsAnswerOwnerOrAdminOrReadOnly(IsOwnerOrAdminOrReadOnly):
    """Answers: only admin/tool_admin can create; owner or admin can edit."""

    owner_field = "author"

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return bool(request.user and request.user.is_authenticated)
        # Answer creation is admin-only. Update/delete falls to object perms.
        if request.method == "POST":
            return is_admin(request.user)
        return bool(request.user and request.user.is_authenticated)
