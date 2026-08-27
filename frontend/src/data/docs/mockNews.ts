/**
 * モックモード用のニュースのシード。
 *
 * 実 API モードでは AI_WeeklyNews が出力した `articles.jsonl` を
 * `python manage.py import_news` で取り込んだものが表示される。
 * ここはバックエンド無しでも画面を確認できるようにするためのダミー。
 */
import type { NewsArticle } from '../../types'

function iso(daysAgo: number, hour = 9): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}

interface Seed {
  id: string
  link: string
  title: string
  titleJa: string
  summary: string
  source: string
  category: string
  daysAgo: number
}

const SEEDS: Seed[] = [
  {
    id: 'n1',
    link: 'https://openai.com/blog/faster-reasoning-model',
    title: 'Introducing a faster reasoning model',
    titleJa: '高速な推論モデルを発表',
    summary:
      '推論速度を大幅に改善した新モデルが発表された。従来比で応答遅延が約40%短縮され、対話用途での体感が大きく変わるとしている。',
    source: 'OpenAI Blog',
    category: 'モデル',
    daysAgo: 0,
  },
  {
    id: 'n2',
    link: 'https://ai.googleblog.com/scaling-laws-revisited',
    title: 'Scaling laws revisited',
    titleJa: 'スケーリング則の再検証',
    summary:
      'データ品質を考慮した新しいスケーリング則の分析結果を公開。小規模モデルでも高品質なデータを与えれば性能が伸びることを示した。',
    source: 'Google AI Blog',
    category: '研究',
    daysAgo: 0,
  },
  {
    id: 'n3',
    link: 'https://huggingface.co/blog/transformers-v6',
    title: 'Transformers v6 released',
    titleJa: 'Transformers v6 がリリース',
    summary:
      '推論APIの刷新と量子化サポートの拡充が主な変更点。既存コードの互換性は概ね維持されている。',
    source: 'Hugging Face',
    category: 'OSS',
    daysAgo: 1,
  },
  {
    id: 'n4',
    link: 'https://technologyreview.com/eu-ai-act-details',
    title: 'AI regulation in the EU takes shape',
    titleJa: 'EUのAI規制が具体化',
    summary:
      'EU AI Act の施行細則が公開され、高リスク用途の定義がより明確になった。車載分野への影響も指摘されている。',
    source: 'MIT Technology Review',
    category: '社会',
    daysAgo: 2,
  },
  {
    id: 'n5',
    link: 'https://nvidia.com/blog/new-inference-accelerator',
    title: 'New inference accelerator announced',
    titleJa: '新しい推論アクセラレータを発表',
    summary:
      '消費電力あたりの推論性能を2倍に向上させた新チップ。データセンター向けに2027年出荷予定。',
    source: 'NVIDIA Blog',
    category: 'ハードウェア',
    daysAgo: 3,
  },
  {
    id: 'n6',
    link: 'https://example.com/automotive-ai-safety',
    title: 'Functional safety for AI components',
    titleJa: 'AIコンポーネントの機能安全',
    summary:
      '車載ソフトウェアにおけるAI部品の機能安全論証について、業界横断のワーキンググループが中間報告を公開した。',
    source: 'Automotive Weekly',
    category: '社会',
    daysAgo: 4,
  },
  {
    id: 'n7',
    link: 'https://example.com/local-llm-benchmark',
    title: 'Local LLM benchmark update',
    titleJa: 'ローカルLLMのベンチマーク更新',
    summary:
      '一般的なノートPCで動作する量子化モデルの比較。日本語タスクでの精度と速度のトレードオフを整理している。',
    source: 'Local AI Digest',
    category: 'モデル',
    daysAgo: 5,
  },
  {
    id: 'n8',
    link: 'https://example.com/rag-patterns',
    title: 'Practical RAG patterns',
    titleJa: '実践的なRAGパターン',
    summary:
      '社内文書検索でよく使われるRAG構成の型を整理。チャンク分割と再ランキングの効き方を検証した記事。',
    source: 'Engineering Blog',
    category: '実践',
    daysAgo: 6,
  },
]

export const MOCK_NEWS: NewsArticle[] = SEEDS.map((s) => ({
  id: s.id,
  link: s.link,
  title: s.title,
  titleJa: s.titleJa,
  displayTitle: s.titleJa || s.title,
  summary: s.summary,
  source: s.source,
  category: s.category,
  published: iso(s.daysAgo),
  collectedAt: iso(s.daysAgo, 7),
  thumbnailUrl: '',
  isVisible: true,
  discussionThreadId: null,
  discussionPostCount: 0,
  importedAt: iso(s.daysAgo, 7),
}))
