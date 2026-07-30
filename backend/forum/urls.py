from rest_framework.routers import DefaultRouter

from .views import ForumPostViewSet, ForumThreadViewSet

router = DefaultRouter()
router.register(r"forum/threads", ForumThreadViewSet, basename="forum-thread")
router.register(r"forum/posts", ForumPostViewSet, basename="forum-post")

urlpatterns = router.urls
