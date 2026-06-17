import type { AspiceProcess } from '../types'

/**
 * Automotive SPICE プロセス定義。
 * x / y は V字モデルビジュアルセレクタの SVG viewBox (960 x 560) 上の中心座標。
 *
 * V字モデル左辺（開発系・上から下）→ 底辺 → 右辺（検証系・下から上）。
 * サポート系プロセスは V字の下部に横並びで配置する。
 */
export const ASPICE_PROCESSES: AspiceProcess[] = [
  // ── 左辺（開発系）──
  { id: 'SYS.2', name: 'システム要件分析', category: 'SYS', position: 'left', displayOrder: 1, x: 70, y: 50 },
  { id: 'SYS.3', name: 'システムアーキテクチャ設計', category: 'SYS', position: 'left', displayOrder: 2, x: 145, y: 135 },
  { id: 'SWE.1', name: 'ソフトウェア要件分析', category: 'SWE', position: 'left', displayOrder: 3, x: 220, y: 220 },
  { id: 'SWE.2', name: 'ソフトウェアアーキテクチャ設計', category: 'SWE', position: 'left', displayOrder: 4, x: 295, y: 305 },
  { id: 'SWE.3', name: 'ソフトウェア詳細設計・ユニット構築', category: 'SWE', position: 'left', displayOrder: 5, x: 370, y: 390 },

  // ── 底辺 ──
  { id: 'SWE.4', name: 'ソフトウェアユニット検証（単体テスト）', category: 'SWE', position: 'bottom', displayOrder: 6, x: 590, y: 390 },

  // ── 右辺（検証系）──
  { id: 'SWE.5', name: 'ソフトウェア統合テスト', category: 'SWE', position: 'right', displayOrder: 7, x: 665, y: 305 },
  { id: 'SWE.6', name: 'ソフトウェア適格性テスト', category: 'SWE', position: 'right', displayOrder: 8, x: 740, y: 220 },
  { id: 'SYS.4', name: 'システム統合テスト', category: 'SYS', position: 'right', displayOrder: 9, x: 815, y: 135 },
  { id: 'SYS.5', name: 'システム適格性テスト', category: 'SYS', position: 'right', displayOrder: 10, x: 890, y: 50 },

  // ── サポート系（V字の外側）──
  { id: 'SUP.1', name: '品質保証', category: 'SUP', position: 'support', displayOrder: 11, x: 90, y: 500 },
  { id: 'SUP.8', name: '構成管理', category: 'SUP', position: 'support', displayOrder: 12, x: 250, y: 500 },
  { id: 'SUP.9', name: '問題解決管理', category: 'SUP', position: 'support', displayOrder: 13, x: 410, y: 500 },
  { id: 'SUP.10', name: '変更要求管理', category: 'SUP', position: 'support', displayOrder: 14, x: 570, y: 500 },
  { id: 'MAN.3', name: 'プロジェクト管理', category: 'MAN', position: 'support', displayOrder: 15, x: 730, y: 500 },
  { id: 'ACQ.4', name: 'サプライヤー監視', category: 'ACQ', position: 'support', displayOrder: 16, x: 890, y: 500 },
]

/** id → AspiceProcess の参照マップ */
export const ASPICE_MAP: Record<string, AspiceProcess> = Object.fromEntries(
  ASPICE_PROCESSES.map((p) => [p.id, p]),
)

/** V字の折れ線（左辺→底辺→右辺）を構成するプロセス順 */
export const V_MODEL_PATH_ORDER = [
  'SYS.2',
  'SYS.3',
  'SWE.1',
  'SWE.2',
  'SWE.3',
  'SWE.4',
  'SWE.5',
  'SWE.6',
  'SYS.4',
  'SYS.5',
]

/** 水平トレーサビリティのペア（左辺 ↔ 右辺） */
export const V_MODEL_TRACE_PAIRS: [string, string][] = [
  ['SYS.2', 'SYS.5'],
  ['SYS.3', 'SYS.4'],
  ['SWE.1', 'SWE.6'],
  ['SWE.2', 'SWE.5'],
]

/** カテゴリ別のアクセントカラー */
export const CATEGORY_COLORS: Record<string, string> = {
  SYS: '#4f9dde',
  SWE: '#41c7b9',
  SUP: '#e0a458',
  MAN: '#b88ad6',
  ACQ: '#e07a8b',
}
