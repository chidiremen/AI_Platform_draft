/** モックモード用のフォーラムのシード。 */
import type { ForumThread } from '../../types'

/** 2ch 風の匿名 ID（モックでは決定的な簡易ハッシュ） */
export function mockPosterId(author: string, threadId: string, day: string): string {
  let h = 0
  const raw = `${author}:${threadId}:${day}`
  for (let i = 0; i < raw.length; i++) {
    h = (h * 31 + raw.charCodeAt(i)) | 0
  }
  return Math.abs(h).toString(16).padStart(8, '0').slice(0, 8)
}

export const MOCK_THREADS: ForumThread[] = [
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
    posterId: mockPosterId('鈴木花子', 't1', '2026-07-10'),
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
        posterId: mockPosterId('佐藤一郎', 't1', '2026-07-10'),
        createdAt: '2026-07-10T10:12:00Z',
        updatedAt: '2026-07-10T10:12:00Z',
      },
      {
        id: 't1p3',
        threadId: 't1',
        number: 3,
        body: '>>2\n同じ。特に用語の統一が面倒なので、そこだけでも自動化されると嬉しい',
        author: '山田次郎',
        posterId: mockPosterId('山田次郎', 't1', '2026-07-10'),
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
        posterId: mockPosterId('田中太郎', 't1', '2026-07-11'),
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
    posterId: mockPosterId('中村健太', 't2', '2026-07-12'),
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
        posterId: mockPosterId('渡辺裕介', 't2', '2026-07-12'),
        createdAt: '2026-07-12T14:20:00Z',
        updatedAt: '2026-07-12T14:20:00Z',
      },
      {
        id: 't2p3',
        threadId: 't2',
        number: 3,
        body: '>>2\nDBCでデコードして信号名+統計にしてから投げる感じかな',
        author: '中村健太',
        posterId: mockPosterId('中村健太', 't2', '2026-07-12'),
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
    posterId: mockPosterId('田中太郎', 't3', '2026-07-13'),
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
        posterId: mockPosterId('小林陽子', 't3', '2026-07-13'),
        createdAt: '2026-07-13T10:00:00Z',
        updatedAt: '2026-07-13T10:00:00Z',
      },
      {
        id: 't3p3',
        threadId: 't3',
        number: 3,
        body: 'タグ運用のほうが現実的では？名前は自由でタグで統一する',
        author: '伊藤真理',
        posterId: mockPosterId('伊藤真理', 't3', '2026-07-13'),
        createdAt: '2026-07-13T10:30:00Z',
        updatedAt: '2026-07-13T10:30:00Z',
      },
      {
        id: 't3p4',
        threadId: 't3',
        number: 4,
        body: '>>3\nそれもアリ。タグのサジェスト機能があると揃いやすそう',
        author: '田中太郎',
        posterId: mockPosterId('田中太郎', 't3', '2026-07-13'),
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
    posterId: mockPosterId('佐藤一郎', 't4', '2026-07-14'),
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
        posterId: mockPosterId('松本大輔', 't4', '2026-07-14'),
        createdAt: '2026-07-14T16:00:00Z',
        updatedAt: '2026-07-14T16:00:00Z',
      },
    ],
    lastPostedAt: '2026-07-14T16:00:00Z',
    createdAt: '2026-07-14T15:00:00Z',
    updatedAt: '2026-07-14T16:00:00Z',
  },
]
