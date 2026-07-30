/**
 * モックモード用のフォーラムのシード。
 *
 * バックエンドと同じ「匿名掲示板」の振る舞いを再現する:
 *  - 表示名は空欄なら *スレッド毎に決まる* 名無し表記、@付きなら固定ハンドル
 *  - 投稿 ID は英大小文字＋数字の 8 桁（base62）
 *  - 実際の投稿者は UI に出さず、{@link MOCK_FORUM_AUTHORS} にのみ保持し、
 *    管理者の「投稿者を特定」操作でのみ参照する（サーバの reveal 相当）
 */
import type { ForumPost, ForumThread } from '../../types'

const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

/** 2ch 風の匿名 ID（モックでは決定的な簡易ハッシュ → base62 8桁） */
export function mockPosterId(author: string, threadId: string, day: string): string {
  const raw = `${author}:${threadId}:${day}`
  // 32bit では偏るので 2 系統のハッシュを連結して桁を稼ぐ
  let h1 = 2166136261
  let h2 = 52711
  for (let i = 0; i < raw.length; i++) {
    h1 = (Math.imul(h1 ^ raw.charCodeAt(i), 16777619) >>> 0)
    h2 = (Math.imul(h2 + raw.charCodeAt(i), 31) >>> 0)
  }
  let n = h1 * 4294967296 + h2
  let out = ''
  while (out.length < 8) {
    out += B62[n % 62]
    n = Math.floor(n / 62)
    if (n === 0) n = h1 + out.length * 7 + 1
  }
  return out.slice(0, 8)
}

/**
 * 「名無し」表記の候補（モック用）。
 * 実 API モードではサーバの ForumAnonName（管理画面 / forum_names コマンドで
 * 追加・削除可）が使われる。ここはモック時のフォールバック。
 */
export const MOCK_ANON_NAMES: string[] = [
  '名無しの車載開発者',
  '名無しのエンジニア',
  '名無しのA-SPICE戦士',
  '名無しのプロンプター',
  '名無しのレビュー担当',
  '名無しの品質保証',
  '名無しの組込み屋',
  '名無しのアーキテクト',
  '名無しのテスター',
  '名無しの現場担当',
]

/** スレッド ID から決定的に名無し表記を 1 つ選ぶ（同じスレなら常に同じ）。 */
export function anonNameForThread(threadId: string): string {
  let h = 2166136261
  for (let i = 0; i < threadId.length; i++) {
    h = (Math.imul(h ^ threadId.charCodeAt(i), 16777619) >>> 0)
  }
  return MOCK_ANON_NAMES[h % MOCK_ANON_NAMES.length]
}

/** 表示名の決定（空欄→名無し / それ以外→名乗った名前）。 */
export function resolveDisplayName(posterName: string, threadId: string): string {
  const n = (posterName || '').trim()
  return n || anonNameForThread(threadId)
}

/**
 * 投稿 ID → 実際の投稿者名。
 * UI には出さず、管理者の「投稿者を特定」だけが参照する
 * （実 API の ForumThread.author / ForumPost.author に相当）。
 */
export const MOCK_FORUM_AUTHORS: Record<string, string> = {}

interface RawPost {
  id: string
  threadId: string
  number: number
  body: string
  /** 実際の投稿者（UI 非公開） */
  author: string
  /** 名乗った名前。空/未指定なら名無し */
  posterName?: string
  posterId?: string
  createdAt: string
  updatedAt: string
}

interface RawThread {
  id: string
  title: string
  body: string
  category: ForumThread['category']
  tags: string[]
  author: string
  posterName?: string
  posterId?: string
  isPinned: boolean
  isClosed: boolean
  viewCount: number
  postCount: number
  voteCount: number
  votedByMe: boolean
  posts?: RawPost[]
  lastPostedAt: string | null
  createdAt: string
  updatedAt: string
}

const RAW_THREADS: RawThread[] = [
  {
    id: 't1',
    title: '議事録から自動でA-SPICE成果物のドラフト作らせたい',
    body:
      '会議のあとに毎回手で書いてる作業が地味に重いです。\n' +
      'Teams の録画/文字起こしを食わせたら SWE.1 の要件票くらいまで\n' +
      'たたき台を作ってくれるやつが欲しい。',
    category: 'idea',
    tags: ['議事録', 'A-SPICE', '自動化'],
    author: '鈴木花子',
    isPinned: false,
    isClosed: false,
    viewCount: 87,
    postCount: 3,
    voteCount: 6,
    votedByMe: false,
    posts: [
      {
        id: 't1p2',
        threadId: 't1',
        number: 2,
        body: 'それ欲しい。ウチの班も毎週2hくらい溶けてる',
        author: '佐藤一郎',
        createdAt: '2026-07-10T10:12:00Z',
        updatedAt: '2026-07-10T10:12:00Z',
      },
      {
        id: 't1p3',
        threadId: 't1',
        number: 3,
        body: '>>2\n同じ。特に用語の統一が面倒なので、そこだけでも自動化されると嬉しい',
        author: '山田次郎',
        createdAt: '2026-07-10T11:40:00Z',
        updatedAt: '2026-07-10T11:40:00Z',
      },
      {
        id: 't1p4',
        threadId: 't1',
        number: 4,
        body:
          '既に似たようなの作ってる人いた気がする。\n' +
          'カタログで「議事録」で検索すると出てくるかも',
        author: '田中太郎',
        createdAt: '2026-07-11T09:05:00Z',
        updatedAt: '2026-07-11T09:05:00Z',
      },
    ],
    lastPostedAt: '2026-07-11T09:05:00Z',
    createdAt: '2026-07-10T09:30:00Z',
    updatedAt: '2026-07-11T09:05:00Z',
  },
  {
    id: 't2',
    title: 'CANログをいい感じに要約してくれるツールほしい',
    body:
      '不具合解析で数GBのCANログを眺めるのがつらい。\n' +
      '「この時間帯で異常な信号」をLLMに投げて当たりをつけたい。',
    category: 'idea',
    tags: ['CAN', 'ログ解析'],
    author: '中村健太',
    isPinned: false,
    isClosed: false,
    viewCount: 44,
    postCount: 2,
    voteCount: 9,
    votedByMe: false,
    posts: [
      {
        id: 't2p2',
        threadId: 't2',
        number: 2,
        body: '生ログそのまま投げるとトークン爆発するので、前処理どうするかが本質っぽい',
        author: '渡辺裕介',
        createdAt: '2026-07-12T14:20:00Z',
        updatedAt: '2026-07-12T14:20:00Z',
      },
      {
        id: 't2p3',
        threadId: 't2',
        number: 3,
        body: '>>2\nDBCでデコードして信号名+統計にしてから投げる感じかな',
        author: '中村健太',
        createdAt: '2026-07-12T15:02:00Z',
        updatedAt: '2026-07-12T15:02:00Z',
      },
    ],
    lastPostedAt: '2026-07-12T15:02:00Z',
    createdAt: '2026-07-12T13:00:00Z',
    updatedAt: '2026-07-12T15:02:00Z',
  },
  {
    id: 't3',
    title: '社内AIツールの命名規則、そろえたほうがよくない？',
    body:
      '各自バラバラに名前つけてて検索しづらい。\n' +
      '`[対象プロセス]_[やること]` くらいの緩いルールを決めたいです。',
    category: 'discussion',
    tags: ['運用', '命名規則'],
    author: '田中太郎',
    isPinned: true,
    isClosed: false,
    viewCount: 132,
    postCount: 3,
    voteCount: 4,
    votedByMe: false,
    posts: [
      {
        id: 't3p2',
        threadId: 't3',
        number: 2,
        body: '賛成。ただ厳しくしすぎると投稿のハードルが上がるので緩めがいい',
        author: '小林陽子',
        createdAt: '2026-07-13T10:00:00Z',
        updatedAt: '2026-07-13T10:00:00Z',
      },
      {
        id: 't3p3',
        threadId: 't3',
        number: 3,
        body: 'タグ運用のほうが現実的では？名前は自由でタグで統一する',
        author: '伊藤真理',
        createdAt: '2026-07-13T10:30:00Z',
        updatedAt: '2026-07-13T10:30:00Z',
      },
      {
        id: 't3p4',
        threadId: 't3',
        number: 4,
        body: '>>3\nそれもアリ。タグのサジェスト機能があると揃いやすそう',
        author: '田中太郎',
        createdAt: '2026-07-13T11:15:00Z',
        updatedAt: '2026-07-13T11:15:00Z',
      },
    ],
    lastPostedAt: '2026-07-13T11:15:00Z',
    createdAt: '2026-07-13T09:00:00Z',
    updatedAt: '2026-07-13T11:15:00Z',
  },
  {
    id: 't4',
    title: 'MISRA-Cレビューのプロンプト、これで精度上がった',
    body:
      'システムプロンプトに「指摘は必ずルール番号を添えて」と入れると\n' +
      'ハルシネーションがかなり減りました。共有しときます。\n\n' +
      '```\nあなたは車載ソフトのMISRA-C準拠レビュアです。\n' +
      '指摘は必ず MISRA-C:2012 のルール番号を添えて出力してください。\n```',
    category: 'share',
    tags: ['MISRA-C', 'プロンプト', '事例'],
    author: '佐藤一郎',
    isPinned: false,
    isClosed: false,
    viewCount: 61,
    postCount: 1,
    voteCount: 7,
    votedByMe: false,
    posts: [
      {
        id: 't4p2',
        threadId: 't4',
        number: 2,
        body: 'ありがとう、試してみる',
        author: '松本大輔',
        createdAt: '2026-07-14T16:00:00Z',
        updatedAt: '2026-07-14T16:00:00Z',
      },
    ],
    lastPostedAt: '2026-07-14T16:00:00Z',
    createdAt: '2026-07-14T15:00:00Z',
    updatedAt: '2026-07-14T16:00:00Z',
  },
]

// ── 生データ → 匿名化した公開データへ変換 ──
//
// 実 API と同じく、UI に渡すオブジェクトには投稿者の実体を含めない。
// 実体は MOCK_FORUM_AUTHORS 側にだけ登録し、管理者の特定操作で引く。

function buildPost(raw: RawPost, threadId: string): ForumPost {
  MOCK_FORUM_AUTHORS[raw.id] = raw.author
  const day = raw.createdAt.slice(0, 10)
  return {
    id: raw.id,
    threadId,
    number: raw.number,
    body: raw.body,
    displayName: resolveDisplayName(raw.posterName ?? '', threadId),
    isHandle: (raw.posterName ?? '').trim().startsWith('@'),
    posterId: raw.posterId ?? mockPosterId(raw.author, threadId, day),
    // canEdit / isMine はログインユーザー依存なので store 側で上書きする
    canEdit: false,
    isMine: false,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  }
}

function buildThread(raw: RawThread): ForumThread {
  MOCK_FORUM_AUTHORS[raw.id] = raw.author
  const day = raw.createdAt.slice(0, 10)
  return {
    id: raw.id,
    title: raw.title,
    body: raw.body,
    category: raw.category,
    tags: raw.tags,
    displayName: resolveDisplayName(raw.posterName ?? '', raw.id),
    isHandle: (raw.posterName ?? '').trim().startsWith('@'),
    posterId: raw.posterId ?? mockPosterId(raw.author, raw.id, day),
    anonName: anonNameForThread(raw.id),
    canEdit: false,
    isMine: false,
    isPinned: raw.isPinned,
    isClosed: raw.isClosed,
    viewCount: raw.viewCount,
    postCount: raw.postCount,
    voteCount: raw.voteCount,
    votedByMe: raw.votedByMe,
    posts: (raw.posts ?? []).map((p) => buildPost(p, raw.id)),
    lastPostedAt: raw.lastPostedAt,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  }
}

export const MOCK_THREADS: ForumThread[] = RAW_THREADS.map(buildThread)
