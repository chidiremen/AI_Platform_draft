# AI Tool Catalog — 社内AI活用プラットフォーム

パナソニック オートモーティブシステムズ向け「AI活用ツールカタログ」プラットフォームのリポジトリです。
車載ソフトウェア開発現場で属人化しがちなAIツール・プロンプト・エージェントを一元管理し、
**可視化 / 再利用促進 / 効果測定** を実現することを目的としています。

詳細な要件は要件仕様書を参照してください。

## 現在の状態：Phase 0 — デモ用モックアップ

月曜の部長プレゼンで「プラットフォームのUXビジョン」を体感してもらうための
**React + TypeScript + Vite** 製モックアップです。バックエンド不要・全データはフロントエンド内のモックデータで動作します。

### 実装済み機能

- **A-SPICE V字モデル ビジュアルセレクタ**（SVG描画・クリックで関連ツールをフィルタ。複数選択＝OR条件・「すべてクリア」対応。画面の主役として大きく配置）
- **ツール一覧画面**（カード型UI、キーワード検索、種別フィルタ、新着/いいね/申請/閲覧 ソート）
- **ツール詳細画面**（READMEのMarkdownレンダリング、種別に応じたアクセス権申請／ダウンロードボタン、いいねトグル、フォーク導線、メトリクス表示、フォーク元リンク）
- **ツール登録 / フォーク フォーム**（フォーク時はフォーク元情報をコピー）
- **マイページ**（登録ツール / いいね / 申請一覧 / 被申請一覧）
- **管理者ダッシュボード**（Recharts：ファネル・A-SPICE別分布・月次推移・種別分布・人気ランキング・KPI）

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
