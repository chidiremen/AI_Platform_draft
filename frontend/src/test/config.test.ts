/**
 * モード判定の回帰テスト。
 *
 * 背景: frontend/vite.config.js（古い tsc -b の残骸）が残っていると Vite は
 * vite.config.ts を無視し、envDir が効かずルートの .env が一切読まれない。
 * 以前は「未設定ならモック」だったため、この状態で画面は普通に立ち上がり、
 * ソース内のデモユーザーでログインできてしまっていた。DBのアカウントで
 * 入れない理由が分からず時間を溶かしたので、既定を実APIに反転させた。
 */
import { describe, expect, it } from 'vitest'

/** src/config.ts の asBool と同じ規則（あちらは非公開なので同義実装で検証する） */
function asBool(raw: string | undefined): boolean {
  const v = (raw ?? '').trim().replace(/^["']|["']$/g, '').toLowerCase()
  return v === 'true' || v === '1' || v === 'yes' || v === 'on'
}

describe('VITE_USE_MOCK の解釈', () => {
  it('未設定なら実APIモード（モックに倒さない）', () => {
    // ここが反転の肝。設定が届かない事故のとき、黙ってモックで
    // 立ち上がるより「繋がらない」と失敗した方が原因に辿り着ける。
    expect(asBool(undefined)).toBe(false)
    expect(asBool('')).toBe(false)
  })

  it('明示的に true のときだけモック', () => {
    expect(asBool('true')).toBe(true)
    expect(asBool('TRUE')).toBe(true)
    expect(asBool('1')).toBe(true)
    expect(asBool('yes')).toBe(true)
    expect(asBool('on')).toBe(true)
  })

  it('false 系はすべて実API', () => {
    for (const v of ['false', 'FALSE', '0', 'no', 'off']) {
      expect(asBool(v)).toBe(false)
    }
  })

  it('前後の空白や引用符が混ざっても解釈がぶれない', () => {
    // .env に "VITE_USE_MOCK=false " と書かれただけでモードが変わるのを防ぐ
    expect(asBool(' false ')).toBe(false)
    expect(asBool('"false"')).toBe(false)
    expect(asBool(" 'true' ")).toBe(true)
    expect(asBool('  TRUE  ')).toBe(true)
  })

  it('想定外の値は実APIに倒す', () => {
    expect(asBool('mock')).toBe(false)
    expect(asBool('ture')).toBe(false)
  })
})
