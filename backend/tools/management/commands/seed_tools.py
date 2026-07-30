"""デモ用のツールを投入する（実APIモード用）。

モックモード（`VITE_USE_MOCK=true`）ではフロントの `data/tools.ts` の 13 件が
表示されるが、実APIモードでは DB が空なのでカタログが真っ白になり、いいねや
ダッシュボードの数字も全て 0 になる。モック↔実API を切り替えても見え方が
揃うように、同じ 13 件を DB へ投入する。

    python manage.py seed_tools              # 投入（既存はスキップ）
    python manage.py seed_tools --with-metrics   # いいね/申請/閲覧ログも作る
    python manage.py seed_tools --reset      # 既存のデモツールを消してから投入

`--with-metrics` を付けると、ダッシュボードとファネルが空にならないよう
Like / AccessRequest / ActivityLog も作成する。
"""

from __future__ import annotations

import random

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from metrics.models import ActivityLog
from tools.models import AccessRequest, AspiceProcess, Like, Tool, ToolAspiceProcess

User = get_user_model()

SEED_TOOLS = [
    {
        "legacy_id": "1",
        "title": "A-SPICE要件トレーサビリティチェッカー",
        "summary": "要件間のトレーサビリティマトリクスをAIが自動検証し、抜け漏れを検出するCopilotエージェント",
        "tool_type": "copilot_agent",
        "access_url": "https://copilotstudio.microsoft.com/agents/traceability-checker",
        "author": "田中太郎",
        "aspice": [
            "SWE.1",
            "SWE.2"
        ],
        "work": [],
        "tags": [
            "traceability",
            "requirements",
            "copilot"
        ],
        "effect_qualitative": "要件レビューの抜け漏れチェック工数が半減した",
        "effect_hours": 20.0,
        "likes": 24,
        "views": 456,
        "impressions": 1820,
        "downloads": 0,
        "requests": 8,
        "created_at": "2026-05-10"
    },
    {
        "legacy_id": "2",
        "title": "テスト仕様書ドラフトジェネレータ",
        "summary": "詳細設計書からテスト仕様書のドラフトを自動生成するNotebookLMノート",
        "tool_type": "notebook_lm",
        "access_url": "https://notebooklm.google.com/notebook/test-spec-generator",
        "author": "鈴木花子",
        "aspice": [
            "SWE.5",
            "SWE.6"
        ],
        "work": [],
        "tags": [
            "test",
            "documentation",
            "notebooklm"
        ],
        "effect_qualitative": "テスト仕様書の初版作成時間を3割削減",
        "effect_hours": 12.0,
        "likes": 18,
        "views": 312,
        "impressions": 1340,
        "downloads": 0,
        "requests": 12,
        "created_at": "2026-04-22"
    },
    {
        "legacy_id": "3",
        "title": "MISRA-C準拠コードレビューアシスタント",
        "summary": "GitHub Copilotを活用したMISRA-C:2023準拠の静的解析補助ツール",
        "tool_type": "github_repo",
        "access_url": "https://github.com/pas-internal/misra-c-review-assistant",
        "author": "佐藤一郎",
        "aspice": [
            "SWE.3",
            "SWE.4"
        ],
        "work": [],
        "tags": [
            "misra",
            "code-review",
            "static-analysis"
        ],
        "effect_qualitative": "コードレビュー指摘のうち定型的なものを自動化",
        "effect_hours": 28.0,
        "likes": 31,
        "views": 567,
        "impressions": 2100,
        "downloads": 0,
        "requests": 15,
        "created_at": "2026-03-15"
    },
    {
        "legacy_id": "4",
        "title": "議事録→アクションアイテム自動抽出",
        "summary": "会議の議事録テキストからアクションアイテムと担当者を自動抽出するPythonスクリプト",
        "tool_type": "zip_upload",
        "access_url": "",
        "author": "山田次郎",
        "aspice": [
            "MAN.3"
        ],
        "work": [
            "meeting",
            "task_mgmt"
        ],
        "tags": [
            "meeting",
            "productivity",
            "python"
        ],
        "effect_qualitative": "議事録整理の手間がほぼゼロに",
        "effect_hours": 8.0,
        "likes": 45,
        "views": 890,
        "impressions": 3050,
        "downloads": 34,
        "requests": 0,
        "created_at": "2026-06-01"
    },
    {
        "legacy_id": "5",
        "title": "変更影響分析サポートエージェント",
        "summary": "ECU仕様変更時の影響範囲をソースコードとドキュメントから横断分析するCopilotエージェント",
        "tool_type": "copilot_agent",
        "access_url": "https://copilotstudio.microsoft.com/agents/impact-analysis",
        "author": "高橋美咲",
        "aspice": [
            "SUP.10",
            "SWE.2",
            "SWE.3"
        ],
        "work": [],
        "tags": [
            "impact-analysis",
            "change-management",
            "ecu"
        ],
        "effect_qualitative": "影響範囲の調査漏れリスクを低減",
        "effect_hours": 16.0,
        "likes": 29,
        "views": 423,
        "impressions": 1650,
        "downloads": 0,
        "requests": 11,
        "created_at": "2026-05-28"
    },
    {
        "legacy_id": "6",
        "title": "サプライヤー進捗レポート自動要約",
        "summary": "サプライヤーからの週次レポートを自動要約し、リスク項目をハイライトするNotebookLMノート",
        "tool_type": "notebook_lm",
        "access_url": "https://notebooklm.google.com/notebook/supplier-report-summary",
        "author": "中村健太",
        "aspice": [
            "ACQ.4",
            "MAN.3"
        ],
        "work": [
            "document",
            "knowledge"
        ],
        "tags": [
            "supplier",
            "summary",
            "risk"
        ],
        "effect_qualitative": "週次レポート確認時間を短縮",
        "effect_hours": 6.0,
        "likes": 15,
        "views": 234,
        "impressions": 980,
        "downloads": 0,
        "requests": 6,
        "created_at": "2026-04-05"
    },
    {
        "legacy_id": "7",
        "title": "デグレード検知テスト自動生成",
        "summary": "既存テストケースと変更差分からリグレッションテストを自動生成するPythonツール",
        "tool_type": "zip_upload",
        "access_url": "",
        "author": "小林陽子",
        "aspice": [
            "SWE.5",
            "SYS.4"
        ],
        "work": [],
        "tags": [
            "regression",
            "test-generation",
            "python"
        ],
        "effect_qualitative": "リグレッションテスト設計の初動を高速化",
        "effect_hours": 10.0,
        "likes": 22,
        "views": 345,
        "impressions": 1280,
        "downloads": 19,
        "requests": 0,
        "created_at": "2026-05-18"
    },
    {
        "legacy_id": "8",
        "title": "品質メトリクスダッシュボード生成",
        "summary": "コードメトリクス（複雑度、カバレッジ等）からA-SPICE SUP.1準拠の品質レポートを自動生成",
        "tool_type": "github_repo",
        "access_url": "https://github.com/pas-internal/quality-metrics-dashboard",
        "author": "渡辺裕介",
        "aspice": [
            "SUP.1",
            "SWE.4"
        ],
        "work": [],
        "tags": [
            "metrics",
            "quality",
            "dashboard"
        ],
        "effect_qualitative": "品質レポート作成を自動化",
        "effect_hours": 14.0,
        "likes": 17,
        "views": 289,
        "impressions": 1120,
        "downloads": 0,
        "requests": 9,
        "created_at": "2026-06-10"
    },
    {
        "legacy_id": "9",
        "title": "構成管理ルール違反検出Bot",
        "summary": "GitHubリポジトリのブランチ戦略・コミットメッセージ規約違反を自動検出し通知",
        "tool_type": "github_repo",
        "access_url": "https://github.com/pas-internal/scm-rule-bot",
        "author": "伊藤真理",
        "aspice": [
            "SUP.8"
        ],
        "work": [],
        "tags": [
            "config-management",
            "git",
            "bot"
        ],
        "effect_qualitative": "構成管理ルールの逸脱を早期検知",
        "effect_hours": 5.0,
        "likes": 13,
        "views": 198,
        "impressions": 760,
        "downloads": 0,
        "requests": 4,
        "created_at": "2026-05-05"
    },
    {
        "legacy_id": "10",
        "title": "システム要件↔テスト双方向トレーサ",
        "summary": "システム要件とシステムテスト仕様の双方向トレーサビリティを可視化するWebツール",
        "tool_type": "zip_upload",
        "access_url": "",
        "author": "松本大輔",
        "aspice": [
            "SYS.2",
            "SYS.5"
        ],
        "work": [],
        "tags": [
            "traceability",
            "system-test",
            "visualization"
        ],
        "effect_qualitative": "システムレベルのトレーサビリティを一目で把握",
        "effect_hours": 9.0,
        "likes": 20,
        "views": 378,
        "impressions": 1410,
        "downloads": 16,
        "requests": 0,
        "created_at": "2026-04-28"
    },
    {
        "legacy_id": "11",
        "title": "メール返信ドラフト生成エージェント",
        "summary": "受信メールの内容に応じて返信ドラフトを自動生成するOutlook向けCopilotエージェント",
        "tool_type": "copilot_agent",
        "access_url": "https://copilotstudio.microsoft.com/agents/mail-replier",
        "author": "佐藤一郎",
        "aspice": [],
        "work": [
            "mail",
            "translation"
        ],
        "tags": [
            "outlook",
            "mail",
            "productivity"
        ],
        "effect_qualitative": "メール返信の初動が10分→2分に短縮",
        "effect_hours": 22.0,
        "likes": 38,
        "views": 612,
        "impressions": 2240,
        "downloads": 0,
        "requests": 18,
        "created_at": "2026-06-08"
    },
    {
        "legacy_id": "12",
        "title": "Teams会議リアルタイム要約Bot",
        "summary": "Teams会議中の発言をリアルタイムに要約し、決定事項とTODOを抽出するBot",
        "tool_type": "other",
        "access_url": "https://teams.microsoft.com/apps/meeting-summarizer",
        "author": "高橋美咲",
        "aspice": [],
        "work": [
            "meeting",
            "chat",
            "task_mgmt"
        ],
        "tags": [
            "teams",
            "meeting",
            "realtime"
        ],
        "effect_qualitative": "会議後の議事録作成工数がほぼゼロに",
        "effect_hours": 18.0,
        "likes": 52,
        "views": 780,
        "impressions": 2890,
        "downloads": 0,
        "requests": 24,
        "created_at": "2026-06-12"
    },
    {
        "legacy_id": "13",
        "title": "社内AIプロンプト集（部内ベストプラクティス）",
        "summary": "部内で実証済みのAIプロンプトを業務シーン別に検索できる、AI活用促進のためのプラットフォーム",
        "tool_type": "notebook_lm",
        "access_url": "https://notebooklm.google.com/notebook/internal-prompts",
        "author": "中村健太",
        "aspice": [],
        "work": [
            "ai_enablement",
            "knowledge"
        ],
        "tags": [
            "prompt",
            "best-practice",
            "enablement"
        ],
        "effect_qualitative": "「何にAIを使えばいいか分からない」層の活用着手率が向上",
        "effect_hours": 0.0,
        "likes": 67,
        "views": 1024,
        "impressions": 3560,
        "downloads": 0,
        "requests": 31,
        "created_at": "2026-06-14"
    }
]


class Command(BaseCommand):
    help = "デモ用ツール 13 件を投入する（モックと同じ内容）"

    def add_arguments(self, parser):
        parser.add_argument(
            "--with-metrics",
            action="store_true",
            help="いいね/申請/閲覧ログも作り、ダッシュボードに数字が出る状態にする",
        )
        parser.add_argument(
            "--reset",
            action="store_true",
            help="同名の既存デモツールを削除してから投入する",
        )

    @transaction.atomic
    def handle(self, *args, **opts):
        users = list(User.objects.all())
        if not users:
            self.stdout.write(
                self.style.ERROR(
                    "ユーザーが 0 件です。先に `python manage.py seed_data` を実行してください。"
                )
            )
            return

        # 表示名（またはユーザー名）→ User の対応表。該当が無ければ先頭ユーザー。
        by_name = {}
        for u in users:
            by_name[u.display_name or u.username] = u
            by_name.setdefault(u.username, u)
        fallback = (
            User.objects.filter(role__in=["admin", "tool_admin"]).first() or users[0]
        )

        if opts["reset"]:
            titles = [t["title"] for t in SEED_TOOLS]
            n, _ = Tool.objects.filter(title__in=titles).delete()
            self.stdout.write(self.style.WARNING(f"既存のデモツールを削除: {n} 行"))

        rng = random.Random(20260730)  # 再現性のため固定シード
        created_count = 0

        if opts["with_metrics"]:
            wanted = max(t.get("likes", 0) for t in SEED_TOOLS)
            if len(users) < wanted:
                # Like は (tool, user) ユニークなので、ユーザー数を超えるいいねは作れない
                self.stdout.write(
                    self.style.WARNING(
                        f"注: 登録ユーザーが {len(users)} 人のため、いいね数は最大 "
                        f"{len(users)} で打ち切られます（モック表示は最大 {wanted}）。"
                        "実データに近づけたい場合はユーザーを増やしてから再実行してください。"
                    )
                )

        for row in SEED_TOOLS:
            author = by_name.get(row["author"], fallback)
            tool, created = Tool.objects.get_or_create(
                title=row["title"],
                defaults={
                    "summary": row["summary"],
                    "readme": row.get("readme") or f"## {row['title']}\n\n{row['summary']}\n",
                    "tool_type": row["tool_type"],
                    "access_url": row.get("access_url") or "",
                    "tags": ", ".join(row.get("tags") or []),
                    "work_categories": row.get("work") or [],
                    "effect_qualitative": row.get("effect_qualitative") or "",
                    "effect_hours_per_month": row.get("effect_hours") or None,
                    "author": author,
                },
            )
            if not created:
                self.stdout.write(f"= {row['title']}（既に存在）")
                continue
            created_count += 1
            self.stdout.write(self.style.SUCCESS(f"+ {row['title']}"))

            # A-SPICE プロセスの紐付け
            for pid in row.get("aspice") or []:
                proc = AspiceProcess.objects.filter(id=pid).first()
                if proc:
                    ToolAspiceProcess.objects.get_or_create(tool=tool, process=proc)

            if not opts["with_metrics"]:
                continue

            # ── いいね ──
            # 実ユーザー数を超える分は作れないので min を取る
            likers = rng.sample(users, min(row.get("likes", 0), len(users)))
            for u in likers:
                Like.objects.get_or_create(tool=tool, user=u)

            # ── アクセス権申請 ──
            requesters = rng.sample(users, min(row.get("requests", 0), len(users)))
            for i, u in enumerate(requesters):
                if u == author:
                    continue
                AccessRequest.objects.get_or_create(
                    tool=tool,
                    requester=u,
                    defaults={
                        "reason": "デモ用の申請データ",
                        # 一部を未処理のまま残してマイページの承認フローを試せるように
                        "status": "pending" if i % 3 == 0 else "granted",
                    },
                )

            # ── ActivityLog（ダッシュボード/ファネル用） ──
            # 件数が多いので bulk_create でまとめて入れる
            logs = []
            for action, count in (
                ("impression", row.get("impressions", 0)),
                ("view", row.get("views", 0)),
                ("download", row.get("downloads", 0)),
            ):
                # そのままだと数千行になるので 1/10 に間引く（傾向は保つ）
                n = max(0, count // 10)
                for _ in range(n):
                    logs.append(
                        ActivityLog(
                            tool=tool,
                            action=action,
                            user=rng.choice(users),
                        )
                    )
            # README 閲覧は詳細閲覧の半分程度と仮定
            for _ in range(max(0, row.get("views", 0) // 20)):
                logs.append(
                    ActivityLog(tool=tool, action="readme_scroll", user=rng.choice(users))
                )
            if logs:
                ActivityLog.objects.bulk_create(logs, batch_size=500)

        self.stdout.write(
            self.style.SUCCESS(
                f"\n完了: 新規 {created_count} 件 / 全 {Tool.objects.count()} 件"
            )
        )
        if opts["with_metrics"]:
            self.stdout.write(
                f"Like={Like.objects.count()} "
                f"AccessRequest={AccessRequest.objects.count()} "
                f"ActivityLog={ActivityLog.objects.count()}"
            )
