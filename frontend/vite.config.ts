/// <reference types="vitest" />
import path from 'node:path'
import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * ポート等の設定はプロジェクトルート `.env`（または `.env.local`）で一括管理。
 *  - FRONTEND_PORT  → dev サーバのポート
 *  - BACKEND_PORT   → VITE_API_BASE 未指定時のデフォルト API 接続先の算出に利用
 *  - VITE_USE_MOCK  → 実 API モード切替（false でDjangoに接続）
 *  - VITE_API_BASE  → 明示指定した場合は BACKEND_PORT より優先
 */
// このファイルが読まれていることの確認用。`frontend/vite.config.js` が残って
// いると Vite はそちらを優先し、この設定（envDir / define）が丸ごと無視される。
// その状態ではルートの `.env` が一切読まれず、`.env` を編集しても消しても
// 挙動が変わらない。起動ログに1行出しておけば、読まれているか一目で分かる。
export default defineConfig(({ mode }) => {
  const rootEnvDir = path.resolve(__dirname, '..')
  // 第3引数 '' で「VITE_プレフィックス以外」も含めて読み込む（FRONTEND_PORT等）
  const rootEnv = loadEnv(mode, rootEnvDir, '')
  const localEnv = loadEnv(mode, __dirname, '')
  const env = { ...rootEnv, ...localEnv }

  const frontendPort = Number(env.FRONTEND_PORT ?? '5174')
  const backendPort = env.BACKEND_PORT ?? '8009'
  const apiBase = env.VITE_API_BASE ?? `http://localhost:${backendPort}/api`
  // 既定は「実API」。モックは明示したときだけ。
  // 未設定でモックに倒すと、設定が届かない事故（後述）のときに画面が何事も
  // なく立ち上がり、DBのアカウントで入れない理由が分からなくなる。
  // 実APIを既定にしておけば「繋がらない」と素直に失敗して原因に辿り着ける。
  // テスト実行時だけは常に mock を強制する（バックエンド接続に依存させない）。
  const isTest = mode === 'test' || process.env.VITEST === 'true'
  const useMock = isTest ? 'true' : (env.VITE_USE_MOCK ?? 'false')

  if (!process.env.VITEST) {
    console.log(
      `[aitc] vite.config.ts を使用 / VITE_USE_MOCK=${useMock} / front:${frontendPort} api:${apiBase}`,
    )
  }

  return {
    plugins: [react()],
    // Vite の envDir をルートに向け、`import.meta.env` からも VITE_* が読める
    // ようにする。BACKEND_PORT 等の非VITE変数は下の `define` で注入する。
    envDir: rootEnvDir,
    server: {
      host: true,
      port: frontendPort,
    },
    define: {
      // クライアントに露出する VITE_API_BASE を BACKEND_PORT から計算した値で
      // 上書き注入（明示 VITE_API_BASE があればそれを優先）
      'import.meta.env.VITE_API_BASE': JSON.stringify(apiBase),
      'import.meta.env.VITE_USE_MOCK': JSON.stringify(useMock),
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      css: false,
    },
  }
})
