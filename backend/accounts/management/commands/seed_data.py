"""Seed initial users and the 16 A-SPICE processes.

Usage:
    python manage.py seed_data
"""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from tools.models import AspiceProcess

User = get_user_model()

# (id, name(JP), category, v_model_position, display_order)
ASPICE_PROCESSES = [
    ("SYS.2", "システム要件分析", "SYS", "left", 10),
    ("SYS.3", "システムアーキテクチャ設計", "SYS", "left", 20),
    ("SWE.1", "ソフトウェア要件分析", "SWE", "left", 30),
    ("SWE.2", "ソフトウェアアーキテクチャ設計", "SWE", "left", 40),
    ("SWE.3", "ソフトウェア詳細設計及びユニット構築", "SWE", "bottom", 50),
    ("SWE.4", "ソフトウェアユニット検証", "SWE", "right", 60),
    ("SWE.5", "ソフトウェア結合及び結合テスト", "SWE", "right", 70),
    ("SWE.6", "ソフトウェア適格性確認テスト", "SWE", "right", 80),
    ("SYS.4", "システム結合及び結合テスト", "SYS", "right", 90),
    ("SYS.5", "システム適格性確認テスト", "SYS", "right", 100),
    ("SUP.1", "品質保証", "SUP", "support", 110),
    ("SUP.8", "構成管理", "SUP", "support", 120),
    ("SUP.9", "問題解決管理", "SUP", "support", 130),
    ("SUP.10", "変更要求管理", "SUP", "support", 140),
    ("MAN.3", "プロジェクト管理", "MAN", "support", 150),
    ("ACQ.4", "サプライヤ監視", "ACQ", "support", 160),
]

INITIAL_USERS = [
    # username, password, display_name, role
    ("admin", "admin12345", "システム管理者", User.Role.ADMIN),
    ("member01", "member12345", "山田 太郎", User.Role.MEMBER),
    ("member02", "member12345", "鈴木 花子", User.Role.MEMBER),
]


class Command(BaseCommand):
    help = "Seed initial users and A-SPICE processes."

    @transaction.atomic
    def handle(self, *args, **options):
        self._seed_aspice()
        self._seed_users()
        self.stdout.write(self.style.SUCCESS("Seeding complete."))

    def _seed_aspice(self):
        created = 0
        for pid, name, category, pos, order in ASPICE_PROCESSES:
            obj, was_created = AspiceProcess.objects.update_or_create(
                id=pid,
                defaults={
                    "name": name,
                    "category": category,
                    "v_model_position": pos,
                    "display_order": order,
                },
            )
            created += int(was_created)
        self.stdout.write(
            f"A-SPICE processes: {created} created / "
            f"{AspiceProcess.objects.count()} total."
        )

    def _seed_users(self):
        created = 0
        for username, password, display_name, role in INITIAL_USERS:
            if User.objects.filter(username=username).exists():
                continue
            user = User(
                username=username, display_name=display_name, role=role
            )
            user.set_password(password)
            user.save()
            created += 1
        self.stdout.write(f"Users: {created} created.")
