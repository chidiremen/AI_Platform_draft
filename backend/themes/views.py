"""テーマ / アイデアの API。

設計の要点:

- 「停滞」は保存しない派生値なので、フィルタは Python 側ではなく SQL の
  日付比較で行う（一覧のページングと件数集計を壊さないため）。
- 統合（合流）は「自分のテーマを相手に差し出す」操作と定義している。
  吸収される側の発起人が実行するので、相手側の承認は要らない。
- ステータス変更・合流・メンバー加入は ThemeEntry(kind=system) として
  タイムラインに残す。あとから軌跡を辿れることがこの機能の主目的のため。
"""
from datetime import timedelta

from django.db import transaction
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import is_admin

from .models import (
    Idea,
    IdeaComment,
    IdeaVote,
    Theme,
    ThemeEntry,
    ThemeJoinRequest,
    ThemeMember,
    stalled_after_days,
)
from .permissions import IsAuthorOrAdminOrReadOnly, IsOwnerOrAdminOrReadOnly
from .serializers import (
    IdeaCommentSerializer,
    IdeaSerializer,
    ThemeEntrySerializer,
    ThemeFreezeSerializer,
    ThemeJoinRequestSerializer,
    ThemeMemberSerializer,
    ThemeMergeSerializer,
    ThemeSerializer,
)


def _log(theme: Theme, body: str) -> ThemeEntry:
    """タイムラインにシステム記録を1件残す。"""
    return ThemeEntry.objects.create(
        theme=theme,
        kind=ThemeEntry.Kind.SYSTEM,
        body=body,
        status_at_post=theme.status,
    )


class ThemeViewSet(viewsets.ModelViewSet):
    serializer_class = ThemeSerializer
    permission_classes = [IsAuthenticated, IsOwnerOrAdminOrReadOnly]

    def get_queryset(self):
        qs = (
            Theme.objects.select_related("owner", "resulting_tool", "merged_into", "origin_idea")
            .all()
        )
        params = self.request.query_params

        status_param = params.get("status")
        if status_param:
            qs = qs.filter(status__in=[s for s in status_param.split(",") if s])

        if params.get("mine") == "true":
            qs = qs.filter(
                Q(owner=self.request.user) | Q(members__user=self.request.user)
            ).distinct()

        q = params.get("q")
        if q:
            qs = qs.filter(
                Q(title__icontains=q)
                | Q(summary__icontains=q)
                | Q(body__icontains=q)
                | Q(tags__icontains=q)
            )

        tag = params.get("tag")
        if tag:
            qs = qs.filter(tags__icontains=tag)

        category = params.get("category")
        if category:
            qs = qs.filter(work_categories__contains=[category])

        # 停滞は保存値ではないため、基準時刻（最終進捗 or 作成日時）で絞る。
        stalled = params.get("stalled")
        if stalled in ("true", "false"):
            cutoff = timezone.now() - timedelta(days=stalled_after_days())
            is_old = (
                Q(last_progress_at__lt=cutoff)
                | Q(last_progress_at__isnull=True, created_at__lt=cutoff)
            )
            live = Q(status__in=list(Theme.LIVE_STATUSES))
            qs = qs.filter(live & is_old) if stalled == "true" else qs.exclude(live & is_old)

        return qs

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["with_detail"] = self.action in ("retrieve", "create", "update", "partial_update")
        return ctx

    def perform_create(self, serializer):
        theme = serializer.save(owner=self.request.user)
        ThemeMember.objects.create(
            theme=theme, user=self.request.user, role=ThemeMember.Role.OWNER
        )
        _log(theme, "テーマを登録しました。")

    def retrieve(self, request, *args, **kwargs):
        theme = self.get_object()
        Theme.objects.filter(pk=theme.pk).update(view_count=theme.view_count + 1)
        theme.refresh_from_db(fields=["view_count"])
        return Response(self.get_serializer(theme).data)

    def perform_update(self, serializer):
        before = serializer.instance.status
        theme = serializer.save()
        if theme.status != before:
            self._apply_status_side_effects(theme, before)

    def _apply_status_side_effects(self, theme: Theme, before: str) -> None:
        label = dict(Theme.Status.choices)
        _log(theme, f"ステータスを「{label.get(before, before)}」から「{label.get(theme.status, theme.status)}」に変更しました。")

    # -- 重複検知 ---------------------------------------------------------- #
    @action(detail=False, methods=["get"], url_path="similar")
    def similar(self, request):
        """登録前に「似たテーマが既にないか」を返す。重複開発の抑止が目的。

        全文検索は入れず、タイトルの語・タグ・業務カテゴリの重なりで素朴に
        スコアリングする。件数が少ないうちはこれで十分効く。
        """
        title = (request.query_params.get("title") or "").strip()
        tags = [t.strip() for t in (request.query_params.get("tags") or "").split(",") if t.strip()]
        categories = [
            c.strip()
            for c in (request.query_params.get("categories") or "").split(",")
            if c.strip()
        ]
        exclude_id = request.query_params.get("exclude")

        if not (title or tags or categories):
            return Response([])

        qs = Theme.objects.select_related("owner").exclude(status=Theme.Status.MERGED)
        if exclude_id:
            qs = qs.exclude(pk=exclude_id)

        words = [w for w in title.replace("　", " ").split(" ") if len(w) >= 2]
        scored = []
        for theme in qs[:300]:
            score = 0
            haystack = f"{theme.title} {theme.summary} {theme.tags}".lower()
            for w in words:
                if w.lower() in haystack:
                    score += 3
            theme_tags = {t.strip().lower() for t in theme.tags.split(",") if t.strip()}
            score += 2 * len(theme_tags & {t.lower() for t in tags})
            score += len(set(theme.work_categories or []) & set(categories))
            if score:
                scored.append((score, theme))

        scored.sort(key=lambda pair: (-pair[0], pair[1].title))
        top = [t for _, t in scored[:5]]
        return Response(self.get_serializer(top, many=True).data)

    # -- タイムライン ------------------------------------------------------- #
    @action(detail=True, methods=["get", "post"], url_path="entries")
    def entries(self, request, pk=None):
        theme = self.get_object()
        if request.method == "GET":
            qs = theme.entries.select_related("author")
            return Response(self.get_entry_serializer(qs, many=True).data)

        kind = request.data.get("kind", ThemeEntry.Kind.PROGRESS)
        if kind == ThemeEntry.Kind.SYSTEM:
            raise ValidationError({"kind": "システム記録は投稿できません。"})
        # 進捗はメンバーの権利。コメントは誰でも書けるようにして、外からの
        # 助言や「それ自分もやってる」を拾えるようにする。
        if kind == ThemeEntry.Kind.PROGRESS and not (
            theme.is_member(request.user) or is_admin(request.user)
        ):
            raise PermissionDenied("進捗を書けるのはメンバーだけです。")

        serializer = self.get_entry_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        entry = serializer.save(
            theme=theme, author=request.user, status_at_post=theme.status
        )
        if entry.kind == ThemeEntry.Kind.PROGRESS:
            theme.touch_progress(entry.created_at)
        return Response(
            self.get_entry_serializer(entry).data, status=status.HTTP_201_CREATED
        )

    def get_entry_serializer(self, *args, **kwargs):
        kwargs.setdefault("context", self.get_serializer_context())
        return ThemeEntrySerializer(*args, **kwargs)

    # -- 合流（参加申請） --------------------------------------------------- #
    @action(detail=True, methods=["post"], url_path="join")
    def join(self, request, pk=None):
        theme = self.get_object()
        if theme.status == Theme.Status.MERGED:
            raise ValidationError({"detail": "統合済みのテーマには参加できません。"})
        if theme.is_member(request.user):
            raise ValidationError({"detail": "すでにメンバーです。"})
        existing = theme.join_requests.filter(
            user=request.user, status=ThemeJoinRequest.Status.PENDING
        ).first()
        if existing:
            raise ValidationError({"detail": "すでに申請済みです。"})
        req = ThemeJoinRequest.objects.create(
            theme=theme, user=request.user, message=request.data.get("message", "")
        )
        return Response(
            ThemeJoinRequestSerializer(req, context=self.get_serializer_context()).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["get"], url_path="join-requests")
    def join_requests(self, request, pk=None):
        theme = self.get_object()
        if not theme.can_edit(request.user):
            raise PermissionDenied("参加申請を見られるのは発起人だけです。")
        qs = theme.join_requests.select_related("user", "decided_by")
        return Response(
            ThemeJoinRequestSerializer(
                qs, many=True, context=self.get_serializer_context()
            ).data
        )

    @action(detail=True, methods=["post"], url_path="join-requests/(?P<req_id>[^/.]+)/resolve")
    def resolve_join_request(self, request, pk=None, req_id=None):
        theme = self.get_object()
        if not theme.can_edit(request.user):
            raise PermissionDenied("承認できるのは発起人だけです。")
        req = get_object_or_404(theme.join_requests, pk=req_id)
        if req.status != ThemeJoinRequest.Status.PENDING:
            raise ValidationError({"detail": "すでに処理済みの申請です。"})

        decision = request.data.get("status")
        if decision not in (
            ThemeJoinRequest.Status.APPROVED,
            ThemeJoinRequest.Status.REJECTED,
        ):
            raise ValidationError({"status": "approved か rejected を指定してください。"})

        with transaction.atomic():
            req.status = decision
            req.decided_by = request.user
            req.decided_at = timezone.now()
            req.save(update_fields=["status", "decided_by", "decided_at"])
            if decision == ThemeJoinRequest.Status.APPROVED:
                ThemeMember.objects.get_or_create(
                    theme=theme,
                    user=req.user,
                    defaults={"role": ThemeMember.Role.MEMBER},
                )
                _log(theme, f"{req.user.get_username()} さんが合流しました。")
        return Response(
            ThemeJoinRequestSerializer(req, context=self.get_serializer_context()).data
        )

    @action(detail=True, methods=["post"], url_path="leave")
    def leave(self, request, pk=None):
        theme = self.get_object()
        if theme.owner == request.user:
            raise ValidationError(
                {"detail": "発起人は離脱できません。統合するか、テーマを削除してください。"}
            )
        deleted, _ = theme.members.filter(user=request.user).delete()
        if not deleted:
            raise ValidationError({"detail": "メンバーではありません。"})
        _log(theme, f"{request.user.get_username()} さんが離脱しました。")
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["delete"], url_path="members/(?P<member_id>[^/.]+)")
    def remove_member(self, request, pk=None, member_id=None):
        theme = self.get_object()
        if not theme.can_edit(request.user):
            raise PermissionDenied("メンバーを外せるのは発起人だけです。")
        member = get_object_or_404(theme.members, pk=member_id)
        if member.role == ThemeMember.Role.OWNER:
            raise ValidationError({"detail": "発起人は外せません。"})
        username = member.user.get_username()
        member.delete()
        _log(theme, f"{username} さんがメンバーから外れました。")
        return Response(status=status.HTTP_204_NO_CONTENT)

    # -- 凍結 -------------------------------------------------------------- #
    @action(detail=True, methods=["post"], url_path="freeze")
    def freeze(self, request, pk=None):
        """凍結。理由を必須にしているのは、失敗の中身こそが残す価値だから。"""
        theme = self.get_object()
        if not theme.can_edit(request.user):
            raise PermissionDenied("凍結できるのは発起人だけです。")
        serializer = ThemeFreezeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        theme.status = Theme.Status.FROZEN
        theme.freeze_reason = serializer.validated_data["reason"]
        theme.frozen_at = timezone.now()
        theme.save(update_fields=["status", "freeze_reason", "frozen_at", "updated_at"])
        _log(theme, f"テーマを凍結しました。理由: {theme.freeze_reason}")
        return Response(self.get_serializer(theme).data)

    @action(detail=True, methods=["post"], url_path="reopen")
    def reopen(self, request, pk=None):
        theme = self.get_object()
        if not theme.can_edit(request.user):
            raise PermissionDenied("再開できるのは発起人だけです。")
        if theme.status != Theme.Status.FROZEN:
            raise ValidationError({"detail": "凍結中のテーマではありません。"})
        theme.status = Theme.Status.ACTIVE
        theme.frozen_at = None
        theme.save(update_fields=["status", "frozen_at", "updated_at"])
        # freeze_reason は消さない。なぜ一度止まったのかは残す価値がある。
        _log(theme, "テーマを再開しました。")
        return Response(self.get_serializer(theme).data)

    # -- 統合 -------------------------------------------------------------- #
    @action(detail=True, methods=["post"], url_path="merge")
    def merge(self, request, pk=None):
        """このテーマを別のテーマに合流させる（このテーマが吸収される側）。

        「自分の持ち物を差し出す」操作なので、相手側の承認は求めていない。
        メンバーと進捗履歴は合流先へ引き継ぐ。
        """
        theme = self.get_object()
        if not theme.can_edit(request.user):
            raise PermissionDenied("統合できるのは発起人だけです。")

        serializer = ThemeMergeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        target_id = serializer.validated_data["target"]
        if str(target_id) == str(theme.id):
            raise ValidationError({"target": "自分自身には統合できません。"})

        target = Theme.objects.filter(pk=target_id).first()
        if target is None:
            raise ValidationError({"target": "合流先のテーマが見つかりません。"})
        if target.status == Theme.Status.MERGED:
            raise ValidationError({"target": "合流先がすでに統合済みです。"})
        if theme.status == Theme.Status.MERGED:
            raise ValidationError({"detail": "このテーマはすでに統合済みです。"})

        with transaction.atomic():
            # メンバーを引き継ぐ（発起人は一般メンバーとして合流する）
            for member in theme.members.select_related("user"):
                ThemeMember.objects.get_or_create(
                    theme=target,
                    user=member.user,
                    defaults={"role": ThemeMember.Role.MEMBER},
                )
            # 進捗の軌跡も移送する。片方だけ読んでも経緯が分かるようにするため。
            moved = theme.entries.exclude(kind=ThemeEntry.Kind.SYSTEM).count()
            theme.entries.exclude(kind=ThemeEntry.Kind.SYSTEM).update(theme=target)

            theme.status = Theme.Status.MERGED
            theme.merged_into = target
            theme.merged_at = timezone.now()
            theme.save(
                update_fields=["status", "merged_into", "merged_at", "updated_at"]
            )
            _log(theme, f"「{target.title}」に統合しました。")
            _log(target, f"「{theme.title}」を統合しました（記録 {moved} 件を引き継ぎ）。")
            latest = (
                target.entries.filter(kind=ThemeEntry.Kind.PROGRESS)
                .order_by("-created_at")
                .first()
            )
            if latest:
                target.touch_progress(latest.created_at)

        target.refresh_from_db()
        return Response(
            {
                "merged": self.get_serializer(theme).data,
                "target": self.get_serializer(target).data,
            }
        )

    # -- 集計 -------------------------------------------------------------- #
    @action(detail=False, methods=["get"], url_path="summary")
    def summary(self, request):
        """部門としての「いま何が動いているか」を1発で取れる集計。"""
        qs = Theme.objects.all()
        cutoff = timezone.now() - timedelta(days=stalled_after_days())
        stalled_q = Q(status__in=list(Theme.LIVE_STATUSES)) & (
            Q(last_progress_at__lt=cutoff)
            | Q(last_progress_at__isnull=True, created_at__lt=cutoff)
        )
        by_status = {
            row["status"]: row["n"]
            for row in qs.values("status").annotate(n=Count("id"))
        }
        frozen = (
            qs.filter(status=Theme.Status.FROZEN)
            .select_related("owner")
            .order_by("-frozen_at")[:20]
        )
        return Response(
            {
                "total": qs.count(),
                "by_status": {s.value: by_status.get(s.value, 0) for s in Theme.Status},
                "stalled": qs.filter(stalled_q).count(),
                "stalled_after_days": stalled_after_days(),
                "idea_open": Idea.objects.filter(status=Idea.Status.OPEN).count(),
                "frozen_reasons": [
                    {
                        "id": str(t.id),
                        "title": t.title,
                        "reason": t.freeze_reason,
                        "owner": t.owner.get_username(),
                        "frozen_at": t.frozen_at,
                    }
                    for t in frozen
                ],
            }
        )


class ThemeEntryViewSet(viewsets.ModelViewSet):
    """タイムライン1件の編集・削除用（作成は Theme 側の action で行う）。"""

    serializer_class = ThemeEntrySerializer
    permission_classes = [IsAuthenticated, IsAuthorOrAdminOrReadOnly]
    http_method_names = ["get", "patch", "put", "delete", "head", "options"]

    def get_queryset(self):
        return ThemeEntry.objects.select_related("author", "theme")

    def perform_update(self, serializer):
        if serializer.instance.kind == ThemeEntry.Kind.SYSTEM:
            raise PermissionDenied("システム記録は編集できません。")
        serializer.save()

    def perform_destroy(self, instance):
        if instance.kind == ThemeEntry.Kind.SYSTEM:
            raise PermissionDenied("システム記録は削除できません。")
        instance.delete()


class IdeaViewSet(viewsets.ModelViewSet):
    serializer_class = IdeaSerializer
    permission_classes = [IsAuthenticated, IsAuthorOrAdminOrReadOnly]

    def get_queryset(self):
        qs = Idea.objects.select_related("author", "promoted_theme").annotate(
            vote_total=Count("votes", distinct=True),
            comment_total=Count("comments", distinct=True),
        )
        params = self.request.query_params
        if params.get("status"):
            qs = qs.filter(status__in=[s for s in params["status"].split(",") if s])
        q = params.get("q")
        if q:
            qs = qs.filter(
                Q(title__icontains=q) | Q(body__icontains=q) | Q(tags__icontains=q)
            )
        if params.get("mine") == "true":
            qs = qs.filter(author=self.request.user)
        order = params.get("order")
        if order == "votes":
            qs = qs.order_by("-vote_total", "-created_at")
        return qs

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["with_comments"] = self.action == "retrieve"
        return ctx

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)

    @action(detail=True, methods=["post"], url_path="vote")
    def vote(self, request, pk=None):
        """賛同のトグル。「欲しい人が何人いるか」が実装の動機になる。"""
        idea = self.get_object()
        existing = IdeaVote.objects.filter(idea=idea, user=request.user).first()
        if existing:
            existing.delete()
            voted = False
        else:
            IdeaVote.objects.create(idea=idea, user=request.user)
            voted = True
        return Response({"voted_by_me": voted, "vote_count": idea.votes.count()})

    @action(detail=True, methods=["get", "post"], url_path="comments")
    def comments(self, request, pk=None):
        idea = self.get_object()
        if request.method == "GET":
            qs = idea.comments.select_related("author")
            return Response(
                IdeaCommentSerializer(
                    qs, many=True, context=self.get_serializer_context()
                ).data
            )
        serializer = IdeaCommentSerializer(
            data=request.data, context=self.get_serializer_context()
        )
        serializer.is_valid(raise_exception=True)
        comment = serializer.save(idea=idea, author=request.user)
        return Response(
            IdeaCommentSerializer(
                comment, context=self.get_serializer_context()
            ).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path="promote")
    def promote(self, request, pk=None):
        """アイデアをテーマに昇格させる。手を挙げた人が発起人になる。"""
        idea = self.get_object()
        if idea.status == Idea.Status.ADOPTED:
            raise ValidationError({"detail": "すでにテーマ化されています。"})

        with transaction.atomic():
            theme = Theme.objects.create(
                title=request.data.get("title") or idea.title,
                summary=(request.data.get("summary") or idea.title)[:280],
                body=request.data.get("body") or idea.body,
                status=Theme.Status.ACTIVE,
                tags=idea.tags,
                work_categories=idea.work_categories,
                owner=request.user,
                origin_idea=idea,
            )
            ThemeMember.objects.create(
                theme=theme, user=request.user, role=ThemeMember.Role.OWNER
            )
            _log(theme, f"アイデア「{idea.title}」から着手しました。")
            idea.status = Idea.Status.ADOPTED
            idea.promoted_theme = theme
            idea.save(update_fields=["status", "promoted_theme", "updated_at"])

        return Response(
            ThemeSerializer(theme, context=self.get_serializer_context()).data,
            status=status.HTTP_201_CREATED,
        )


class IdeaCommentViewSet(viewsets.ModelViewSet):
    serializer_class = IdeaCommentSerializer
    permission_classes = [IsAuthenticated, IsAuthorOrAdminOrReadOnly]
    http_method_names = ["get", "patch", "put", "delete", "head", "options"]

    def get_queryset(self):
        return IdeaComment.objects.select_related("author", "idea")
