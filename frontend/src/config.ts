/**
 * 実行時設定。
 *
 * フロントエンドは既定で「モックモード」（バックエンド不要・全データはメモリ内）で動作する。
 * バックエンド（Django + DRF）に接続するには、ビルド/起動時に環境変数を設定する:
 *
 *   VITE_USE_MOCK=false        … 実APIモードに切り替え
 *   VITE_API_BASE=...          … APIのベースURL（既定 http://localhost:8009/api）
 *
 * 例（.env.local もしくは起動時）:
 *   VITE_USE_MOCK=false VITE_API_BASE=http://localhost:8009/api npm run dev
 */

const env = import.meta.env as Record<string, string | undefined>

/** モックモードか（既定 true）。'false' を明示したときだけ実API。 */
export const USE_MOCK = (env.VITE_USE_MOCK ?? 'true').toLowerCase() !== 'false'

/** APIベースURL（末尾スラッシュなし） */
export const API_BASE = (env.VITE_API_BASE ?? 'http://localhost:8009/api').replace(/\/$/, '')

/** 認証トークンの localStorage キー（DRF TokenAuthentication） */
export const TOKEN_KEY = 'aitc_token'
