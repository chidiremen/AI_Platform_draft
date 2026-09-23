"""デモ・動作確認用のテーマ / アイデアを投入する。

    python manage.py seed_themes            # 無ければ作る（冪等）
    python manage.py seed_themes --reset    # 一度消してから作り直す

停滞・凍結・完了・統合・アイデア昇格が一通り揃うようにしてあるので、
一覧のフィルタやダッシュボードの集計をすぐ確認できる。
"""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils import timezone

from themes.models import (
    Idea,
    IdeaVote,
    Theme,
    ThemeEntry,
    ThemeJoinRequest,
    ThemeMember,
)

User = get_user_model()

THEMES = [
    {
        "title": "議事録の自動要約",
        "summary": "Teams 会議の文字起こしから議事録ドラフトを自動生成する",
        "status": Theme.Status.ACTIVE,
        "tags": "議事録, 要約, Copilot",
        "work_categories": ["meeting"],
        "progress": [
            (20, "文字起こしの取得まで確認。精度は実用範囲。"),
            (55, "要約プロンプトを3案比較。決定事項の抽出が弱い。"),
        ],
        "age_days": 3,
    },
    {
        "title": "テスト仕様書のレビュー観点抽出",
        "summary": "過去の指摘履歴から、レビュー時に見るべき観点を提示する",
        "status": Theme.Status.RECRUITING,
        "tags": "テスト, レビュー",
        "work_categories": ["document"],
        "progress": [],
        "age_days": 5,
    },
    {
        "title": "設計書の表記ゆれチェック",
        "summary": "用語集と突き合わせて表記ゆれを検出する",
        "status": Theme.Status.ACTIVE,
        "tags": "設計書, 校正",
        "work_categories": ["document"],
        "progress": [(30, "用語集の整備から着手。")],
        "age_days": 70,  # 停滞の見本
    },
    {
        "title": "問い合わせ一次回答の自動化",
        "summary": "過去のQ&Aから一次回答案を出す",
        "status": Theme.Status.FROZEN,
        "tags": "問い合わせ, RAG",
        "work_categories": ["mail"],
        "progress": [(40, "RAG を試作。既存FAQの粒度が粗く回答が的外れになる。")],
        "freeze_reason": "FAQ の粒度が粗く、回答精度が実用水準に届かなかった。"
        "先に FAQ の再整備が必要という結論。",
        "age_days": 40,
    },
    {
        "title": "コードレビューコメントの下書き",
        "summary": "差分から指摘候補を出す",
        "status": Theme.Status.DONE,
        "tags": "レビュー, GitHub",
        "work_categories": ["development"],
        "progress": [(100, "社内試用で好評。ツールカタログに登録した。")],
        "age_days": 20,
    },
]

IDEAS = [
    {
        "title": "経費精算の入力を自動化したい",
        "body": "領収書の写真から金額と費目を拾ってほしい。毎月30分溶けている。",
        "tags": "経費, OCR",
        "work_categories": ["other"],
        "votes": 3,
    },
    {
        "title": "仕様変更の影響範囲を出してほしい",
        "body": "変更した要件から、影響しそうなテストケースを列挙してくれると助かる。",
        "tags": "要件, 影響分析",
        "work_categories": ["document"],
        "votes": 5,
    },
]


class Command(BaseCommand):
    help = "テーマ・アイデアのサンプルデータを投入する"

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset", action="store_true", help="既存のテーマ・アイデアを削除してから作る"
        )

    def handle(self, *args, **options):
        users = list(User.objects.order_by("id")[:4])
        if not users:
            self.stderr.write(
                self.style.ERROR(
                    "ユーザーが1人もいません。先に createsuperuser か seed_data を実行してください。"
                )
            )
            return

        if options["reset"]:
            Theme.objects.all().delete()
            Idea.objects.all().delete()
            self.stdout.write("既存のテーマ・アイデアを削除しました。")

        created = 0
        themes = {}
        for i, spec in enumerate(THEMES):
            owner = users[i % len(users)]
            theme, was_created = Theme.objects.get_or_create(
                title=spec["title"],
                defaults={
                    "summary": spec["summary"],
                    "body": f"## 背景\n{spec['summary']}\n\n## 進め方\n小さく試して判断する。",
                    "status": spec["status"],
                    "tags": spec["tags"],
                    "work_categories": spec["work_categories"],
                    "owner": owner,
                    "freeze_reason": spec.get("freeze_reason", ""),
                },
            )
            themes[spec["title"]] = theme
            if not was_created:
                continue
            created += 1

            ThemeMember.objects.get_or_create(
                theme=theme, user=owner, defaults={"role": ThemeMember.Role.OWNER}
            )
            if spec["status"] == Theme.Status.FROZEN:
                theme.frozen_at = timezone.now() - timedelta(days=spec["age_days"])

            base = timezone.now() - timedelta(days=spec["age_days"])
            last = None
            for n, (percent, body) in enumerate(spec["progress"]):
                entry = ThemeEntry.objects.create(
                    theme=theme,
                    kind=ThemeEntry.Kind.PROGRESS,
                    body=body,
                    progress_percent=percent,
                    status_at_post=theme.status,
                    author=owner,
                )
                when = base + timedelta(days=n)
                ThemeEntry.objects.filter(pk=entry.pk).update(created_at=when)
                last = when
            theme.last_progress_at = last
            theme.save(update_fields=["last_progress_at", "frozen_at"])
            # 作成日時も過去にずらす（停滞の見本を成立させるため）
            Theme.objects.filter(pk=theme.pk).update(created_at=base)

        # 仲間募集中のテーマに承認待ちの申請を1件置いておく
        recruiting = themes.get("テスト仕様書のレビュー観点抽出")
        if recruiting and len(users) > 1:
            applicant = next((u for u in users if u != recruiting.owner), None)
            if applicant:
                ThemeJoinRequest.objects.get_or_create(
                    theme=recruiting,
                    user=applicant,
                    status=ThemeJoinRequest.Status.PENDING,
                    defaults={"message": "テスト設計の経験があります。手伝えます。"},
                )

        for i, spec in enumerate(IDEAS):
            idea, was_created = Idea.objects.get_or_create(
                title=spec["title"],
                defaults={
                    "body": spec["body"],
                    "tags": spec["tags"],
                    "work_categories": spec["work_categories"],
                    "author": users[(i + 1) % len(users)],
                },
            )
            if not was_created:
                continue
            created += 1
            for u in users[: spec["votes"]]:
                IdeaVote.objects.get_or_create(idea=idea, user=u)

        self.stdout.write(
            self.style.SUCCESS(
                f"完了: テーマ {Theme.objects.count()} 件 / アイデア {Idea.objects.count()} 件"
                f"（今回新規 {created} 件）"
            )
        )
