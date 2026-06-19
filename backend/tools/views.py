from django.db.models import Count, Q
from django.http import FileResponse, Http404
from rest_framework import generics, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from accounts.permissions import IsAuthorOrAdminOrReadOnly, is_admin

from .models import AccessRequest, Like, Tool
from .serializers import (
    AccessRequestSerializer,
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
