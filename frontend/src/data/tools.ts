import type { Tool } from '../types'

/**
 * デモ用モックデータ（要件仕様書 9.3 準拠）。
 * バックエンド不要 — 全データはこのファイル内に保持する。
 */
export const MOCK_TOOLS: Tool[] = [
  {
    id: '1',
    title: 'A-SPICE要件トレーサビリティチェッカー',
    summary:
      '要件間のトレーサビリティマトリクスをAIが自動検証し、抜け漏れを検出するCopilotエージェント',
    toolType: 'copilot_agent',
    aspiceProcesses: ['SWE.1', 'SWE.2'],
    tags: ['traceability', 'requirements', 'copilot'],
    accessUrl: 'https://copilotstudio.microsoft.com/agents/traceability-checker',
    author: '田中太郎',
    createdAt: '2026-05-10',
    updatedAt: '2026-06-15',
    likes: 24,
    views: 456,
    impressions: 1820,
    accessRequests: 8,
    forks: 2,
    effectQualitative: '要件レビューの抜け漏れチェック工数が半減した',
    effectHoursPerMonth: 20,
    readme: `## 概要
システム要件・ソフトウェア要件間のトレーサビリティマトリクスをAIが解析し、
リンク漏れ・孤立要件・循環参照を自動検出するCopilotエージェントです。

## 使い方
1. 要件管理ツール（DOORS / Polarion）からトレーサビリティをCSVエクスポート
2. Copilotエージェントにファイルを添付
3. \`トレーサビリティを検証して\` と指示
4. 抜け漏れレポートがMarkdownで出力される

## セットアップ
- Microsoft Copilot Studio へのアクセス権が必要です
- 「アクセス権を申請する」ボタンから登録者に申請してください

## 出力例
| 要件ID | 上位要件 | 下位要件 | テストケース | 状態 |
|--------|---------|---------|------------|------|
| SWR-012 | SYR-003 | — | TC-045 | ⚠️ 下位設計リンク欠落 |
`,
  },
  {
    id: '2',
    title: 'テスト仕様書ドラフトジェネレータ',
    summary:
      '詳細設計書からテスト仕様書のドラフトを自動生成するNotebookLMノート',
    toolType: 'notebook_lm',
    aspiceProcesses: ['SWE.5', 'SWE.6'],
    tags: ['test', 'documentation', 'notebooklm'],
    accessUrl: 'https://notebooklm.google.com/notebook/test-spec-generator',
    author: '鈴木花子',
    createdAt: '2026-04-22',
    updatedAt: '2026-05-30',
    likes: 18,
    views: 312,
    impressions: 1340,
    accessRequests: 12,
    forks: 1,
    effectQualitative: 'テスト仕様書の初版作成時間を3割削減',
    effectHoursPerMonth: 12,
    readme: `## 概要
詳細設計書（Word / Markdown）を読み込み、テスト観点・期待結果を備えた
テスト仕様書ドラフトを自動生成するNotebookLMノートです。

## 使い方
1. NotebookLMノートに詳細設計書をソースとして追加
2. プロンプト \`このモジュールのテスト仕様書ドラフトを作成して\` を実行
3. 境界値・異常系を含む観点が表形式で出力される

## 注意
- 生成結果はあくまでドラフトです。レビューは必須です。
`,
  },
  {
    id: '3',
    title: 'MISRA-C準拠コードレビューアシスタント',
    summary: 'GitHub Copilotを活用したMISRA-C:2023準拠の静的解析補助ツール',
    toolType: 'github_repo',
    aspiceProcesses: ['SWE.3', 'SWE.4'],
    tags: ['misra', 'code-review', 'static-analysis'],
    accessUrl: 'https://github.com/pas-internal/misra-c-review-assistant',
    author: '佐藤一郎',
    createdAt: '2026-03-15',
    updatedAt: '2026-06-02',
    likes: 31,
    views: 567,
    impressions: 2100,
    accessRequests: 15,
    forks: 3,
    effectQualitative: 'コードレビュー指摘のうち定型的なものを自動化',
    effectHoursPerMonth: 28,
    readme: `## 概要
GitHub Copilot のカスタム指示と組み合わせて、MISRA-C:2023 のルール違反を
プルリクエスト上で自動指摘するレビューアシスタントです。

## セットアップ
\`\`\`bash
git clone https://github.com/pas-internal/misra-c-review-assistant
cd misra-c-review-assistant
./setup.sh
\`\`\`

## 機能
- PR diff に対する MISRA ルールチェック
- 違反箇所へのインラインコメント
- ルール逸脱の根拠（Rationale）自動提示
`,
  },
  {
    id: '4',
    title: '議事録→アクションアイテム自動抽出',
    summary:
      '会議の議事録テキストからアクションアイテムと担当者を自動抽出するPythonスクリプト',
    toolType: 'zip_upload',
    aspiceProcesses: ['MAN.3'],
    workCategories: ['meeting', 'task_mgmt'],
    tags: ['meeting', 'productivity', 'python'],
    author: '山田次郎',
    createdAt: '2026-06-01',
    likes: 45,
    views: 890,
    impressions: 3050,
    downloads: 34,
    forks: 4,
    effectQualitative: '議事録整理の手間がほぼゼロに',
    effectHoursPerMonth: 8,
    readme: `## 概要
会議の議事録テキスト（.txt / .md）を入力すると、アクションアイテム・担当者・
期限を抽出し、表形式で出力するPythonスクリプトです。

## 使い方
\`\`\`bash
pip install -r requirements.txt
python extract_actions.py minutes.txt
\`\`\`

## 出力
\`actions.csv\` にアクションアイテムが書き出されます。
`,
  },
  {
    id: '5',
    title: '変更影響分析サポートエージェント',
    summary:
      'ECU仕様変更時の影響範囲をソースコードとドキュメントから横断分析するCopilotエージェント',
    toolType: 'copilot_agent',
    aspiceProcesses: ['SUP.10', 'SWE.2', 'SWE.3'],
    tags: ['impact-analysis', 'change-management', 'ecu'],
    accessUrl: 'https://copilotstudio.microsoft.com/agents/impact-analysis',
    author: '高橋美咲',
    createdAt: '2026-05-28',
    likes: 29,
    views: 423,
    impressions: 1650,
    accessRequests: 11,
    effectQualitative: '影響範囲の調査漏れリスクを低減',
    effectHoursPerMonth: 16,
    readme: `## 概要
ECU仕様の変更要求に対し、関連するソースコード・設計書・要件を横断検索し、
影響範囲のレポートを生成するCopilotエージェントです。

## 使い方
変更要求のチケットIDを入力すると、影響を受けるモジュール一覧と
関連ドキュメントへのリンクが提示されます。
`,
  },
  {
    id: '6',
    title: 'サプライヤー進捗レポート自動要約',
    summary:
      'サプライヤーからの週次レポートを自動要約し、リスク項目をハイライトするNotebookLMノート',
    toolType: 'notebook_lm',
    aspiceProcesses: ['ACQ.4', 'MAN.3'],
    workCategories: ['document', 'knowledge'],
    tags: ['supplier', 'summary', 'risk'],
    accessUrl: 'https://notebooklm.google.com/notebook/supplier-report-summary',
    author: '中村健太',
    createdAt: '2026-04-05',
    likes: 15,
    views: 234,
    impressions: 980,
    accessRequests: 6,
    effectQualitative: '週次レポート確認時間を短縮',
    effectHoursPerMonth: 6,
    readme: `## 概要
複数サプライヤーの週次進捗レポートを読み込み、進捗・課題・リスクを
要約するNotebookLMノートです。リスク項目は自動でハイライトされます。
`,
  },
  {
    id: '7',
    title: 'デグレード検知テスト自動生成',
    summary:
      '既存テストケースと変更差分からリグレッションテストを自動生成するPythonツール',
    toolType: 'zip_upload',
    aspiceProcesses: ['SWE.5', 'SYS.4'],
    tags: ['regression', 'test-generation', 'python'],
    author: '小林陽子',
    createdAt: '2026-05-18',
    likes: 22,
    views: 345,
    impressions: 1280,
    downloads: 19,
    forks: 1,
    effectQualitative: 'リグレッションテスト設計の初動を高速化',
    effectHoursPerMonth: 10,
    readme: `## 概要
変更差分（git diff）と既存テストケースを入力に、デグレードを検知するための
リグレッションテストケースを自動生成するPythonツールです。
`,
  },
  {
    id: '8',
    title: '品質メトリクスダッシュボード生成',
    summary:
      'コードメトリクス（複雑度、カバレッジ等）からA-SPICE SUP.1準拠の品質レポートを自動生成',
    toolType: 'github_repo',
    aspiceProcesses: ['SUP.1', 'SWE.4'],
    tags: ['metrics', 'quality', 'dashboard'],
    accessUrl: 'https://github.com/pas-internal/quality-metrics-dashboard',
    author: '渡辺裕介',
    createdAt: '2026-06-10',
    likes: 17,
    views: 289,
    impressions: 1120,
    accessRequests: 9,
    effectQualitative: '品質レポート作成を自動化',
    effectHoursPerMonth: 14,
    readme: `## 概要
コード複雑度・カバレッジ・静的解析結果を集約し、SUP.1（品質保証）向けの
品質レポートダッシュボードを生成するツールです。
`,
  },
  {
    id: '9',
    title: '構成管理ルール違反検出Bot',
    summary:
      'GitHubリポジトリのブランチ戦略・コミットメッセージ規約違反を自動検出し通知',
    toolType: 'github_repo',
    aspiceProcesses: ['SUP.8'],
    tags: ['config-management', 'git', 'bot'],
    accessUrl: 'https://github.com/pas-internal/scm-rule-bot',
    author: '伊藤真理',
    createdAt: '2026-05-05',
    likes: 13,
    views: 198,
    impressions: 760,
    accessRequests: 4,
    effectQualitative: '構成管理ルールの逸脱を早期検知',
    effectHoursPerMonth: 5,
    readme: `## 概要
ブランチ命名規約・コミットメッセージ規約・タグ運用ルールの違反を検出し、
GitHub上で自動通知する構成管理Botです。
`,
  },
  {
    id: '10',
    title: 'システム要件↔テスト双方向トレーサ',
    summary:
      'システム要件とシステムテスト仕様の双方向トレーサビリティを可視化するWebツール',
    toolType: 'zip_upload',
    aspiceProcesses: ['SYS.2', 'SYS.5'],
    tags: ['traceability', 'system-test', 'visualization'],
    author: '松本大輔',
    forkedFrom: '1',
    createdAt: '2026-04-28',
    likes: 20,
    views: 378,
    impressions: 1410,
    downloads: 16,
    effectQualitative: 'システムレベルのトレーサビリティを一目で把握',
    effectHoursPerMonth: 9,
    readme: `## 概要
システム要件とシステム適格性テスト仕様の双方向トレーサビリティを
インタラクティブに可視化するWebツールです。

> このツールは「A-SPICE要件トレーサビリティチェッカー」をフォークし、
> システムレベル（SYS）に特化させた改善版です。
`,
  },
  {
    id: '11',
    title: 'メール返信ドラフト生成エージェント',
    summary:
      '受信メールの内容に応じて返信ドラフトを自動生成するOutlook向けCopilotエージェント',
    toolType: 'copilot_agent',
    aspiceProcesses: [],
    workCategories: ['mail', 'translation'],
    tags: ['outlook', 'mail', 'productivity'],
    accessUrl: 'https://copilotstudio.microsoft.com/agents/mail-replier',
    author: '佐藤一郎',
    createdAt: '2026-06-08',
    likes: 38,
    views: 612,
    impressions: 2240,
    accessRequests: 18,
    effectQualitative: 'メール返信の初動が10分→2分に短縮',
    effectHoursPerMonth: 22,
    readme: `## 概要
受信メールのスレッドを読み込み、丁寧語/カジュアル/英文のトーンを
選んで返信ドラフトを自動生成するOutlook向けCopilotエージェントです。

## 使い方
1. Outlook で対象メールを開く
2. Copilot を起動し \`返信ドラフトを作って\` と指示
3. トーン（社内向け / 顧客向け / 英文）を選択
4. 生成されたドラフトをレビューして送信

## 特徴
- 過去のやり取りを踏まえた文脈考慮
- 日英バイリンガル対応（社内英語メール対応）
`,
  },
  {
    id: '12',
    title: 'Teams会議リアルタイム要約Bot',
    summary:
      'Teams会議中の発言をリアルタイムに要約し、決定事項とTODOを抽出するBot',
    toolType: 'other',
    aspiceProcesses: [],
    workCategories: ['meeting', 'chat', 'task_mgmt'],
    tags: ['teams', 'meeting', 'realtime'],
    accessUrl: 'https://teams.microsoft.com/apps/meeting-summarizer',
    author: '高橋美咲',
    createdAt: '2026-06-12',
    likes: 52,
    views: 780,
    impressions: 2890,
    accessRequests: 24,
    effectQualitative: '会議後の議事録作成工数がほぼゼロに',
    effectHoursPerMonth: 18,
    readme: `## 概要
Teams 会議中の音声をリアルタイムでテキスト化・要約し、終了時に
議事録・決定事項・アクションアイテムを Teams チャネルに自動投稿する Bot です。

## セットアップ
管理者にアクセス権を申請後、Teams 会議の参加者として Bot を追加してください。
`,
  },
  {
    id: '13',
    title: '社内AIプロンプト集（部内ベストプラクティス）',
    summary:
      '部内で実証済みのAIプロンプトを業務シーン別に検索できる、AI活用促進のためのプラットフォーム',
    toolType: 'notebook_lm',
    aspiceProcesses: [],
    workCategories: ['ai_enablement', 'knowledge'],
    tags: ['prompt', 'best-practice', 'enablement'],
    accessUrl: 'https://notebooklm.google.com/notebook/internal-prompts',
    author: '中村健太',
    createdAt: '2026-06-14',
    likes: 67,
    views: 1024,
    impressions: 3560,
    accessRequests: 31,
    effectQualitative: '「何にAIを使えばいいか分からない」層の活用着手率が向上',
    effectHoursPerMonth: 0,
    readme: `## 概要
部内で実際に効果があったAIプロンプトを業務シーン（会議・メール・
ドキュメント作成等）別に検索できるNotebookLMです。
「AI活用そのものを促進する」メタツールという位置づけです。

## 収録カテゴリ
- 会議要約・議事録作成
- メール返信・顧客対応
- 設計書ドラフト作成
- レビューコメント整理
- 英語コミュニケーション
`,
  },
]
