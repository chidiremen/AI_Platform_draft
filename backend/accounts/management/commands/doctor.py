"""`manage.py doctor` — セットアップ診断。

A/B の2フォルダ構成で運用中のデータをコピーしてきたときに、
「ログインできない」の原因を切り分けるためのコマンド。
よくある原因（モックモード / DBの置き場所 / 未適用マイグレーション /
media の未コピー）をまとめて報告する。

読み取り専用で、データは一切変更しない。
"""
import os
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import connections
from django.db.migrations.executor import MigrationExecutor

from config.envfile import ENCODINGS

MARK = "★"


class Command(BaseCommand):
    help = "セットアップ状況を診断する（読み取り専用）"

    def handle(self, *args, **options):
        self.problems = []
        self.stdout.write("")
        self.stdout.write("=== AI Tool Catalog セットアップ診断 ===")
        self._section_env()
        self._section_db()
        self._section_users()
        self._section_media()
        self._verdict()

    # -- 出力ヘルパ ---------------------------------------------------- #
    def _head(self, title):
        self.stdout.write("")
        self.stdout.write(self.style.MIGRATE_HEADING(f"[{title}]"))

    def _row(self, label, value, problem=None):
        mark = f"  {MARK} {problem}" if problem else ""
        self.stdout.write(f"  {label:<22}: {value}{mark}")
        if problem:
            self.problems.append(f"{label}: {problem}")

    # -- 各セクション --------------------------------------------------- #
    def _section_env(self):
        self._head(".env")
        root = Path(settings.BASE_DIR).parent
        candidates = [root / ".env", Path(settings.BASE_DIR) / ".env"]
        found = [p for p in candidates if p.is_file()]
        if not found:
            self._row("場所", "見つかりません", "ルートに .env を置いてください")
            return
        for path in found:
            enc = self._detect_encoding(path)
            note = None
            if enc == "utf-16":
                note = "UTF-16 は cmd.exe が読めません。UTF-8 で保存し直してください"
            elif enc is None:
                note = "どの文字コードでも読めませんでした"
            self._row("場所", f"{path}  ({enc or '不明'})", note)

        mock = os.environ.get("VITE_USE_MOCK", "(未設定 → 既定 true)")
        problem = None
        if str(mock).strip().lower() != "false":
            problem = (
                "モックモードです。コピーしたDBのユーザーではログインできません。"
                " .env に VITE_USE_MOCK=false を設定してフロントを再起動してください"
            )
        self._row("VITE_USE_MOCK", mock, problem)
        self._row("FRONTEND_PORT", os.environ.get("FRONTEND_PORT", "(未設定 → 5174)"))
        self._row("BACKEND_PORT", os.environ.get("BACKEND_PORT", "(未設定 → 8009)"))
        secret = os.environ.get("SECRET_KEY")
        self._row(
            "SECRET_KEY",
            "設定あり" if secret else "未設定（既定値を使用）",
            None,  # パスワードハッシュは SECRET_KEY に依存しないため実害なし
        )

    def _detect_encoding(self, path):
        try:
            raw = path.read_bytes()
        except OSError:
            return None
        for enc in ENCODINGS:
            try:
                raw.decode(enc)
                return enc
            except (UnicodeDecodeError, UnicodeError, LookupError):
                continue
        return None

    def _section_db(self):
        self._head("データベース")
        name = settings.DATABASES["default"]["NAME"]
        path = Path(name)
        self._row("期待パス", path)
        if not path.is_file():
            self._row("存在", "なし", "この場所に db.sqlite3 を置いてください（backend/ の直下です）")
            return
        size = path.stat().st_size
        problem = None
        if size < 100 * 1024:
            problem = "サイズが小さすぎます。空のDBが自動生成された可能性があります"
        self._row("存在", f"あり ({size / 1024:.0f} KB)", problem)

        for suffix in ("-wal", "-shm", "-journal"):
            side = path.with_name(path.name + suffix)
            if side.is_file():
                self._row(
                    f"付随ファイル{suffix}",
                    "あり",
                    "コピー元がまだ書き込み中だった可能性。このファイルも一緒にコピーしてください",
                )

        try:
            executor = MigrationExecutor(connections["default"])
            targets = executor.loader.graph.leaf_nodes()
            plan = executor.migration_plan(targets)
        except Exception as exc:
            self._row("マイグレーション", f"確認できませんでした ({exc})", "manage.py migrate を実行してください")
            return
        if plan:
            names = ", ".join(f"{m.app_label}.{m.name}" for m, _ in plan[:5])
            more = f" 他{len(plan) - 5}件" if len(plan) > 5 else ""
            self._row(
                "未適用マイグレーション",
                f"{len(plan)} 件 ({names}{more})",
                "manage.py migrate を実行してください。未適用のままだとログイン時に500になります",
            )
        else:
            self._row("未適用マイグレーション", "なし")

    def _section_users(self):
        self._head("ユーザー")
        User = get_user_model()
        try:
            total = User.objects.count()
        except Exception as exc:
            self._row("総数", f"取得できませんでした ({exc})", "スキーマ不一致です。manage.py migrate を実行してください")
            return
        problem = None
        if total == 0:
            problem = "ユーザーが0件です。DBのコピー先が違うか、空のDBが作られています"
        self._row("総数", total, problem)
        if total == 0:
            return
        self._row("有効(is_active)", User.objects.filter(is_active=True).count())
        self._row("スーパーユーザー", User.objects.filter(is_superuser=True).count())
        self.stdout.write("  ログインIDの一覧（先頭10件）:")
        for u in User.objects.all().order_by("id")[:10]:
            flags = []
            if not u.is_active:
                flags.append("無効")
            if u.is_superuser:
                flags.append("superuser")
            suffix = f"  [{', '.join(flags)}]" if flags else ""
            self.stdout.write(f"    - {u.get_username()}  (role={getattr(u, 'role', '?')}){suffix}")
        if total > 10:
            self.stdout.write(f"    ... 他 {total - 10} 件")

    def _section_media(self):
        self._head("メディア")
        root = Path(settings.MEDIA_ROOT)
        if not root.is_dir():
            self._row("media/", "ディレクトリなし")
            return
        files = [p for p in root.rglob("*") if p.is_file()]
        self._row("media/", f"{len(files)} ファイル")

        from tools.models import Screenshot, Tool

        try:
            need = Tool.objects.exclude(zip_file="").exclude(zip_file=None).count()
            need += Screenshot.objects.count()
        except Exception:
            return
        if need and not files:
            self._row(
                "整合性",
                f"DBは {need} 件のファイルを参照",
                "media/ をコピーしていません。A の backend/media/ をコピーしてください",
            )
        else:
            self._row("整合性", f"DBの参照 {need} 件 / 実ファイル {len(files)} 件")

    def _verdict(self):
        self.stdout.write("")
        if not self.problems:
            self.stdout.write(self.style.SUCCESS("[判定] 問題は見つかりませんでした。"))
            return
        self.stdout.write(self.style.ERROR(f"[判定] 要確認 {len(self.problems)} 件:"))
        for p in self.problems:
            self.stdout.write(self.style.WARNING(f"  {MARK} {p}"))
        self.stdout.write("")
