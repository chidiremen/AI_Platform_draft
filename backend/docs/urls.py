from rest_framework.routers import DefaultRouter

from .views import (
    AnswerViewSet,
    DocAttachmentViewSet,
    DocCategoryViewSet,
    GuideArticleViewSet,
    QuestionViewSet,
)

router = DefaultRouter()
router.register(r"doc-categories", DocCategoryViewSet, basename="doc-category")
router.register(r"guides", GuideArticleViewSet, basename="guide")
router.register(r"questions", QuestionViewSet, basename="question")
router.register(r"answers", AnswerViewSet, basename="answer")
router.register(r"doc-attachments", DocAttachmentViewSet, basename="doc-attachment")

urlpatterns = router.urls
