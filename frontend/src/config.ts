/**
 * 実行時設定。
 *
 * ## モード判定の方針
 *
 * 既定は **実APIモード**。モックは `VITE_USE_MOCK=true` を明示したときだけ。
 *
 * 以前は逆（未設定ならモック）だったが、これは危険だった。設定が届かない
 * 事故（後述）が起きたとき、画面は何事もなく立ち上がり、ソースに埋め込まれた
 * デモユーザーでログインできてしまう。「DBのアカウントで入れない」という
 * 分かりにくい症状になり、原因に辿り着くまで時間を溶かす。
 * 実APIを既定にしておけば、設定が届かなければ「バックエンドに繋がらない」と
 * 素直に失敗するので、すぐ気づける。
 *
 * ## 設定が届かない事故の実例
 *
 * `frontend/vite.config.js`（過去の `tsc -b` が吐いた残骸）が残っていると、
 * Vite は `.ts` ではなくそちらを読む。すると `envDir` の指定が効かず、
 * プロジェクトルートの `.env` が一切読まれない。`.env` を書き換えても
 * 消しても挙動が変わらない、という状態になる。
 */

const env = import.meta.env as Record<string, string | undefined>

/**
 * 値を真偽に解釈する。
 * 前後の空白や引用符、大文字小文字、`1/yes/on` 表記を許容する。
 * `.env` の値に空白が紛れただけでモードが変わる、という事故を避けるため。
 */
function asBool(raw: string | undefined): boolean {
  const v = (raw ?? '').trim().replace(/^["']|["']$/g, '').toLowerCase()
  return v === 'true' || v === '1' || v === 'yes' || v === 'on'
}

/** モックモードか。`VITE_USE_MOCK=true` を明示したときだけ true。 */
export const USE_MOCK = asBool(env.VITE_USE_MOCK)

/**
 * モード判定に使った生の値。未設定なら null。
 * 「設定が届いていない」のか「明示的に未設定なのか」を画面側で区別するため。
 */
export const USE_MOCK_RAW: string | null = env.VITE_USE_MOCK ?? null

/** APIベースURL（末尾スラッシュなし） */
export const API_BASE = (env.VITE_API_BASE ?? 'http://localhost:8009/api').replace(/\/$/, '')

/** 認証トークンの localStorage キー（DRF TokenAuthentication） */
export const TOKEN_KEY = 'aitc_token'
