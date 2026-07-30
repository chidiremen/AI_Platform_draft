"""フォーラムのデモスレッドを投入する（冪等）。

Usage:
    python manage.py seed_forum
"""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from forum.models import ForumPost, ForumThread, ThreadVote

User = get_user_model()

THREADS = [
    (
        "idea",
        "議事録から自動でA-SPICE成果物のドラフト作らせたい",
        "会議のあとに毎回手で書いてる作業が地味に重いです。\n"
        "Teams の録画/文字起こしを食わせたら SWE.1 の要件票くらいまで\n"
        "たたき台を作ってくれるやつが欲しい。",
        "議事録,A-SPICE,自動化",
        [
            "それ欲しい。ウチの班も毎週2hくらい溶けてる",
            ">>2\n同じ。特に用語の統一が面倒なので、そこだけでも自動化されると嬉しい",
            "既に似たようなの作ってる人いた気がする。カタログで「議事録」で検索すると出てくるかも",
        ],
    ),
    (
        "idea",
        "CANログをいい感じに要約してくれるツールほしい",
        "不具合解析で数GBのCANログを眺めるのがつらい。\n"
        "「この時間帯で異常な信号」をLLMに投げて当たりをつけたい。",
        "CAN,ログ解析",
        [
            "生ログそのまま投げるとトークン爆発するので、前処理どうするかが本質っぽい",
            ">>2\nDBCでデコードして信号名+統計にしてから投げる感じかな",
        ],
    ),
    (
        "discussion",
        "社内AIツールの命名規則、そろえたほうがよくない？",
        "各自バラバラに名前つけてて検索しづらい。\n"
        "`[対象プロセス]_[やること]` くらいの緩いルールを決めたいです。",
        "運用,命名規則",
        [
            "賛成。ただ厳しくしすぎると投稿のハードルが上がるので緩めがいい",
            "タグ運用のほうが現実的では？名前は自由でタグで統一する",
            ">>3\nそれもアリ。タグのサジェスト機能があると揃いやすそう",
        ],
    ),
    (
        "share",
        "MISRA-Cレビューのプロンプト、これで精度上がった",
        "システムプロンプトに「指摘は必ずルール番号を添えて」と入れると\n"
        "ハルシネーションがかなり減りました。共有しときます。",
        "MISRA-C,プロンプト,事例",
        [
            "ありがとう、試してみる",
        ],
    ),
]


class Command(BaseCommand):
    help = "Seed demo forum threads and posts."

    @transaction.atomic
    def handle(self, *args, **options):
        users = list(User.objects.all()[:5])
        if not users:
            self.stdout.write(self.style.WARNING("ユーザーが居ないのでスキップ"))
            return
        for i, (cat, title, body, tags, replies) in enumerate(THREADS):
            author = users[i % len(users)]
            thread, created = ForumThread.objects.get_or_create(
                title=title,
                defaults={
                    "body": body,
                    "category": cat,
                    "tags": tags,
                    "author": author,
                },
            )
            if not created:
                continue
            for j, rbody in enumerate(replies):
                ForumPost.objects.create(
                    thread=thread,
                    body=rbody,
                    author=users[(i + j + 1) % len(users)],
                )
            # ちょっとだけ票を入れる
            for u in users[: (i % len(users)) + 1]:
                ThreadVote.objects.get_or_create(thread=thread, user=u)
            thread.last_posted_at = timezone.now()
            thread.save(update_fields=["last_posted_at"])
        self.stdout.write(self.style.SUCCESS("forum seed complete"))
