from __future__ import annotations

from django.db.models import Count, F, Q
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import is_admin

from .models import ForumPost, ForumThread, ThreadVote
from .serializers import ForumPostSerializer, ForumThreadSerializer


class OwnerOrAdmin(permissions.BasePermission):
    """読取は認証ユーザー全員、書込は投稿者本人または管理者。"""

    owner_field = "author"

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        return is_admin(request.user) or getattr(obj, self.owner_field, None) == request.user


class ForumThreadViewSet(viewsets.ModelViewSet):
    """スレッド。

    フィルタ:
      * ``?q=text``        — タイトル/本文/タグ
      * ``?category=idea`` — カテゴリ
      * ``?mine=true``     — 自分が立てたスレ
      * ``?sort=latest|new|votes|posts`` （既定 latest = 最終レス順）
    """

    queryset = ForumThread.objects.select_related("author").all()
    serializer_class = ForumThreadSerializer
    permission_classes = [OwnerOrAdmin]

    def get_queryset(self):
        qs = super().get_queryset()
        p = self.request.query_params
        if q := p.get("q"):
            qs = qs.filter(
                Q(title__icontains=q) | Q(body__icontains=q) | Q(tags__icontains=q)
            )
        if cat := p.get("category"):
            qs = qs.filter(category=cat)
        if p.get("mine", "").lower() in ("true", "1", "yes") and self.request.user.is_authenticated:
            qs = qs.filter(author=self.request.user)

        sort = p.get("sort", "latest")
        if sort == "new":
            qs = qs.order_by("-is_pinned", "-created_at")
        elif sort == "votes":
            qs = qs.annotate(_n=Count("votes", distinct=True)).order_by(
                "-is_pinned", "-_n", "-created_at"
            )
        elif sort == "posts":
            qs = qs.annotate(_n=Count("posts", distinct=True)).order_by(
                "-is_pinned", "-_n", "-created_at"
            )
        else:  # latest = 最終レス順（レス無しは作成日で代替）
            qs = qs.order_by("-is_pinned", F("last_posted_at").desc(nulls_last=True), "-created_at")
        return qs

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        # 詳細取得時のみレス一覧を含める
        ctx["with_posts"] = self.action in ("retrieve", "vote")
        return ctx

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)

    def retrieve(self, request, *args, **kwargs):
        obj = self.get_object()
        ForumThread.objects.filter(pk=obj.pk).update(view_count=F("view_count") + 1)
        obj.refresh_from_db(fields=["view_count"])
        return Response(self.get_serializer(obj).data)

    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated])
    def vote(self, request, pk=None):
        """👍 ほしい！のトグル。"""
        thread = self.get_object()
        existing = ThreadVote.objects.filter(thread=thread, user=request.user)
        if existing.exists():
            existing.delete()
        else:
            ThreadVote.objects.create(thread=thread, user=request.user)
        return Response(self.get_serializer(thread).data)

    @action(detail=True, methods=["post"], url_path="toggle-closed")
    def toggle_closed(self, request, pk=None):
        """スレのレス受付停止をトグル（スレ主 or 管理者）。"""
        thread = self.get_object()
        if thread.author != request.user and not is_admin(request.user):
            return Response({"detail": "権限がありません"}, status=status.HTTP_403_FORBIDDEN)
        thread.is_closed = not thread.is_closed
        thread.save(update_fields=["is_closed", "updated_at"])
        return Response(self.get_serializer(thread).data)

    @action(detail=True, methods=["post"], url_path="toggle-pinned")
    def toggle_pinned(self, request, pk=None):
        """スレの固定をトグル（管理者のみ）。"""
        thread = self.get_object()
        if not is_admin(request.user):
            return Response({"detail": "権限がありません"}, status=status.HTTP_403_FORBIDDEN)
        thread.is_pinned = not thread.is_pinned
        thread.save(update_fields=["is_pinned", "updated_at"])
        return Response(self.get_serializer(thread).data)


class ForumPostViewSet(viewsets.ModelViewSet):
    """レス。``?thread=<uuid>`` でスレ絞り込み。"""

    queryset = ForumPost.objects.select_related("author", "thread").all()
    serializer_class = ForumPostSerializer
    permission_classes = [OwnerOrAdmin]
    pagination_class = None

    def get_queryset(self):
        qs = super().get_queryset()
        if tid := self.request.query_params.get("thread"):
            qs = qs.filter(thread_id=tid)
        return qs

    def perform_create(self, serializer):
        thread = serializer.validated_data["thread"]
        if thread.is_closed and not is_admin(self.request.user):
            raise ValidationError({"detail": "このスレッドはレス受付を停止しています"})
        serializer.save(author=self.request.user)
        # スレの最終レス日時を更新（一覧の既定ソート用）
        ForumThread.objects.filter(pk=thread.pk).update(last_posted_at=timezone.now())
