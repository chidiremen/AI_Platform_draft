# AI Tool Catalog — 社内AI活用プラットフォーム

パナソニック オートモーティブシステムズ向け「AI活用ツールカタログ」プラットフォームのリポジトリです。
車載ソフトウェア開発現場で属人化しがちなAIツール・プロンプト・エージェントを一元管理し、
**可視化 / 再利用促進 / 効果測定** を実現することを目的としています。

詳細な要件は要件仕様書を参照してください。

## 現在の状態

**フロントエンド（`frontend/`）はモック / 実APIの両モードに対応**。既定はモックモードで
バックエンド無しに全機能をデモでき、環境変数で **Django + DRF バックエンド（`backend/`）への
接続に切替可能**です。

### フロント↔バックエンド接続（モード切替）

フロントエンドは `frontend/src/api/` に全エンドポイント対応のAPIクライアントを持ち、
`frontend/src/store.tsx` がモック / 実APIを切り替えます。

| モード | 設定 | 動作 |
|---|---|---|
| モック（既定） | （無設定） | 全データはメモリ内。バックエンド不要でデモ可能 |
| 実API | `VITE_USE_MOCK=false` | Django バックエンドに接続（認証はDRF Tokenを localStorage 保持） |

```bash
# 実APIモードで起動（バックエンドを :5174 で起動済みのこと）
cd frontend
cp .env.example .env.local        # VITE_USE_MOCK=false を有効化
npm run dev
```

> 注: 一覧APIはツール単位の閲覧数/インプレッション/DL数を返さない（ActivityLog集計のため）。
> 実APIモードの一覧ではこれらは 0 起点で表示し、集計値は `dashboard` API を利用する想定です。

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
npm run dev      # 開発サーバ起動（http://localhost:8009）
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
