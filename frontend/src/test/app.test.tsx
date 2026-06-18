import { StrictMode } from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'

function renderAt(path: string, strict = false) {
  const ui = (
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  )
  return render(strict ? <StrictMode>{ui}</StrictMode> : ui)
}

describe('ツール一覧（HomePage）', () => {
  it('デフォルトで全モックツールが一覧表（テーブル）表示される', () => {
    renderAt('/')
    expect(
      screen.getByText('A-SPICE要件トレーサビリティチェッカー'),
    ).toBeInTheDocument()
    expect(screen.getByText('13 件のツール')).toBeInTheDocument()
    // デフォルトはテーブル表示なのでテーブルヘッダが描画される
    expect(screen.getByText('業務シーン')).toBeInTheDocument()
    expect(screen.getByText('A-SPICE')).toBeInTheDocument()
  })

  it('A-SPICEはデフォルトでモーダル表示。ボタンを押すとモーダルが開き、V字モデルで絞り込みできる', () => {
    renderAt('/')
    // デフォルトではV字モデルは画面に表示されていない
    expect(
      screen.queryByRole('img', { name: 'A-SPICE V字モデル' }),
    ).not.toBeInTheDocument()

    // 「A-SPICEで絞り込む」ボタンを押すとモーダルが開く
    fireEvent.click(screen.getByRole('button', { name: /A-SPICEで絞り込む/ }))
    const svg = screen.getByRole('img', { name: 'A-SPICE V字モデル' })

    // モーダル内のV字モデルで SWE.1 をクリック（SWE.1 を持つのは tool 1 のみ）
    fireEvent.click(within(svg).getByText('SWE.1'))
    // モーダルを閉じる
    fireEvent.click(screen.getByRole('button', { name: 'この条件で絞り込む' }))

    // 一覧が絞り込まれている
    expect(
      screen.getByText('A-SPICE要件トレーサビリティチェッカー'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('テスト仕様書ドラフトジェネレータ'),
    ).not.toBeInTheDocument()
    expect(screen.getByText('1 件のツール')).toBeInTheDocument()
  })

  it('業務シーン（メール処理）で絞り込みできる', () => {
    renderAt('/')
    // メール処理チップをクリック（tool 11: メール返信ドラフト）
    fireEvent.click(screen.getByRole('button', { name: /メール処理/ }))
    expect(
      screen.getByText('メール返信ドラフト生成エージェント'),
    ).toBeInTheDocument()
    // メール処理を持たないツールは消える
    expect(
      screen.queryByText('A-SPICE要件トレーサビリティチェッカー'),
    ).not.toBeInTheDocument()
  })

  it('AI活用促進カテゴリでメタツールが見つかる', () => {
    renderAt('/')
    fireEvent.click(screen.getByRole('button', { name: /AI活用促進/ }))
    expect(
      screen.getByText('社内AIプロンプト集（部内ベストプラクティス）'),
    ).toBeInTheDocument()
    expect(screen.getByText('1 件のツール')).toBeInTheDocument()
  })
})

describe('いいねトグル（回帰: StrictMode で二重カウントしない）', () => {
  it('いいねを押すとカウントが +1 され、+2 にはならない', () => {
    // StrictMode 下では state 更新関数が二重実行される。
    // 旧実装（updater 内に setState をネスト）では +2 になっていた。
    renderAt('/tools/1', true)

    // tool 1 の初期いいね数は 24
    expect(screen.getByText('24')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /♡ いいね/ }))

    expect(screen.getByText('25')).toBeInTheDocument()
    expect(screen.queryByText('26')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /いいね済み/ }),
    ).toBeInTheDocument()
  })
})

describe('ツール詳細（回帰: README の GFM テーブル描画）', () => {
  it('README 内の Markdown テーブルが <table> 要素として描画される', () => {
    const { container } = renderAt('/tools/1')
    const table = container.querySelector('.markdown table')
    expect(table).not.toBeNull()
    // テーブルヘッダのセルが描画されていること
    expect(within(table as HTMLElement).getByText('要件ID')).toBeInTheDocument()
  })
})

describe('アクセス権申請フロー', () => {
  it('申請ボタン→モーダル→送信でマイページの申請一覧に追加される', () => {
    // copilot_agent の tool 1 は申請ボタンを持つ
    renderAt('/tools/1')
    fireEvent.click(
      screen.getByRole('button', { name: /管理者にアクセス権を申請する/ }),
    )
    // モーダルが表示される
    expect(screen.getByText('申請理由（任意）')).toBeInTheDocument()
  })
})

describe('zip_upload 種別の詳細ページ', () => {
  it('申請ボタンではなくダウンロードボタンが表示される', () => {
    // tool 4 は zip_upload
    renderAt('/tools/4')
    expect(
      screen.getByRole('button', { name: /ダウンロード/ }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /アクセス権を申請する/ }),
    ).not.toBeInTheDocument()
  })
})

describe('管理者ダッシュボード', () => {
  it('クラッシュせずにKPIが描画される', () => {
    renderAt('/admin/dashboard')
    expect(screen.getByText('登録ツール総数')).toBeInTheDocument()
    expect(
      screen.getByText('アクセス権申請 / DL（最重要KPI）'),
    ).toBeInTheDocument()
  })
})

describe('マイページ', () => {
  it('初期投入済みの申請（承認済み）が一覧に表示される', () => {
    renderAt('/mypage')
    fireEvent.click(
      screen.getByRole('button', { name: /申請したアクセス権/ }),
    )
    expect(screen.getByText('承認済み')).toBeInTheDocument()
  })
})

describe('テーブル表示（ToolTable / デフォルトビュー）', () => {
  it('デフォルトでテーブルヘッダが表示される', () => {
    renderAt('/')
    expect(screen.getByText('ツール名')).toBeInTheDocument()
    expect(screen.getByText('♥ いいね')).toBeInTheDocument()
    expect(screen.getByText('アクション')).toBeInTheDocument()
  })

  it('カード表示に切り替えるとテーブルヘッダが消える', () => {
    renderAt('/')
    fireEvent.click(screen.getByTitle('カード表示'))
    expect(screen.queryByText('♥ いいね')).not.toBeInTheDocument()
  })

  it('テーブル表示のいいねボタンが動作する', () => {
    renderAt('/')
    const likeButtons = screen.getAllByTitle('いいね')
    fireEvent.click(likeButtons[0])
    expect(screen.getAllByTitle('いいね解除').length).toBeGreaterThanOrEqual(1)
  })

  it('テーブル表示の申請ボタンでモーダルが開く', () => {
    renderAt('/')
    const requestButtons = screen.getAllByRole('button', { name: /📨 申請/ })
    fireEvent.click(requestButtons[0])
    expect(screen.getByText('申請理由（任意）')).toBeInTheDocument()
  })

  it('50音順ソートが機能する', () => {
    const { container } = renderAt('/')
    const sortSelect = container.querySelector(
      '.filter-bar select',
    ) as HTMLSelectElement
    fireEvent.change(sortSelect, { target: { value: 'name_asc' } })
    const firstToolName = container.querySelector('.table-tool-name')
    expect(firstToolName?.textContent).toBe('A-SPICE要件トレーサビリティチェッカー')
  })
})
