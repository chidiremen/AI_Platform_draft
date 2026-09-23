"""テーマ / アイデアの権限。"""
from rest_framework import permissions

from accounts.permissions import is_admin


class IsOwnerOrAdminOrReadOnly(permissions.BasePermission):
    """閲覧はログインユーザー全員。編集・削除は発起人（または管理者）のみ。

    所有者チェックを標準の更新・削除アクションに限定しているのがポイント。
    カスタムアクション（join / entries / merge など）は「メンバーか」
    「発起人か」「誰でもよいか」が個別に違うため、ここで一律に弾くと
    参加申請すらできなくなる。カスタムアクション側は view の中で必ず
    明示的に権限を判定すること。
    """

    owner_field = "owner"
    #: 所有者チェックを適用する action 名
    owner_only_actions = frozenset({"update", "partial_update", "destroy"})

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        if getattr(view, "action", None) not in self.owner_only_actions:
            return True
        return is_admin(request.user) or getattr(obj, self.owner_field, None) == request.user


class IsAuthorOrAdminOrReadOnly(IsOwnerOrAdminOrReadOnly):
    owner_field = "author"
