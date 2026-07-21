"""Idempotently seed a small set of guide categories/articles and Q&A demo data.

Usage:
    python manage.py seed_docs
"""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from docs.models import Answer, DocCategory, GuideArticle, Question

User = get_user_model()

GUIDE_CATEGORIES = [
    ("getting-started", "はじめに", "🚀", 10),
    ("register-tool", "ツール登録", "📝", 20),
    ("access-request", "アクセス権申請", "📨", 30),
    ("admin", "管理者向け", "🛠️", 40),
]

QA_CATEGORIES = [
    ("usage", "使い方", "❓", 10),
    ("bug", "バグ報告", "🐞", 20),
    ("feature", "機能要望", "✨", 30),
    ("other", "その他", "💬", 90),
]

GUIDE_ARTICLES = [
    ("getting-started", "welcome", "AIツールカタログへようこそ", 10, """\
本プラットフォームは、社内のAI活用ツールを一元管理・共有するためのカタログです。

## 主な機能
- 🔍 **ツール一覧の検索・絞り込み** — 業務シーンやA-SPICEプロセスから探せます
- 📝 **ツール登録** — 誰でもツール情報を投稿できます
- 📨 **アクセス権申請** — 各ツールに対して管理者に権限申請できます
- 💬 **コメント** — 使い方やフィードバックを投稿できます
- 📊 **ダッシュボード** — 利用状況を可視化

## 次のステップ
1. [ツール登録の方法](../register-tool/how-to-register) を確認
2. 気になるツールに [アクセス権を申請](../access-request/how-to-request)
"""),
    ("register-tool", "how-to-register", "ツール登録の方法", 10, """\
ヘッダーの「＋ ツール登録」から新規登録できます。

## 必須項目
- ツール名 / 概要 / 種別 / URL または zip / README / 業務シーンまたはA-SPICE
- 定性効果 / 定量効果（月間削減時間）

## Tips
- スクリーンショットは Ctrl+V で貼り付け可能
- 「その他」種別は URL・zip どちらも任意
"""),
    ("access-request", "how-to-request", "アクセス権の申請方法", 10, """\
ツール詳細ページの「📨 管理者にアクセス権を申請する」から申請できます。

## 種別ごとの必要情報
| ツール種別 | 必要な情報 |
|---|---|
| GitHubリポジトリ | GitHubユーザー名 |
| NotebookLM | Googleアカウント |
| Copilotエージェント | 社内メールアドレス |

## 申請の流れ
```mermaid
sequenceDiagram
    User->>Platform: 申請
    Platform->>Admin: 通知
    Admin->>User: 承認 / 却下
```
"""),
    ("admin", "user-management", "ユーザー管理", 10, """\
組織管理者は「👤 ユーザー管理」ページから以下ができます:
- 新規ユーザーの登録
- 表示名 / メール / パスワードの更新
- ロールの変更（メンバー / ツール管理者 / 組織管理者）
- ユーザーの削除
"""),
]

QA_SEED = [
    ("usage", "ツール登録時に「効果」欄は何を書けばいいですか？",
     "定量効果（月間削減時間）の入力に悩んでいます。主観でも良いのでしょうか？",
     [(
        "はい、主観の見積もりでOKです。ざっくりでも「月〇時間削減」のイメージを入れてください。"
        "0〜744時間/月の範囲で入力できます。",
        True,
    )]),
    ("usage", "ツールへのアクセス権はどうやって得られますか？",
     "詳細ページで「申請」ボタンを押した後、どのくらいで承認されますか？",
     [(
        "登録者（または管理者）がマイページで承認・却下します。目安1営業日以内が理想ですが、担当者次第です。",
        False,
    )]),
    ("bug", "ダウンロード数が正しくカウントされない",
     "ダウンロードしても数が増えないような気がします",
     [(
        "こちらは既知の不具合として修正済です。ページを再読み込みしてください。",
        True,
    )]),
]


class Command(BaseCommand):
    help = "Seed initial guide categories/articles and Q&A demo data."

    @transaction.atomic
    def handle(self, *args, **options):
        admin = User.objects.filter(role__in=["admin", "tool_admin"]).first()
        if not admin:
            admin = User.objects.filter(is_superuser=True).first()
        for slug, name, icon, order in GUIDE_CATEGORIES:
            DocCategory.objects.update_or_create(
                kind="guide",
                slug=slug,
                defaults={"name": name, "icon": icon, "order": order},
            )
        for slug, name, icon, order in QA_CATEGORIES:
            DocCategory.objects.update_or_create(
                kind="qa",
                slug=slug,
                defaults={"name": name, "icon": icon, "order": order},
            )
        for cat_slug, art_slug, title, order, body in GUIDE_ARTICLES:
            cat = DocCategory.objects.get(kind="guide", slug=cat_slug)
            GuideArticle.objects.update_or_create(
                category=cat,
                slug=art_slug,
                defaults={
                    "title": title,
                    "body": body,
                    "order": order,
                    "author": admin,
                    "is_published": True,
                },
            )
        for cat_slug, q_title, q_body, answers in QA_SEED:
            cat = DocCategory.objects.get(kind="qa", slug=cat_slug)
            q, created = Question.objects.get_or_create(
                title=q_title,
                defaults={
                    "category": cat,
                    "body": q_body,
                    "asker": admin,
                },
            )
            if created:
                for a_body, accepted in answers:
                    Answer.objects.create(
                        question=q,
                        body=a_body,
                        author=admin,
                        is_accepted=accepted,
                    )
                    if accepted:
                        q.is_resolved = True
                        q.save(update_fields=["is_resolved"])
        self.stdout.write(self.style.SUCCESS("docs seed complete"))
