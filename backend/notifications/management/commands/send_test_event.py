"""Power Automate のフローを組むときに使うテスト送信。

    python manage.py send_test_event                 # イベント一覧を表示
    python manage.py send_test_event tool.created    # 実際に送る
    python manage.py send_test_event tool.created --dry-run  # 中身だけ見る

フローを作る手順としては、まず --dry-run でペイロードの形を確認し、
Power Automate の「HTTP 要求の受信時」に JSON スキーマとして貼り付け、
その後で実送信して疎通を確認する、という流れを想定している。
"""
import json

from django.core.management.base import BaseCommand, CommandError

from notifications import events


class Command(BaseCommand):
    help = "Power Automate へテストイベントを送る（フロー構築用）"

    def add_arguments(self, parser):
        parser.add_argument("event", nargs="?", help="イベント名。省略すると一覧を表示")
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="送信せずペイロードだけ表示する",
        )
        parser.add_argument("--to", default="", help="宛先メール（カンマ区切り）")

    def handle(self, *args, **options):
        name = options.get("event")
        if not name:
            self._list_events()
            return
        if name not in events.EVENT_CATALOG:
            raise CommandError(
                f"未知のイベント: {name}\n"
                f"利用できるイベント: {', '.join(events.EVENT_CATALOG)}"
            )

        payload = self._sample(name, options["to"])
        self.stdout.write(json.dumps(payload, ensure_ascii=False, indent=2))

        if options["dry_run"]:
            self.stdout.write(self.style.WARNING("\n--dry-run のため送信していません。"))
            return
        if not events.is_configured():
            raise CommandError(
                "POWER_AUTOMATE_WEBHOOK_URL が未設定です。.env に設定してください。"
            )

        status = events.send(payload)
        if status == events.WebhookStatus.SENT:
            self.stdout.write(self.style.SUCCESS("\n送信しました。"))
        elif status == events.WebhookStatus.SKIPPED:
            self.stdout.write(
                self.style.WARNING("\n送信しませんでした（設定で無効化されています）。")
            )
        else:
            raise CommandError(
                "\n送信に失敗しました。詳細は Django admin の「Webhook送信ログ」を確認してください。"
            )

    def _list_events(self):
        self.stdout.write("")
        self.stdout.write(self.style.MIGRATE_HEADING("送信できるイベント"))
        for name, desc in events.EVENT_CATALOG.items():
            mark = " " if events.is_enabled(name) else "×"
            self.stdout.write(f"  {mark} {name:<28} {desc}")
        self.stdout.write("")
        self.stdout.write(f"  送信先 : {events.webhook_url() or '(未設定)'}")
        self.stdout.write(f"  リンク : {events.frontend_base_url()}")
        allowed = events.enabled_events()
        self.stdout.write(
            f"  有効化 : {'全イベント' if allowed is None else ', '.join(sorted(allowed))}"
        )
        self.stdout.write("")
        self.stdout.write("  例: python manage.py send_test_event tool.created --dry-run")
        self.stdout.write("")

    def _sample(self, name: str, to: str) -> dict:
        """イベントごとの代表的なペイロード。data の形はフロー側の参照用。"""
        base = events.link("/tools/00000000-0000-0000-0000-000000000000")
        samples = {
            events.Event.TOOL_CREATED: dict(
                title="🆕 新しいツールが登録されました",
                summary="田中 太郎 さんが「議事録要約くん」を登録しました",
                url=base,
                data={
                    "tool_id": "00000000-0000-0000-0000-000000000000",
                    "title": "議事録要約くん",
                    "summary": "Teams の文字起こしから議事録ドラフトを作る",
                    "tool_type": "copilot_agent",
                    "tags": ["議事録", "要約"],
                    "work_categories": ["meeting"],
                    "effect_qualitative": "議事録作成の手間が減る",
                    "effect_hours_per_month": 5.0,
                    "access_url": "https://example.invalid/agent",
                    "has_zip": False,
                },
            ),
            events.Event.ACCESS_REQUEST_CREATED: dict(
                title="📬 アクセス権の申請があります",
                summary="佐藤 花子 さんが「議事録要約くん」のアクセス権を申請しました",
                url=events.link("/mypage"),
                data={
                    "request_id": "11111111-1111-1111-1111-111111111111",
                    "tool_id": "00000000-0000-0000-0000-000000000000",
                    "tool_title": "議事録要約くん",
                    "tool_type": "github_repo",
                    "requester": "佐藤 花子",
                    "requester_email": "hanako@example.invalid",
                    "reason": "テスト設計で使いたいため",
                    "owner": "田中 太郎",
                },
            ),
            events.Event.THEME_CREATED: dict(
                title="🚀 新しいテーマが始まりました",
                summary="田中 太郎 さんが「議事録の自動要約」に着手します",
                url=events.link("/themes/22222222-2222-2222-2222-222222222222"),
                data={
                    "theme_id": "22222222-2222-2222-2222-222222222222",
                    "title": "議事録の自動要約",
                    "summary": "Teams 会議の文字起こしから議事録ドラフトを作る",
                    "status": "recruiting",
                    "tags": ["議事録"],
                    "work_categories": ["meeting"],
                    "recruiting": True,
                },
            ),
            events.Event.THEME_FROZEN: dict(
                title="🧊 テーマが凍結されました",
                summary="「問い合わせ一次回答の自動化」が凍結されました: FAQ の粒度が粗く精度が出なかった",
                url=events.link("/themes/33333333-3333-3333-3333-333333333333"),
                data={
                    "theme_id": "33333333-3333-3333-3333-333333333333",
                    "title": "問い合わせ一次回答の自動化",
                    "reason": "FAQ の粒度が粗く精度が出なかった",
                    "owner": "田中 太郎",
                },
            ),
        }
        spec = samples.get(
            name,
            dict(
                title=f"[テスト] {events.EVENT_CATALOG[name]}",
                summary="これは send_test_event によるテスト送信です。",
                url=events.frontend_base_url(),
                data={"test": True},
            ),
        )
        recipients = [e.strip() for e in to.split(",") if e.strip()] if to else None
        return events.build_payload(name, to=recipients, **spec)
