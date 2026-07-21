/**
 * モックモード用のシード。ガイド/Q&A データを一括で保持し、localStorage で
 * 永続化する（他の mock データと同じ方針）。
 */
import type { DocCategory, GuideArticle, Question } from '../../types'

export const MOCK_CATEGORIES: DocCategory[] = [
  { id: 1, kind: 'guide', name: 'はじめに', slug: 'getting-started', parent: null, order: 10, icon: '🚀' },
  { id: 2, kind: 'guide', name: 'ツール登録', slug: 'register-tool', parent: null, order: 20, icon: '📝' },
  { id: 3, kind: 'guide', name: 'アクセス権申請', slug: 'access-request', parent: null, order: 30, icon: '📨' },
  { id: 4, kind: 'guide', name: '管理者向け', slug: 'admin', parent: null, order: 40, icon: '🛠️' },
  { id: 5, kind: 'qa', name: '使い方', slug: 'usage', parent: null, order: 10, icon: '❓' },
  { id: 6, kind: 'qa', name: 'バグ報告', slug: 'bug', parent: null, order: 20, icon: '🐞' },
  { id: 7, kind: 'qa', name: '機能要望', slug: 'feature', parent: null, order: 30, icon: '✨' },
  { id: 8, kind: 'qa', name: 'その他', slug: 'other', parent: null, order: 90, icon: '💬' },
]

export const MOCK_GUIDES: GuideArticle[] = [
  {
    id: 'g1',
    categoryId: 1,
    categorySlug: 'getting-started',
    categoryName: 'はじめに',
    title: 'AIツールカタログへようこそ',
    slug: 'welcome',
    body: `本プラットフォームは、社内のAI活用ツールを一元管理・共有するためのカタログです。

## 主な機能
- 🔍 **ツール一覧の検索・絞り込み** — 業務シーンや A-SPICE から探せます
- 📝 **ツール登録** — 誰でも投稿可
- 📨 **アクセス権申請** — 管理者に権限申請
- 💬 **コメント** — 使い方やフィードバック
- 📊 **ダッシュボード** — 利用状況の可視化

## クイックスタート
\`\`\`mermaid
flowchart LR
  A[トップページ] --> B[気になるツールをクリック]
  B --> C{種別}
  C -->|GitHub / NotebookLM / Copilot| D[アクセス権申請]
  C -->|zip| E[ダウンロード]
\`\`\`
`,
    order: 10,
    author: '田中太郎',
    isPublished: true,
    createdAt: '2026-07-01T09:00:00Z',
    updatedAt: '2026-07-01T09:00:00Z',
  },
  {
    id: 'g2',
    categoryId: 2,
    categorySlug: 'register-tool',
    categoryName: 'ツール登録',
    title: 'ツール登録の方法',
    slug: 'how-to-register',
    body: `ヘッダーの「＋ ツール登録」から新規登録できます。

## 必須項目
- ツール名 / 概要 / 種別 / URL または zip / README
- 業務シーンまたはA-SPICE / 定性効果 / 定量効果（月間削減時間）

## Tips
- スクリーンショットは **Ctrl+V** で貼り付け可
- 「その他」種別なら URL/zip どちらも任意
- 定量効果は 0〜744 時間/月（主観の見積もりで OK）
`,
    order: 10,
    author: '田中太郎',
    isPublished: true,
    createdAt: '2026-07-02T09:00:00Z',
    updatedAt: '2026-07-02T09:00:00Z',
  },
  {
    id: 'g3',
    categoryId: 3,
    categorySlug: 'access-request',
    categoryName: 'アクセス権申請',
    title: 'アクセス権の申請方法',
    slug: 'how-to-request',
    body: `ツール詳細ページの「📨 管理者にアクセス権を申請する」から申請できます。

## 種別ごとの必要情報
| ツール種別 | 必要な情報 |
|---|---|
| GitHubリポジトリ | GitHubユーザー名 |
| NotebookLM | Googleアカウント |
| Copilotエージェント | 社内メールアドレス |

## 申請の流れ
\`\`\`mermaid
sequenceDiagram
  actor U as ユーザー
  participant P as プラットフォーム
  actor A as 管理者
  U->>P: 申請
  P->>A: Teams 通知
  A->>U: 承認 / 却下
\`\`\`
`,
    order: 10,
    author: '田中太郎',
    isPublished: true,
    createdAt: '2026-07-03T09:00:00Z',
    updatedAt: '2026-07-03T09:00:00Z',
  },
  {
    id: 'g4',
    categoryId: 4,
    categorySlug: 'admin',
    categoryName: '管理者向け',
    title: 'ユーザー管理',
    slug: 'user-management',
    body: `組織管理者は「👤 ユーザー管理」ページから以下ができます:
- 新規ユーザーの登録
- 表示名 / メール / パスワードの更新
- ロールの変更（メンバー / ツール管理者 / 組織管理者）
- ユーザーの削除
`,
    order: 10,
    author: '田中太郎',
    isPublished: true,
    createdAt: '2026-07-04T09:00:00Z',
    updatedAt: '2026-07-04T09:00:00Z',
  },
]

export const MOCK_QUESTIONS: Question[] = [
  {
    id: 'q1',
    categoryId: 5,
    categorySlug: 'usage',
    categoryName: '使い方',
    title: 'ツール登録時に「効果」欄は何を書けばいいですか？',
    body: '定量効果（月間削減時間）の入力に悩んでいます。主観でも良いのでしょうか？',
    tags: ['登録', '効果'],
    asker: '鈴木花子',
    isResolved: true,
    viewCount: 12,
    answerCount: 1,
    answers: [
      {
        id: 'a1',
        questionId: 'q1',
        body: 'はい、主観の見積もりで OK です。ざっくりでも「月〇時間削減」のイメージを入れてください。0〜744 時間/月の範囲で入力できます。',
        author: '佐藤一郎',
        isAccepted: true,
        createdAt: '2026-07-05T10:00:00Z',
        updatedAt: '2026-07-05T10:00:00Z',
      },
    ],
    createdAt: '2026-07-05T09:00:00Z',
    updatedAt: '2026-07-05T10:00:00Z',
  },
  {
    id: 'q2',
    categoryId: 6,
    categorySlug: 'bug',
    categoryName: 'バグ報告',
    title: 'ダウンロード数が保持されない気がする',
    body: 'zip ツールをダウンロードしても、リロードするとカウンタが元に戻る現象が出ています。',
    tags: ['ダウンロード', 'バグ'],
    asker: '山田次郎',
    isResolved: true,
    viewCount: 8,
    answerCount: 1,
    answers: [
      {
        id: 'a2',
        questionId: 'q2',
        body: 'こちらは既知の不具合として **修正済** です。ページ再読込しても保持されるようになりました。ご報告ありがとうございます！',
        author: '田中太郎',
        isAccepted: true,
        createdAt: '2026-07-06T11:00:00Z',
        updatedAt: '2026-07-06T11:00:00Z',
      },
    ],
    createdAt: '2026-07-06T09:00:00Z',
    updatedAt: '2026-07-06T11:00:00Z',
  },
  {
    id: 'q3',
    categoryId: 7,
    categorySlug: 'feature',
    categoryName: '機能要望',
    title: 'ツールにお気に入りタグを付けたい',
    body: '検索性を上げるため、個人ごとの★や独自タグが欲しいです。',
    tags: ['要望'],
    asker: '中村健太',
    isResolved: false,
    viewCount: 5,
    answerCount: 0,
    answers: [],
    createdAt: '2026-07-07T09:00:00Z',
    updatedAt: '2026-07-07T09:00:00Z',
  },
]
