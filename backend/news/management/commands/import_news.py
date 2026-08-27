"""AI_WeeklyNews が出力した articles.jsonl を取り込む。

    python manage.py import_news                     # 既定パスから取り込み
    python manage.py import_news --path <file|dir>   # パス指定
    python manage.py import_news --dry-run           # 書き込まずに結果だけ表示
    python manage.py import_news --limit 50          # 先頭N件だけ
    python manage.py import_news --since 2026-08-01  # 公開日でフィルタ

既定の取り込み元は、以下の優先順で決まる:
  1. ``--path`` 引数
  2. 環境変数 / .env の ``NEWS_JSONL_PATH``
  3. ``backend/data/incoming/``（ディレクトリ。中の *.jsonl を全て読む）

パスにはファイルとディレクトリのどちらも指定できる。ディレクトリの場合は
配下の ``*.jsonl`` を全て読む（日次ファイルを置いていく運用に対応）。

取り込みは **link（記事URL）をキーにした upsert** で冪等。同じファイルを何度
流し込んでも件数は増えず、内容の変化だけが反映される。

jsonl のスキーマ揺れに耐えるため、既知フィールドが欠けていても既定値で続行し、
知らないフィールドは ``raw`` にそのまま退避する。1 行が壊れていてもその行だけ
スキップして処理を続ける（連携先の小さな変更で全体が止まらないように）。
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils.dateparse import parse_datetime

from news.models import NewsArticle

#: 既定の取り込み元ディレクトリ（backend/data/incoming/）
DEFAULT_INCOMING_DIR = Path(settings.BASE_DIR) / "data" / "incoming"


def resolve_source(path_arg: str | None) -> Path:
    """取り込み元パスを決める（--path > NEWS_JSONL_PATH > 既定ディレクトリ）。"""
    if path_arg:
        return Path(path_arg).expanduser()
    env = os.environ.get("NEWS_JSONL_PATH", "").strip()
    if env:
        return Path(env).expanduser()
    return DEFAULT_INCOMING_DIR


def iter_jsonl_files(source: Path) -> list[Path]:
    """対象の jsonl ファイル一覧を返す（ファイル1つ or ディレクトリ配下）。"""
    if source.is_dir():
        return sorted(source.glob("*.jsonl"))
    if source.is_file():
        return [source]
    return []


def parse_dt(value) -> datetime | None:
    """ISO8601 文字列を aware な datetime にする。失敗したら None。

    AI_WeeklyNews 側は ISO8601 を出す約束だが、タイムゾーン無しや秒未満の桁数
    違いなどの揺れを想定して寛容に扱う。
    """
    if not value:
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        text = str(value).strip()
        if not text:
            return None
        dt = parse_datetime(text)
        if dt is None:
            # "2026-08-27" のような日付だけの形式にも対応
            for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%Y-%m-%d %H:%M:%S"):
                try:
                    dt = datetime.strptime(text, fmt)
                    break
                except ValueError:
                    continue
        if dt is None:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def pick(row: dict, *keys, default=""):
    """複数の候補キーから最初に見つかった値を返す（キー名の揺れ対策）。"""
    for k in keys:
        v = row.get(k)
        if v not in (None, ""):
            return v
    return default


class Command(BaseCommand):
    help = "AI_WeeklyNews の articles.jsonl を取り込む（link をキーに upsert）"

    def add_arguments(self, parser):
        parser.add_argument(
            "--path",
            default=None,
            help="jsonl ファイル、またはそれが入ったディレクトリ",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="DB に書かず、取り込み結果だけ表示する",
        )
        parser.add_argument("--limit", type=int, default=0, help="先頭 N 件だけ処理")
        parser.add_argument(
            "--since",
            default=None,
            help="この日付以降に公開された記事のみ（YYYY-MM-DD）",
        )

    def handle(self, *args, **opts):
        source = resolve_source(opts["path"])
        files = iter_jsonl_files(source)

        if not files:
            self.stdout.write(
                self.style.ERROR(f"取り込み元が見つかりません: {source}")
            )
            self.stdout.write(
                "  --path で指定するか、環境変数 NEWS_JSONL_PATH を設定するか、\n"
                f"  {DEFAULT_INCOMING_DIR} に articles.jsonl を置いてください。"
            )
            return

        since = parse_dt(opts["since"]) if opts["since"] else None
        limit = opts["limit"] or 0
        dry = opts["dry_run"]

        created = updated = skipped = broken = 0
        seen_links: set[str] = set()

        self.stdout.write(f"取り込み元: {source}")
        for f in files:
            self.stdout.write(f"  - {f.name}")

        for f in files:
            with f.open(encoding="utf-8") as fp:
                for lineno, line in enumerate(fp, 1):
                    line = line.strip()
                    if not line:
                        continue
                    if limit and (created + updated + skipped) >= limit:
                        break
                    try:
                        row = json.loads(line)
                    except json.JSONDecodeError as e:
                        broken += 1
                        self.stderr.write(
                            self.style.WARNING(
                                f"    {f.name}:{lineno} JSON として読めないためスキップ: {e}"
                            )
                        )
                        continue
                    if not isinstance(row, dict):
                        broken += 1
                        continue

                    link = str(pick(row, "link", "url", "id")).strip()
                    if not link:
                        broken += 1
                        self.stderr.write(
                            self.style.WARNING(
                                f"    {f.name}:{lineno} link が無いためスキップ"
                            )
                        )
                        continue

                    # 同じ取り込みバッチ内の重複は最初の1件だけ採用
                    if link in seen_links:
                        skipped += 1
                        continue
                    seen_links.add(link)

                    published = parse_dt(pick(row, "published", "published_at", default=None))
                    if since and published and published < since:
                        skipped += 1
                        continue

                    fields = {
                        "title": str(pick(row, "title"))[:500],
                        "title_ja": str(pick(row, "title_ja", "title_jp"))[:500],
                        "summary": str(pick(row, "summary", "description")),
                        "source": str(pick(row, "source", "feed", "site"))[:200],
                        "category": str(pick(row, "category", "topic"))[:100],
                        "published": published,
                        "collected_at": parse_dt(
                            pick(row, "collected_at", "fetched_at", default=None)
                        ),
                        "thumbnail_url": str(
                            pick(row, "thumbnail", "thumbnail_url", "image")
                        )[:1000],
                        "raw": row,
                    }

                    if dry:
                        exists = NewsArticle.objects.filter(link=link).exists()
                        if exists:
                            updated += 1
                        else:
                            created += 1
                        continue

                    with transaction.atomic():
                        obj, was_created = NewsArticle.objects.update_or_create(
                            link=link, defaults=fields
                        )
                    if was_created:
                        created += 1
                    else:
                        updated += 1

        head = "[dry-run] " if dry else ""
        self.stdout.write(
            self.style.SUCCESS(
                f"\n{head}新規 {created} 件 / 更新 {updated} 件 / スキップ {skipped} 件"
                + (f" / 不正行 {broken} 件" if broken else "")
            )
        )
        if not dry:
            self.stdout.write(f"DB 内のニュース記事: {NewsArticle.objects.count()} 件")
