/**
 * モックモード用のテーマ / アイデアデータ。
 *
 * 一覧のフィルタとダッシュボードの集計をすぐ確認できるよう、
 * 着手中・仲間募集中・停滞・凍結・完了が一通り揃うようにしてある。
 */
import type { Idea, Theme, ThemeEntry } from '../../types'

const now = Date.now()
const daysAgo = (n: number) => new Date(now - n * 86400000).toISOString()

/** 停滞判定の既定しきい値（バックエンドの THEME_STALLED_AFTER_DAYS と同値） */
export const MOCK_STALLED_AFTER_DAYS = 30

function entry(
  themeId: string,
  n: number,
  body: string,
  opts: Partial<ThemeEntry> = {},
): ThemeEntry {
  return {
    id: `${themeId}-e${n}`,
    themeId,
    kind: 'progress',
    body,
    progressPercent: null,
    statusAtPost: 'active',
    author: '田中 太郎',
    authorId: 2,
    canEdit: false,
    createdAt: daysAgo(30 - n),
    updatedAt: daysAgo(30 - n),
    ...opts,
  }
}

function base(over: Partial<Theme> & Pick<Theme, 'id' | 'title' | 'summary'>): Theme {
  return {
    body: '',
    status: 'active',
    tags: [],
    workCategories: [],
    owner: '田中 太郎',
    ownerId: 2,
    freezeReason: '',
    frozenAt: null,
    resultingTool: null,
    resultingToolTitle: null,
    mergedInto: null,
    mergedIntoTitle: null,
    mergedAt: null,
    originIdea: null,
    originIdeaTitle: null,
    lastProgressAt: daysAgo(2),
    daysSinceProgress: 2,
    isStalled: false,
    stalledAfterDays: MOCK_STALLED_AFTER_DAYS,
    memberCount: 1,
    entryCount: 0,
    latestProgress: null,
    latestProgressPercent: null,
    isMember: false,
    canEdit: false,
    myJoinRequestStatus: null,
    pendingJoinCount: 0,
    members: [
      { id: 1, userId: 2, name: '田中 太郎', role: 'owner', joinedAt: daysAgo(30) },
    ],
    entries: [],
    viewCount: 0,
    createdAt: daysAgo(30),
    updatedAt: daysAgo(2),
    ...over,
  }
}

export const MOCK_THEMES: Theme[] = [
  base({
    id: 'th-1',
    title: '議事録の自動要約',
    summary: 'Teams 会議の文字起こしから議事録ドラフトを自動生成する',
    body: '## 背景\n議事録作成に毎回1時間かかっている。\n\n## 進め方\n小さく試して判断する。',
    status: 'active',
    tags: ['議事録', '要約', 'Copilot'],
    workCategories: ['meeting'],
    isMember: true,
    canEdit: true,
    memberCount: 2,
    entryCount: 2,
    latestProgress: '要約プロンプトを3案比較。決定事項の抽出が弱い。',
    latestProgressPercent: 55,
    members: [
      { id: 1, userId: 2, name: '田中 太郎', role: 'owner', joinedAt: daysAgo(30) },
      { id: 2, userId: 3, name: '佐藤 花子', role: 'member', joinedAt: daysAgo(10) },
    ],
    entries: [
      entry('th-1', 1, '文字起こしの取得まで確認。精度は実用範囲。', {
        progressPercent: 20,
      }),
      entry('th-1', 2, '要約プロンプトを3案比較。決定事項の抽出が弱い。', {
        progressPercent: 55,
      }),
    ],
  }),
  base({
    id: 'th-2',
    title: 'テスト仕様書のレビュー観点抽出',
    summary: '過去の指摘履歴から、レビュー時に見るべき観点を提示する',
    status: 'recruiting',
    tags: ['テスト', 'レビュー'],
    workCategories: ['document'],
    owner: '佐藤 花子',
    ownerId: 3,
    lastProgressAt: null,
    daysSinceProgress: 5,
    members: [
      { id: 3, userId: 3, name: '佐藤 花子', role: 'owner', joinedAt: daysAgo(5) },
    ],
  }),
  base({
    id: 'th-3',
    title: '設計書の表記ゆれチェック',
    summary: '用語集と突き合わせて表記ゆれを検出する',
    status: 'active',
    tags: ['設計書', '校正'],
    workCategories: ['document'],
    // 停滞の見本
    isStalled: true,
    lastProgressAt: daysAgo(70),
    daysSinceProgress: 70,
    entryCount: 1,
    latestProgress: '用語集の整備から着手。',
    latestProgressPercent: 30,
    updatedAt: daysAgo(70),
  }),
  base({
    id: 'th-4',
    title: '問い合わせ一次回答の自動化',
    summary: '過去のQ&Aから一次回答案を出す',
    status: 'frozen',
    tags: ['問い合わせ', 'RAG'],
    workCategories: ['mail'],
    freezeReason:
      'FAQ の粒度が粗く、回答精度が実用水準に届かなかった。先に FAQ の再整備が必要という結論。',
    frozenAt: daysAgo(40),
    lastProgressAt: daysAgo(45),
    daysSinceProgress: 45,
    entryCount: 1,
    latestProgress: 'RAG を試作。既存FAQの粒度が粗く回答が的外れになる。',
    latestProgressPercent: 40,
    updatedAt: daysAgo(40),
  }),
  base({
    id: 'th-5',
    title: 'コードレビューコメントの下書き',
    summary: '差分から指摘候補を出す',
    status: 'done',
    tags: ['レビュー', 'GitHub'],
    workCategories: ['development'],
    resultingTool: 't-1',
    resultingToolTitle: 'コードレビュー支援ボット',
    lastProgressAt: daysAgo(20),
    daysSinceProgress: 20,
    entryCount: 1,
    latestProgress: '社内試用で好評。ツールカタログに登録した。',
    latestProgressPercent: 100,
    updatedAt: daysAgo(20),
  }),
]

export const MOCK_IDEAS: Idea[] = [
  {
    id: 'id-1',
    title: '経費精算の入力を自動化したい',
    body: '領収書の写真から金額と費目を拾ってほしい。毎月30分溶けている。',
    tags: ['経費', 'OCR'],
    workCategories: ['other'],
    status: 'open',
    author: '佐藤 花子',
    authorId: 3,
    promotedTheme: null,
    promotedThemeTitle: null,
    voteCount: 3,
    votedByMe: false,
    commentCount: 1,
    comments: [
      {
        id: 'ic-1',
        ideaId: 'id-1',
        author: '田中 太郎',
        body: 'OCR の精度次第ですが、やる価値はありそう。',
        canEdit: false,
        createdAt: daysAgo(3),
        updatedAt: daysAgo(3),
      },
    ],
    canEdit: false,
    createdAt: daysAgo(7),
    updatedAt: daysAgo(3),
  },
  {
    id: 'id-2',
    title: '仕様変更の影響範囲を出してほしい',
    body: '変更した要件から、影響しそうなテストケースを列挙してくれると助かる。',
    tags: ['要件', '影響分析'],
    workCategories: ['document'],
    status: 'open',
    author: '田中 太郎',
    authorId: 2,
    promotedTheme: null,
    promotedThemeTitle: null,
    voteCount: 5,
    votedByMe: true,
    commentCount: 0,
    comments: [],
    canEdit: true,
    createdAt: daysAgo(12),
    updatedAt: daysAgo(12),
  },
]
