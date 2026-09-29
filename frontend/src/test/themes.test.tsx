/**
 * テーマ / アイデア機能のテスト。
 *
 * 狙いは「重複開発の抑止」と「途中経過・失敗の可視化」なので、
 * その2つが画面として成立しているかを中心に見る。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import { computeStalled, mergeThemeList } from '../hooks/useThemes'
import type { Theme } from '../types'

const SESSION_KEY = 'aitc_session'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  localStorage.setItem(SESSION_KEY, 'tanaka')
})

afterEach(() => {
  localStorage.clear()
})

describe('テーマ一覧', () => {
  it('進行中のテーマが一覧表示される', async () => {
    renderAt('/themes')
    expect(await screen.findByText('議事録の自動要約')).toBeInTheDocument()
    expect(screen.getByText('設計書の表記ゆれチェック')).toBeInTheDocument()
  })

  it('一定期間進捗が無いテーマに「停滞」バッジが出る', async () => {
    renderAt('/themes')
    await screen.findByText('設計書の表記ゆれチェック')
    expect(screen.getByText(/停滞 70日/)).toBeInTheDocument()
  })

  it('凍結テーマは理由が一覧に出る（失敗も成果として扱うため）', async () => {
    const { unmount } = renderAt('/themes')
    await screen.findByText('問い合わせ一次回答の自動化')
    expect(
      screen.getByText(/FAQ の粒度が粗く、回答精度が実用水準に届かなかった/),
    ).toBeInTheDocument()
    unmount()
  })

  it('ステータスで絞り込める', async () => {
    renderAt('/themes')
    await screen.findByText('議事録の自動要約')
    fireEvent.click(screen.getByRole('button', { name: /凍結/ }))
    await waitFor(() => {
      expect(screen.queryByText('議事録の自動要約')).not.toBeInTheDocument()
    })
    expect(screen.getByText('問い合わせ一次回答の自動化')).toBeInTheDocument()
  })

  it('「停滞」フィルタは停滞中のテーマだけを出す', async () => {
    renderAt('/themes')
    await screen.findByText('議事録の自動要約')
    fireEvent.click(screen.getByRole('button', { name: /^停滞/ }))
    await waitFor(() => {
      expect(screen.queryByText('議事録の自動要約')).not.toBeInTheDocument()
    })
    expect(screen.getByText('設計書の表記ゆれチェック')).toBeInTheDocument()
  })

  it('完了テーマから成果物（ツール）へ辿れる', async () => {
    renderAt('/themes/th-5')
    await screen.findByRole('heading', { name: 'コードレビューコメントの下書き' })
    const link = screen.getByRole('link', { name: 'コードレビュー支援ボット' })
    expect(link).toHaveAttribute('href', '/tools/t-1')
  })
})

describe('テーマ詳細（軌跡）', () => {
  it('タイムラインに進捗が並ぶ', async () => {
    renderAt('/themes/th-1')
    await screen.findByRole('heading', { name: '議事録の自動要約' })
    expect(
      screen.getByText('要約プロンプトを3案比較。決定事項の抽出が弱い。'),
    ).toBeInTheDocument()
    expect(screen.getByText('55%')).toBeInTheDocument()
  })

  it('メンバーは進捗を投稿できる', async () => {
    renderAt('/themes/th-1')
    await screen.findByRole('heading', { name: '議事録の自動要約' })
    fireEvent.change(screen.getByPlaceholderText(/できたこと/), {
      target: { value: '結合テストまで完了' },
    })
    fireEvent.click(screen.getByRole('button', { name: '投稿' }))
    expect(await screen.findByText('結合テストまで完了')).toBeInTheDocument()
  })

  it('非メンバーには進捗の選択肢が出ない（コメントはできる）', async () => {
    // th-2 は佐藤さんのテーマで、田中さんはメンバーではない
    renderAt('/themes/th-2')
    await screen.findByRole('heading', { name: 'テスト仕様書のレビュー観点抽出' })
    expect(screen.queryByText('📈 進捗')).not.toBeInTheDocument()
    expect(screen.getByText('💬 コメント')).toBeInTheDocument()
  })

  it('非メンバーには合流ボタンが出る', async () => {
    renderAt('/themes/th-2')
    await screen.findByRole('heading', { name: 'テスト仕様書のレビュー観点抽出' })
    expect(
      screen.getByRole('button', { name: /このテーマに合流する/ }),
    ).toBeInTheDocument()
  })

  it('凍結中のテーマは理由がバナーに出る', async () => {
    renderAt('/themes/th-4')
    await screen.findByRole('heading', { name: '問い合わせ一次回答の自動化' })
    const banner = document.querySelector('.theme-banner-frozen')
    expect(banner).not.toBeNull()
    expect(banner?.textContent).toContain('FAQ の粒度が粗く')
  })

  it('存在しないテーマでは白紙ではなく案内が出る', async () => {
    renderAt('/themes/does-not-exist')
    expect(await screen.findByText(/テーマが見つかりません/)).toBeInTheDocument()
  })
})

describe('凍結（失敗を残す）', () => {
  it('理由を書かずに凍結しようとするとモーダルが閉じない', async () => {
    renderAt('/themes/th-1')
    await screen.findByRole('heading', { name: '議事録の自動要約' })
    fireEvent.click(screen.getByRole('button', { name: /凍結する/ }))
    const modal = document.querySelector('.modal') as HTMLElement
    expect(modal).not.toBeNull()
    fireEvent.click(within(modal).getByRole('button', { name: '凍結する' }))
    await waitFor(() => {
      expect(screen.getByText('凍結理由を入力してください。')).toBeInTheDocument()
    })
    expect(document.querySelector('.modal')).not.toBeNull()
  })

  it('理由を書けば凍結できる', async () => {
    renderAt('/themes/th-1')
    await screen.findByRole('heading', { name: '議事録の自動要約' })
    fireEvent.click(screen.getByRole('button', { name: /凍結する/ }))
    const modal = document.querySelector('.modal') as HTMLElement
    fireEvent.change(within(modal).getByRole('textbox'), {
      target: { value: '要約の精度が実用水準に届かなかった' },
    })
    fireEvent.click(within(modal).getByRole('button', { name: '凍結する' }))
    expect(
      await screen.findByText('要約の精度が実用水準に届かなかった'),
    ).toBeInTheDocument()
  })
})

describe('重複検知', () => {
  it('似たテーマ名を入れると既存テーマが提示される', async () => {
    renderAt('/themes/new')
    await screen.findByRole('heading', { name: /テーマを登録/ })
    const title = document.querySelector('.theme-form input.input') as HTMLInputElement
    fireEvent.change(title, { target: { value: '議事録 要約 ツール' } })
    expect(
      await screen.findByText('⚠️ 似たテーマがすでにあります', {}, { timeout: 3000 }),
    ).toBeInTheDocument()
    const box = document.querySelector('.theme-similar') as HTMLElement
    expect(within(box).getByRole('link', { name: '議事録の自動要約' })).toBeInTheDocument()
  })

  it('無関係な名前では警告が出ない', async () => {
    renderAt('/themes/new')
    await screen.findByRole('heading', { name: /テーマを登録/ })
    const title = document.querySelector('.theme-form input.input') as HTMLInputElement
    fireEvent.change(title, { target: { value: '社員旅行の幹事支援' } })
    await new Promise((r) => setTimeout(r, 700))
    expect(document.querySelector('.theme-similar')).toBeNull()
  })
})

describe('アイデア', () => {
  it('賛同順に並ぶ', async () => {
    renderAt('/ideas')
    await screen.findByText('仕様変更の影響範囲を出してほしい')
    const titles = [...document.querySelectorAll('.theme-card-title')].map(
      (el) => el.textContent,
    )
    expect(titles[0]).toBe('仕様変更の影響範囲を出してほしい') // 5票
  })

  it('賛同をトグルできる', async () => {
    renderAt('/ideas')
    await screen.findByText('仕様変更の影響範囲を出してほしい')
    const vote = document.querySelectorAll('.idea-vote')[0] as HTMLElement
    const before = vote.querySelector('.idea-vote-count')?.textContent
    fireEvent.click(vote)
    await waitFor(() => {
      expect(vote.querySelector('.idea-vote-count')?.textContent).not.toBe(before)
    })
  })

  it('アイデアからテーマを起こせる（手を挙げた人が発起人になる）', async () => {
    renderAt('/ideas/id-1')
    await screen.findByRole('heading', { name: '経費精算の入力を自動化したい' })
    fireEvent.click(screen.getByRole('button', { name: /これに着手する/ }))
    // テーマ詳細に遷移し、軌跡が表示される
    expect(await screen.findByText('テーマを登録しました。')).toBeInTheDocument()
  })

  it('アイデアにコメントできる', async () => {
    renderAt('/ideas/id-1')
    await screen.findByRole('heading', { name: '経費精算の入力を自動化したい' })
    fireEvent.change(screen.getByPlaceholderText(/実現方法の案/), {
      target: { value: '既存の OCR ライブラリで試せそう' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'コメントする' }))
    expect(await screen.findByText('既存の OCR ライブラリで試せそう')).toBeInTheDocument()
  })
})

describe('ヘッダー導線', () => {
  it('テーマへのリンクがある', async () => {
    renderAt('/')
    await screen.findByText('13 件のツール')
    const nav = document.querySelector('.header-nav') as HTMLElement
    expect(within(nav).getByRole('link', { name: /テーマ/ })).toHaveAttribute(
      'href',
      '/themes',
    )
  })
})

// ── ロジック単体 ──────────────────────────────────────────────

function fixture(over: Partial<Theme>): Theme {
  return {
    id: 'x',
    title: 't',
    summary: 's',
    body: '',
    status: 'active',
    tags: [],
    workCategories: [],
    owner: 'o',
    ownerId: 1,
    freezeReason: '',
    frozenAt: null,
    resultingTool: null,
    resultingToolTitle: null,
    mergedInto: null,
    mergedIntoTitle: null,
    mergedAt: null,
    originIdea: null,
    originIdeaTitle: null,
    lastProgressAt: null,
    daysSinceProgress: null,
    isStalled: false,
    stalledAfterDays: 30,
    memberCount: 1,
    entryCount: 0,
    latestProgress: null,
    latestProgressPercent: null,
    isMember: false,
    canEdit: false,
    myJoinRequestStatus: null,
    pendingJoinCount: 0,
    viewCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...over,
  }
}

describe('mergeThemeList', () => {
  it('一覧レスポンスで詳細取得済みの entries を消さない', () => {
    // 一覧APIは entries を返さない。素朴に置き換えるとタイムラインが消える
    // （フォーラムで「>>1 しか出ない」として踏んだのと同じ罠）
    const prev = [fixture({ id: 'a', entries: [], members: [] })]
    const incoming = [fixture({ id: 'a', entries: undefined, members: undefined })]
    const out = mergeThemeList(prev, incoming)
    expect(out[0].entries).toEqual([])
    expect(out[0].members).toEqual([])
  })

  it('一覧に含まれないが詳細取得済みのテーマは残す', () => {
    const prev = [fixture({ id: 'detail-only', entries: [] })]
    const out = mergeThemeList(prev, [fixture({ id: 'other' })])
    expect(out.map((t) => t.id)).toContain('detail-only')
  })

  it('新しい値で上書きされる', () => {
    const prev = [fixture({ id: 'a', title: '古い', entries: [] })]
    const out = mergeThemeList(prev, [fixture({ id: 'a', title: '新しい' })])
    expect(out[0].title).toBe('新しい')
  })
})

describe('computeStalled', () => {
  const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString()

  it('進捗が新しければ停滞ではない', () => {
    expect(computeStalled(fixture({ lastProgressAt: daysAgo(3) }))).toBe(false)
  })

  it('しきい値を超えて進捗が無ければ停滞', () => {
    expect(computeStalled(fixture({ lastProgressAt: daysAgo(40) }))).toBe(true)
  })

  it('凍結・完了は停滞にしない（止まっているのが正常な状態のため）', () => {
    expect(
      computeStalled(fixture({ status: 'frozen', lastProgressAt: daysAgo(400) })),
    ).toBe(false)
    expect(
      computeStalled(fixture({ status: 'done', lastProgressAt: daysAgo(400) })),
    ).toBe(false)
  })

  it('進捗が1件も無ければ作成日時を基準にする', () => {
    expect(
      computeStalled(fixture({ lastProgressAt: null, createdAt: daysAgo(60) })),
    ).toBe(true)
  })
})

describe('モックモードの警告帯', () => {
  it('モックで動いているとログイン前から警告が出る', async () => {
    // モックではDBのアカウントで入れない。それを黙って行うと
    // 「アカウントが違う」と誤認されるので、画面から即分かるようにする。
    localStorage.clear()
    renderAt('/')
    expect(await screen.findByText(/モックモードで動作中/)).toBeInTheDocument()
    expect(
      screen.getByText(/データベースのアカウントでは/),
    ).toBeInTheDocument()
  })

  it('ログイン後も出続ける', async () => {
    renderAt('/themes')
    await screen.findByText('議事録の自動要約')
    expect(screen.getByText(/モックモードで動作中/)).toBeInTheDocument()
  })

  it('切り替え方法を示している', async () => {
    renderAt('/themes')
    await screen.findByText('議事録の自動要約')
    expect(screen.getByText('VITE_USE_MOCK=false')).toBeInTheDocument()
  })
})

describe('タグ・フィルタの選択状態', () => {
  it('業務シーンのタグを選ぶと選択状態になる', async () => {
    // 以前は存在しない .chip-on を当てていたため、押しても見た目が
    // 変わらず「タグが選べない」状態だった
    renderAt('/themes/new')
    await screen.findByRole('heading', { name: /テーマを登録/ })
    const chip = document.querySelector('.theme-form .chip') as HTMLElement
    expect(chip.className).not.toContain('active')
    fireEvent.click(chip)
    await waitFor(() => expect(chip.className).toContain('active'))
    fireEvent.click(chip)
    await waitFor(() => expect(chip.className).not.toContain('active'))
  })

  it('一覧のフィルタも選択状態が付く', async () => {
    renderAt('/themes')
    await screen.findByText('議事録の自動要約')
    const frozen = screen.getByRole('button', { name: /凍結/ })
    expect(frozen.className).not.toContain('active')
    fireEvent.click(frozen)
    await waitFor(() => expect(frozen.className).toContain('active'))
  })
})
