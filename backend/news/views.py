from __future__ import annotations

from datetime import timedelta

from django.db.models import Q
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import is_admin
from forum.models import ForumThread

from .models import NewsArticle
from .serializers import NewsArticleSerializer


def build_discussion_body(article: NewsArticle) -> str:
    """ニュース記事から議論スレッドの 1 レス目を組み立てる。

    掲示板は Markdown ではなく素のテキスト表示なので、装飾は使わない。
    """
    lines = [f"【ニュース】{article.display_title}"]
    if article.title_ja and article.title and article.title_ja != article.title:
        lines.append(f"原題: {article.title}")
    meta = " / ".join(x for x in [article.source, article.category] if x)
    if meta:
        lines.append(meta)
    if article.published:
        lines.append(f"公開: {article.published:%Y-%m-%d}")
    lines.append("")
    if article.summary:
        lines.append(article.summary)
        lines.append("")
    lines.append(f"元記事: {article.link}")
    lines.append("")
    lines.append("このニュースについて自由に議論してください。")
    return "\n".join(lines)


class NewsArticleViewSet(viewsets.ReadOnlyModelViewSet):
    """ニュース記事。読み取りは認証ユーザー全員、書き換えは管理者のみ。

    フィルタ（クエリパラメータ）:
      * ``?q=text``       — タイトル / 要約 / ソース
      * ``?category=...``
      * ``?source=...``
      * ``?days=7``       — 直近 N 日（published 基準、無い場合は collected_at）
      * ``?limit=5``      — 件数上限（バナー用に少数だけ取りたいとき）
    """

    queryset = NewsArticle.objects.select_related("discussion_thread").all()
    serializer_class = NewsArticleSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        p = self.request.query_params

        # 非表示にされた記事は管理者以外には見せない
        if not is_admin(self.request.user):
            qs = qs.filter(is_visible=True)

        if q := p.get("q"):
            qs = qs.filter(
                Q(title__icontains=q)
                | Q(title_ja__icontains=q)
                | Q(summary__icontains=q)
                | Q(source__icontains=q)
            )
        if cat := p.get("category"):
            qs = qs.filter(category=cat)
        if src := p.get("source"):
            qs = qs.filter(source=src)
        if days := p.get("days"):
            try:
                since = timezone.now() - timedelta(days=int(days))
                qs = qs.filter(Q(published__gte=since) | Q(collected_at__gte=since))
            except ValueError:
                pass

        if limit := p.get("limit"):
            try:
                n = max(1, min(int(limit), 100))
                # スライスすると後段でフィルタできなくなるので、ID を絞る形にする
                ids = list(qs.values_list("pk", flat=True)[:n])
                qs = NewsArticle.objects.select_related("discussion_thread").filter(
                    pk__in=ids
                )
            except ValueError:
                pass
        return qs

    @action(detail=False, methods=["get"])
    def meta(self, request):
        """フィルタ UI 用のカテゴリ / ソース一覧と総件数。"""
        base = self.get_queryset()
        return Response(
            {
                "count": base.count(),
                "categories": sorted(
                    x for x in base.values_list("category", flat=True).distinct() if x
                ),
                "sources": sorted(
                    x for x in base.values_list("source", flat=True).distinct() if x
                ),
            }
        )

    @action(detail=True, methods=["post"])
    def discuss(self, request, pk=None):
        """このニュースの議論スレッドを取得、無ければ作成して返す。

        記事 1 件につきスレッド 1 本（OneToOne）。2 人目以降が押したときは
        既存スレッドへ合流させたいので get-or-create にしている。
        """
        article = self.get_object()

        # 既にあればそれを返す（作成者以外が押しても同じスレへ行く）
        if article.discussion_thread_id:
            return Response(
                {
                    "thread_id": str(article.discussion_thread_id),
                    "created": False,
                }
            )

        thread = ForumThread.objects.create(
            title=f"【ニュース】{article.display_title}"[:200],
            body=build_discussion_body(article),
            category=ForumThread.Category.DISCUSSION,
            tags=", ".join(x for x in ["ニュース", article.category] if x)[:200],
            author=request.user,
            # ニュース起点のスレはシステム投稿として扱い、名無し表記にする
            poster_name="",
            last_posted_at=timezone.now(),
        )
        article.discussion_thread = thread
        article.save(update_fields=["discussion_thread", "updated_at"])
        return Response(
            {"thread_id": str(thread.id), "created": True},
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path="toggle-visible")
    def toggle_visible(self, request, pk=None):
        """記事の表示 / 非表示を切り替える（管理者のみ）。"""
        if not is_admin(request.user):
            return Response(
                {"detail": "権限がありません"}, status=status.HTTP_403_FORBIDDEN
            )
        article = self.get_object()
        article.is_visible = not article.is_visible
        article.save(update_fields=["is_visible", "updated_at"])
        return Response(self.get_serializer(article).data)
