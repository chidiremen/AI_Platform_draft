from django.db.models import Count, Q
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import is_admin
from tools.models import AccessRequest, AspiceProcess, Like, Tool

from .models import ActivityLog
from .serializers import ActivityLogSerializer


class ActivityLogView(APIView):
    """Record one or many activity logs. Auth optional."""

    permission_classes = [AllowAny]

    def post(self, request):
        data = request.data
        many = isinstance(data, list)
        serializer = ActivityLogSerializer(data=data, many=many)
        serializer.is_valid(raise_exception=True)

        user = request.user if request.user.is_authenticated else None
        rows = serializer.validated_data
        if not many:
            rows = [rows]

        objs = [ActivityLog(user=user, **row) for row in rows]
        ActivityLog.objects.bulk_create(objs)
        return Response(
            {"created": len(objs)}, status=status.HTTP_201_CREATED
        )


def _scoped_tool_queryset(user):
    """Admins see all tools; members only their own."""
    qs = Tool.objects.all()
    if not is_admin(user):
        qs = qs.filter(author=user)
    return qs


class DashboardSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tools = _scoped_tool_queryset(request.user)
        tool_ids = list(tools.values_list("id", flat=True))

        logs = ActivityLog.objects.filter(tool_id__in=tool_ids)
        likes = Like.objects.filter(tool_id__in=tool_ids)
        requests = AccessRequest.objects.filter(tool_id__in=tool_ids)

        # Top tools by view count.
        top = (
            tools.annotate(
                views=Count(
                    "activity_logs",
                    filter=Q(activity_logs__action="view"),
                    distinct=True,
                ),
                likes_n=Count("likes", distinct=True),
            )
            .order_by("-views")[:10]
            .values("id", "title", "views", "likes_n")
        )

        return Response(
            {
                "scope": "admin" if is_admin(request.user) else "member",
                "tool_count": tools.count(),
                "total_views": logs.filter(action="view").count(),
                "total_impressions": logs.filter(action="impression").count(),
                "total_downloads": logs.filter(action="download").count(),
                "total_likes": likes.count(),
                "total_requests": requests.count(),
                "pending_requests": requests.filter(status="pending").count(),
                "top_tools": [
                    {
                        "id": str(t["id"]),
                        "title": t["title"],
                        "views": t["views"],
                        "likes": t["likes_n"],
                    }
                    for t in top
                ],
            }
        )


class DashboardFunnelView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tools = _scoped_tool_queryset(request.user)
        tool_ids = list(tools.values_list("id", flat=True))
        logs = ActivityLog.objects.filter(tool_id__in=tool_ids)

        counts = {
            row["action"]: row["n"]
            for row in logs.values("action").annotate(n=Count("id"))
        }
        requests = AccessRequest.objects.filter(tool_id__in=tool_ids).count()

        funnel = [
            {"stage": "impression", "label": "表示", "count": counts.get("impression", 0)},
            {"stage": "view", "label": "詳細閲覧", "count": counts.get("view", 0)},
            {"stage": "readme_scroll", "label": "README閲覧", "count": counts.get("readme_scroll", 0)},
            {"stage": "download", "label": "ダウンロード/アクセス", "count": counts.get("download", 0)},
            {"stage": "request", "label": "アクセス申請", "count": requests},
        ]
        return Response(
            {
                "scope": "admin" if is_admin(request.user) else "member",
                "funnel": funnel,
            }
        )


class DashboardAspiceDistributionView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tools = _scoped_tool_queryset(request.user)
        tool_ids = list(tools.values_list("id", flat=True))

        distribution = []
        for process in AspiceProcess.objects.all():
            count = process.tools.filter(id__in=tool_ids).count()
            distribution.append(
                {
                    "id": process.id,
                    "name": process.name,
                    "category": process.category,
                    "v_model_position": process.v_model_position,
                    "tool_count": count,
                }
            )

        return Response(
            {
                "scope": "admin" if is_admin(request.user) else "member",
                "distribution": distribution,
            }
        )
