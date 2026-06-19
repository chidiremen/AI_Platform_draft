# AI Tool Catalog — 社内AI活用プラットフォーム

パナソニック オートモーティブシステムズ向け「AI活用ツールカタログ」プラットフォームのリポジトリです。
車載ソフトウェア開発現場で属人化しがちなAIツール・プロンプト・エージェントを一元管理し、
**可視化 / 再利用促進 / 効果測定** を実現することを目的としています。

詳細な要件は要件仕様書を参照してください。

## 現在の状態

**フロントエンド（`frontend/`）はモックデータで動作するデモUIとして稼働中**。並行して
**バックエンド（`backend/`、Django + DRF）のスキャフォールドを構築済み**です。
フロントエンドは現時点ではモックで動き続け、バックエンド接続は今後のステップです。

### フロントエンド実装済み機能（React + TypeScript + Vite / モック）

- **ユーザー認証**（ID + パスワードのログインゲート。デモ: `tanaka` / `password` ＝管理者）
- **ロール管理**（組織管理者 / メンバー。ヘッダーにロール表示・ログアウト）
- **ツール一覧**（デフォルトは一覧表＝テーブル表示。カード表示にも切替可。
  **列の表示/非表示切替**、キーワード検索、業務シーン・種別フィルタ、50音/新着/いいね/申請/閲覧/DL ソート）
- **A-SPICE V字モデル セレクタ**（モーダル表示。SVG描画・複数選択＝OR条件）
- **業務シーン軸**（会議・メール・チャット・文書・ナレッジ・タスク・翻訳・AI活用促進）
- **ツール詳細**（README Markdown/GFM、種別別アクション、いいね、フォーク、メトリクス）
- **ツールの登録 / 編集（再投稿）/ 削除 / フォーク**（編集・削除は登録者本人と管理者のみ）
- **マイページ**（ログインユーザーの登録 / いいね / 申請 / 被申請）
- **管理者ページ — ユーザー管理**（ユーザー初期登録・権限変更。管理者専用）
- **ダッシュボード（権限別）**（管理者＝組織全体ビュー、メンバー＝自分に関連するツールのみ）

### バックエンド（Django 5 + DRF / `backend/`）

要件仕様書 4〜5章に基づくスキャフォールド。`accounts`（カスタムUser・ロール・認証・
ユーザー管理API）/ `tools`（Tool・AspiceProcess・Like・AccessRequest・Screenshot、
検索/フィルタ/ソート、fork/like/request-access/download）/ `metrics`（ActivityLog・
権限スコープ付きダッシュボードAPI）。`python manage.py check` パス済み、A-SPICE 16
プロセス＋デモユーザーのseedコマンド付き。詳細は `backend/README.md` を参照。

### デザイン方針

- 車載業界のプロフェッショナルな印象（ダークブルー基調）
- V字モデルセレクタを画面の主役として大きく配置
- カード型UIでツールを一覧表示
- PC利用前提（社内利用）

## セットアップ

```bash
cd frontend
npm install
npm run dev      # 開発サーバ起動（http://localhost:5173）
npm run build    # 本番ビルド（tsc 型チェック + vite build）
npm run preview  # ビルド結果のプレビュー
```

## ディレクトリ構成

```
ai-tool-catalog/
├── frontend/                     # Phase 0 モックアップ（React + TS + Vite）
│   └── src/
│       ├── components/
│       │   ├── VModelSelector.tsx   # A-SPICE V字モデル ビジュアルセレクタ
│       │   ├── ToolCard.tsx
│       │   ├── Badges.tsx
│       │   ├── RequestModal.tsx
│       │   └── Header.tsx
│       ├── pages/
│       │   ├── HomePage.tsx         # トップ / ツール一覧
│       │   ├── ToolDetailPage.tsx   # ツール詳細
│       │   ├── ToolFormPage.tsx     # ツール登録 / フォーク
│       │   ├── MyPage.tsx           # マイページ
│       │   └── DashboardPage.tsx    # 管理者ダッシュボード
│       ├── data/                    # モックデータ・A-SPICE定義
│       ├── store.tsx                # アプリ状態（いいね・申請・トースト）
│       └── types.ts
└── README.md
```

## 今後のフェーズ

| フェーズ | 内容 |
|---------|------|
| Phase 1 | Django + DRF バックエンド + React フロントエンド MVP |
| Phase 2 | ダッシュボード + マイページ + Teams通知 |
| Phase 3 | LDAP/SSO連携 + PostgreSQL移行 + Docker化 |
