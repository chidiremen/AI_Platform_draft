from __future__ import annotations

from django.db.models import F, Q
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import is_admin

from notifications import hooks as notify

from .models import Answer, DocAttachment, DocCategory, GuideArticle, Question
from .permissions import (
    IsAdminOrReadOnly,
    IsAnswerOwnerOrAdminOrReadOnly,
    IsQuestionOwnerOrAdminOrReadOnly,
)
from .serializers import (
    AnswerSerializer,
    DocAttachmentSerializer,
    DocCategorySerializer,
    GuideArticleSerializer,
    QuestionSerializer,
)


class DocCategoryViewSet(viewsets.ModelViewSet):
    """Categories for both guide and Q&A.  Filter with ``?kind=guide|qa``."""

    queryset = DocCategory.objects.all()
    serializer_class = DocCategorySerializer
    permission_classes = [IsAdminOrReadOnly]
    pagination_class = None

    def get_queryset(self):
        qs = super().get_queryset()
        kind = self.request.query_params.get("kind")
        if kind:
            qs = qs.filter(kind=kind)
        return qs


class GuideArticleViewSet(viewsets.ModelViewSet):
    queryset = GuideArticle.objects.select_related("category", "author").all()
    serializer_class = GuideArticleSerializer
    permission_classes = [IsAdminOrReadOnly]
    pagination_class = None

    def get_queryset(self):
        qs = super().get_queryset()
        if slug := self.request.query_params.get("category"):
            qs = qs.filter(category__slug=slug)
        if q := self.request.query_params.get("q"):
            qs = qs.filter(Q(title__icontains=q) | Q(body__icontains=q))
        if not is_admin(self.request.user):
            qs = qs.filter(is_published=True)
        return qs

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)


class QuestionViewSet(viewsets.ModelViewSet):
    """User-posted questions.

    Filters (query params):
      * ``?q=text``          — title/body/tags substring
      * ``?category=slug``   — category slug (kind='qa')
      * ``?resolved=true|false``
      * ``?mine=true``       — questions asked by the current user
    """

    queryset = Question.objects.select_related("category", "asker").prefetch_related(
        "answers", "answers__author"
    )
    serializer_class = QuestionSerializer
    permission_classes = [IsQuestionOwnerOrAdminOrReadOnly]

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params
        if q := params.get("q"):
            qs = qs.filter(
                Q(title__icontains=q) | Q(body__icontains=q) | Q(tags__icontains=q)
            )
        if slug := params.get("category"):
            qs = qs.filter(category__slug=slug)
        resolved = params.get("resolved")
        if resolved is not None:
            r = resolved.lower()
            if r in ("true", "1", "yes"):
                qs = qs.filter(is_resolved=True)
            elif r in ("false", "0", "no"):
                qs = qs.filter(is_resolved=False)
        if params.get("mine", "").lower() in ("true", "1", "yes"):
            if self.request.user.is_authenticated:
                qs = qs.filter(asker=self.request.user)
        return qs

    def perform_create(self, serializer):
        question = serializer.save(asker=self.request.user)
        # 回答するのはツール管理者なので、質問の滞留を防ぐために通知する
        notify.question_created(question)

    def retrieve(self, request, *args, **kwargs):
        obj = self.get_object()
        Question.objects.filter(pk=obj.pk).update(view_count=F("view_count") + 1)
        obj.refresh_from_db(fields=["view_count"])
        return Response(self.get_serializer(obj).data)

    @action(
        detail=True,
        methods=["post"],
        permission_classes=[IsAuthenticated],
        url_path="toggle-resolved",
    )
    def toggle_resolved(self, request, pk=None):
        q = self.get_object()
        if q.asker != request.user and not is_admin(request.user):
            return Response(
                {"detail": "権限がありません"}, status=status.HTTP_403_FORBIDDEN
            )
        q.is_resolved = not q.is_resolved
        q.save(update_fields=["is_resolved", "updated_at"])
        return Response(self.get_serializer(q).data)


class AnswerViewSet(viewsets.ModelViewSet):
    queryset = Answer.objects.select_related("question", "author").all()
    serializer_class = AnswerSerializer
    permission_classes = [IsAnswerOwnerOrAdminOrReadOnly]

    def get_queryset(self):
        qs = super().get_queryset()
        if question_id := self.request.query_params.get("question"):
            qs = qs.filter(question_id=question_id)
        return qs

    def perform_create(self, serializer):
        answer = serializer.save(author=self.request.user)
        # 回答が付いたことを知りたいのは質問者本人
        notify.answer_created(answer)

    @action(
        detail=True,
        methods=["post"],
        permission_classes=[IsAuthenticated],
        url_path="accept",
    )
    def accept(self, request, pk=None):
        """Mark this answer as accepted (best answer).

        Owner of the question or admin may toggle. Marking an answer
        accepted un-accepts all other answers on the same question and
        flips the question's is_resolved to True as a convenience.
        """
        answer = self.get_object()
        question = answer.question
        if question.asker != request.user and not is_admin(request.user):
            return Response(
                {"detail": "権限がありません"}, status=status.HTTP_403_FORBIDDEN
            )
        target = not answer.is_accepted
        Answer.objects.filter(question=question).update(is_accepted=False)
        if target:
            answer.is_accepted = True
            answer.save(update_fields=["is_accepted", "updated_at"])
        if target and not question.is_resolved:
            question.is_resolved = True
            question.save(update_fields=["is_resolved", "updated_at"])
        return Response(AnswerSerializer(answer).data)


class DocAttachmentViewSet(
    mixins.CreateModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    """Image upload for embedding into markdown (returns absolute URL)."""

    queryset = DocAttachment.objects.all()
    serializer_class = DocAttachmentSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def perform_create(self, serializer):
        serializer.save(uploader=self.request.user)
