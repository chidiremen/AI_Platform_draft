from django.db.models import Count, Q
from django.http import FileResponse, Http404
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from accounts.permissions import IsAuthorOrAdminOrReadOnly, is_admin

from .models import AccessRequest, Comment, CommentLike, Like, Screenshot, Tool
from .notifications import notify_access_request
from .serializers import (
    AccessRequestSerializer,
    CommentSerializer,
    ScreenshotSerializer,
    ToolSerializer,
    ToolWriteSerializer,
)


def _split_csv(value):
    return [v.strip() for v in (value or "").split(",") if v.strip()]


class ToolViewSet(ModelViewSet):
    """CRUD + custom actions for tools.

    List supports query params: q, aspice, tool_type, work_category, sort, page.
    Reads are public; writes require author/admin.
    """

    permission_classes = [IsAuthorOrAdminOrReadOnly]

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return ToolWriteSerializer
        return ToolSerializer

    def get_queryset(self):
        qs = (
            Tool.objects.select_related("author", "forked_from")
            .prefetch_related("aspice_processes", "screenshots", "likes")
            .all()
        )

        # Only show unpublished tools to their author or an admin.
        user = self.request.user
        if not is_admin(user):
            if user.is_authenticated:
                qs = qs.filter(Q(is_published=True) | Q(author=user))
            else:
                qs = qs.filter(is_published=True)

        params = self.request.query_params

        q = params.get("q")
        if q:
            qs = qs.filter(
                Q(title__icontains=q)
                | Q(summary__icontains=q)
                | Q(readme__icontains=q)
                | Q(tags__icontains=q)
            )

        aspice = _split_csv(params.get("aspice"))
        if aspice:
            qs = qs.filter(aspice_processes__id__in=aspice).distinct()

        tool_types = _split_csv(params.get("tool_type"))
        if tool_types:
            qs = qs.filter(tool_type__in=tool_types)

        # work_category: JSONField list of strings -> OR match via icontains.
        work_categories = _split_csv(params.get("work_category"))
        if work_categories:
            wc_q = Q()
            for wc in work_categories:
                wc_q |= Q(work_categories__icontains=wc)
            qs = qs.filter(wc_q)

        sort = params.get("sort", "newest")
        if sort == "likes":
            qs = qs.annotate(_n=Count("likes", distinct=True)).order_by(
                "-_n", "-created_at"
            )
        elif sort == "requests":
            qs = qs.annotate(
                _n=Count("access_requests", distinct=True)
            ).order_by("-_n", "-created_at")
        elif sort == "views":
            qs = qs.annotate(
                _n=Count(
                    "activity_logs",
                    filter=Q(activity_logs__action="view"),
                    distinct=True,
                )
            ).order_by("-_n", "-created_at")
        elif sort == "name":
            qs = qs.order_by("title")
        else:  # newest
            qs = qs.order_by("-created_at")

        return qs

    # ----- custom actions ------------------------------------------------- #
    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated])
    def fork(self, request, pk=None):
        """Return a copy payload referencing the original via forked_from."""
        source = self.get_object()
        payload = {
            "title": f"{source.title} (フォーク)",
            "summary": source.summary,
            "readme": source.readme,
            "tool_type": source.tool_type,
            "access_url": source.access_url,
            "tags": source.tags,
            "work_categories": source.work_categories,
            "effect_qualitative": source.effect_qualitative,
            "effect_hours_per_month": source.effect_hours_per_month,
            "forked_from": str(source.id),
            "aspice_process_ids": list(
                source.aspice_processes.values_list("id", flat=True)
            ),
        }
        return Response(payload, status=status.HTTP_200_OK)

    @action(
        detail=True,
        methods=["post"],
        permission_classes=[IsAuthenticated],
        url_path="like",
    )
    def like(self, request, pk=None):
        """Toggle like for the current user."""
        tool = self.get_object()
        existing = Like.objects.filter(user=request.user, tool=tool).first()
        if existing:
            existing.delete()
            liked = False
        else:
            Like.objects.create(user=request.user, tool=tool)
            liked = True
        like_count = Like.objects.filter(tool=tool).count()
        return Response(
            {"liked": liked, "like_count": like_count},
            status=status.HTTP_200_OK,
        )

    @action(
        detail=True,
        methods=["post"],
        permission_classes=[IsAuthenticated],
        url_path="request-access",
    )
    def request_access(self, request, pk=None):
        tool = self.get_object()
        req = AccessRequest.objects.create(
            requester=request.user,
            tool=tool,
            reason=request.data.get("reason", ""),
        )
        # 登録者へ Teams 通知（ベストエフォート。未設定/失敗でも申請は成功扱い）
        notify_access_request(req)
        return Response(
            AccessRequestSerializer(req).data,
            status=status.HTTP_201_CREATED,
        )

    @action(
        detail=True,
        methods=["get"],
        permission_classes=[IsAuthenticated],
        url_path="download",
    )
    def download(self, request, pk=None):
        tool = self.get_object()
        if not tool.zip_file:
            raise Http404("このツールにはダウンロード可能なファイルがありません。")
        return FileResponse(
            tool.zip_file.open("rb"),
            as_attachment=True,
            filename=tool.zip_file.name.split("/")[-1],
        )

    # ── スクリーンショット追加（登録者本人または管理者） ──
    @action(
        detail=True,
        methods=["get", "post"],
        permission_classes=[IsAuthenticated],
        url_path="screenshots",
    )
    def screenshots(self, request, pk=None):
        tool = self.get_object()
        if request.method == "GET":
            qs = tool.screenshots.all()
            return Response(
                ScreenshotSerializer(qs, many=True, context={"request": request}).data
            )
        # POST: 画像アップロード
        if not (is_admin(request.user) or tool.author_id == request.user.id):
            raise PermissionDenied("スクリーンショット追加は登録者または管理者のみ可能です。")
        image = request.FILES.get("image")
        if not image:
            return Response(
                {"detail": "image ファイルが必要です。"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            order = int(request.data.get("display_order", 0))
        except (TypeError, ValueError):
            order = 0
        shot = Screenshot.objects.create(tool=tool, image=image, display_order=order)
        return Response(
            ScreenshotSerializer(shot, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    # ── スクリーンショット削除 ──
    @action(
        detail=True,
        methods=["delete"],
        permission_classes=[IsAuthenticated],
        url_path=r"screenshots/(?P<screenshot_id>[^/.]+)",
    )
    def delete_screenshot(self, request, pk=None, screenshot_id=None):
        tool = self.get_object()
        if not (is_admin(request.user) or tool.author_id == request.user.id):
            raise PermissionDenied("スクリーンショット削除は登録者または管理者のみ可能です。")
        shot = tool.screenshots.filter(id=screenshot_id).first()
        if not shot:
            raise Http404("スクリーンショットが見つかりません。")
        shot.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------------------- #
# /api/me/* tool-related collections
# --------------------------------------------------------------------------- #
class MeToolsView(generics.ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = ToolSerializer

    def get_queryset(self):
        return (
            Tool.objects.filter(author=self.request.user)
            .select_related("author")
            .prefetch_related("aspice_processes", "screenshots", "likes")
            .order_by("-created_at")
        )


class MeLikesView(generics.ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = ToolSerializer

    def get_queryset(self):
        return (
            Tool.objects.filter(likes__user=self.request.user)
            .select_related("author")
            .prefetch_related("aspice_processes", "screenshots", "likes")
            .order_by("-likes__created_at")
        )


class MeRequestsView(generics.ListAPIView):
    """Access requests made by the current user."""

    permission_classes = [IsAuthenticated]
    serializer_class = AccessRequestSerializer

    def get_queryset(self):
        return (
            AccessRequest.objects.filter(requester=self.request.user)
            .select_related("tool", "requester")
            .order_by("-created_at")
        )


class MeIncomingRequestsView(generics.ListAPIView):
    """Access requests targeting tools authored by the current user."""

    permission_classes = [IsAuthenticated]
    serializer_class = AccessRequestSerializer

    def get_queryset(self):
        return (
            AccessRequest.objects.filter(tool__author=self.request.user)
            .select_related("tool", "requester")
            .order_by("-created_at")
        )


class AccessRequestResolveView(generics.UpdateAPIView):
    """登録者本人または管理者が申請を承認/却下する。

    POST/PATCH /api/access-requests/{id}/resolve/
    Body: {"status": "granted" | "rejected"}
    """

    permission_classes = [IsAuthenticated]
    serializer_class = AccessRequestSerializer
    queryset = AccessRequest.objects.select_related("tool", "requester")
    http_method_names = ["post", "patch"]

    def update(self, request, *args, **kwargs):
        req = self.get_object()
        if not (is_admin(request.user) or req.tool.author_id == request.user.id):
            raise PermissionDenied(
                "この申請を処理できるのは登録者本人または管理者のみです。"
            )
        new_status = request.data.get("status")
        if new_status not in {
            AccessRequest.Status.GRANTED,
            AccessRequest.Status.REJECTED,
        }:
            return Response(
                {"detail": "status は granted または rejected を指定してください。"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        req.status = new_status
        req.resolved_at = timezone.now()
        req.save(update_fields=["status", "resolved_at"])
        return Response(AccessRequestSerializer(req).data)

    def post(self, request, *args, **kwargs):
        return self.update(request, *args, **kwargs)


# --------------------------------------------------------------------------- #
# Comments
# --------------------------------------------------------------------------- #
class ToolCommentsView(generics.ListCreateAPIView):
    """List or create comments on a tool. Reads are public, writes require auth.

    GET /api/tools/{tool_id}/comments/
    POST /api/tools/{tool_id}/comments/  body: {body, comment_type, parent}
    """

    serializer_class = CommentSerializer

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAuthenticated()]
        return []

    def get_queryset(self):
        tool_id = self.kwargs.get("tool_id")
        return (
            Comment.objects.filter(tool_id=tool_id)
            .select_related("author")
            .prefetch_related("likes", "replies")
            .order_by("created_at")
        )

    def perform_create(self, serializer):
        tool_id = self.kwargs.get("tool_id")
        tool = Tool.objects.filter(id=tool_id).first()
        if not tool:
            raise Http404("ツールが見つかりません。")
        serializer.save(author=self.request.user, tool=tool)


class CommentDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Edit or delete a comment. Only the author or an admin may modify."""

    serializer_class = CommentSerializer
    queryset = Comment.objects.select_related("author").prefetch_related(
        "likes", "replies"
    )
    permission_classes = [IsAuthenticated]

    def perform_update(self, serializer):
        comment = self.get_object()
        if not (is_admin(self.request.user) or comment.author_id == self.request.user.id):
            raise PermissionDenied("コメントの編集は投稿者または管理者のみ可能です。")
        serializer.save()

    def perform_destroy(self, instance):
        if not (is_admin(self.request.user) or instance.author_id == self.request.user.id):
            raise PermissionDenied("コメントの削除は投稿者または管理者のみ可能です。")
        instance.delete()


class CommentLikeView(generics.GenericAPIView):
    """Toggle like for a comment.

    POST /api/comments/{comment_id}/like/  -> {liked, like_count}
    """

    permission_classes = [IsAuthenticated]
    queryset = Comment.objects.all()
    lookup_url_kwarg = "comment_id"

    def post(self, request, *args, **kwargs):
        comment = self.get_object()
        existing = CommentLike.objects.filter(
            comment=comment, user=request.user
        ).first()
        if existing:
            existing.delete()
            liked = False
        else:
            CommentLike.objects.create(comment=comment, user=request.user)
            liked = True
        like_count = CommentLike.objects.filter(comment=comment).count()
        return Response({"liked": liked, "like_count": like_count})
