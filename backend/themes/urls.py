from rest_framework.routers import DefaultRouter

from .views import IdeaCommentViewSet, IdeaViewSet, ThemeEntryViewSet, ThemeViewSet

router = DefaultRouter()
router.register(r"themes", ThemeViewSet, basename="theme")
router.register(r"theme-entries", ThemeEntryViewSet, basename="theme-entry")
router.register(r"ideas", IdeaViewSet, basename="idea")
router.register(r"idea-comments", IdeaCommentViewSet, basename="idea-comment")

urlpatterns = router.urls
