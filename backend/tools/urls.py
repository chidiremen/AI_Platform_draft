from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register(r"tools", views.ToolViewSet, basename="tool")

urlpatterns = [
    # /api/me/* tool collections (must be declared before the router include
    # so they are matched explicitly).
    path("me/tools/", views.MeToolsView.as_view(), name="me-tools"),
    path("me/likes/", views.MeLikesView.as_view(), name="me-likes"),
    path("me/requests/", views.MeRequestsView.as_view(), name="me-requests"),
    path(
        "me/incoming-requests/",
        views.MeIncomingRequestsView.as_view(),
        name="me-incoming-requests",
    ),
    path(
        "access-requests/<uuid:pk>/resolve/",
        views.AccessRequestResolveView.as_view(),
        name="access-request-resolve",
    ),
    # コメント関連
    path(
        "tools/<uuid:tool_id>/comments/",
        views.ToolCommentsView.as_view(),
        name="tool-comments",
    ),
    path(
        "comments/<uuid:pk>/",
        views.CommentDetailView.as_view(),
        name="comment-detail",
    ),
    path(
        "comments/<uuid:comment_id>/like/",
        views.CommentLikeView.as_view(),
        name="comment-like",
    ),
    path("", include(router.urls)),
]
