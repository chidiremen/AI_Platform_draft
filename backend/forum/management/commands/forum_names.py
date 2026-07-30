"""「名無し」表記の候補を CLI から設定する。

    python manage.py forum_names --list
    python manage.py forum_names --add 名無しのテスト屋
    python manage.py forum_names --add A --add B          # 複数同時
    python manage.py forum_names --remove 名無しのテスト屋
    python manage.py forum_names --disable 名無しの雑談民  # 残したまま無効化
    python manage.py forum_names --enable  名無しの雑談民
    python manage.py forum_names --seed                   # 既定リストを投入

引数なしで実行した場合は --list と同じ。
"""

from django.core.management.base import BaseCommand

from forum.models import DEFAULT_ANON_NAMES, ForumAnonName


class Command(BaseCommand):
    help = "フォーラムの「名無し」表記候補を一覧/追加/削除/有効化する"

    def add_arguments(self, parser):
        parser.add_argument("--list", action="store_true", help="現在の候補を表示")
        parser.add_argument("--add", action="append", default=[], help="候補を追加")
        parser.add_argument("--remove", action="append", default=[], help="候補を削除")
        parser.add_argument("--disable", action="append", default=[], help="無効化")
        parser.add_argument("--enable", action="append", default=[], help="有効化")
        parser.add_argument(
            "--seed", action="store_true", help="既定の候補一覧を投入（重複はスキップ）"
        )

    def handle(self, *args, **opts):
        changed = False

        if opts["seed"]:
            for i, label in enumerate(DEFAULT_ANON_NAMES):
                _, created = ForumAnonName.objects.get_or_create(
                    label=label, defaults={"order": (i + 1) * 10}
                )
                if created:
                    self.stdout.write(self.style.SUCCESS(f"+ {label}"))
            changed = True

        for label in opts["add"]:
            label = label.strip()
            if not label:
                continue
            obj, created = ForumAnonName.objects.get_or_create(
                label=label, defaults={"is_active": True}
            )
            if created:
                self.stdout.write(self.style.SUCCESS(f"+ {label}"))
            else:
                self.stdout.write(f"= {label}（既に存在）")
            changed = True

        for label in opts["remove"]:
            n, _ = ForumAnonName.objects.filter(label=label.strip()).delete()
            if n:
                self.stdout.write(self.style.WARNING(f"- {label}"))
            else:
                self.stdout.write(self.style.ERROR(f"? {label}（見つかりません）"))
            changed = True

        for label, flag in [(l, False) for l in opts["disable"]] + [
            (l, True) for l in opts["enable"]
        ]:
            n = ForumAnonName.objects.filter(label=label.strip()).update(is_active=flag)
            mark = "有効" if flag else "無効"
            if n:
                self.stdout.write(f"* {label} → {mark}")
            else:
                self.stdout.write(self.style.ERROR(f"? {label}（見つかりません）"))
            changed = True

        if opts["list"] or not changed:
            rows = ForumAnonName.objects.all()
            if not rows:
                self.stdout.write(
                    "登録なし → 既定リストにフォールバックします:\n  "
                    + "\n  ".join(DEFAULT_ANON_NAMES)
                )
                return
            self.stdout.write("現在の候補:")
            for r in rows:
                flag = "✓" if r.is_active else " "
                self.stdout.write(f"  [{flag}] {r.order:>4}  {r.label}")
            self.stdout.write(f"\n有効: {len(ForumAnonName.active_labels())} 件")
