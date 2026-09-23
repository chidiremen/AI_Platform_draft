"""停滞しているテーマをまとめて通知する（定期実行用）。

    python manage.py notify_stalled_themes
    python manage.py notify_stalled_themes --dry-run

「停滞」は保存された状態ではなく最終進捗からの経過日数で決まる派生値
なので、誰かが画面を開かない限り誰も気づかない。そこで週1回など
タスクスケジューラから叩いて、まとめて1通で知らせる。
1件ずつ送るとチャネルが埋まるため、必ず1通にまとめる。

Windows のタスクスケジューラに登録する場合は、同梱の
scripts\\notify_stalled.bat を指定する。
"""
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db.models import Q
from django.utils import timezone

from notifications import events
from notifications import hooks as notify
from themes.models import Theme, stalled_after_days


class Command(BaseCommand):
    help = "停滞しているテーマをまとめて通知する"

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run", action="store_true", help="送信せず対象だけ表示する"
        )
        parser.add_argument(
            "--days",
            type=int,
            default=None,
            help="停滞と見なす日数（既定は THEME_STALLED_AFTER_DAYS）",
        )

    def handle(self, *args, **options):
        days = options["days"] or stalled_after_days()
        cutoff = timezone.now() - timedelta(days=days)
        # 停滞の定義はシリアライザ側と揃える（最終進捗が無ければ作成日時）
        qs = (
            Theme.objects.select_related("owner")
            .filter(status__in=list(Theme.LIVE_STATUSES))
            .filter(
                Q(last_progress_at__lt=cutoff)
                | Q(last_progress_at__isnull=True, created_at__lt=cutoff)
            )
            .order_by("last_progress_at", "created_at")
        )
        themes = list(qs)

        if not themes:
            self.stdout.write(self.style.SUCCESS(f"停滞テーマはありません（{days}日基準）。"))
            return

        self.stdout.write(f"停滞テーマ {len(themes)} 件（{days}日以上 進捗なし）:")
        for t in themes:
            self.stdout.write(
                f"  - {t.title}（{t.owner.get_username()}・{t.days_since_progress}日）"
            )

        if options["dry_run"]:
            self.stdout.write(self.style.WARNING("--dry-run のため送信していません。"))
            return
        if not events.is_configured():
            self.stdout.write(
                self.style.WARNING(
                    "POWER_AUTOMATE_WEBHOOK_URL が未設定のため送信しませんでした。"
                )
            )
            return

        notify.theme_stalled(themes)
        self.stdout.write(self.style.SUCCESS("通知しました。"))
