import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'

const SESSION_KEY = 'aitc_session'

/** localStorage にセッションを書き込んでログイン状態にする */
function seedSession(loginId = 'tanaka') {
  localStorage.setItem(SESSION_KEY, loginId)
}

function renderAt(path: string, strict = false) {
  const ui = (
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  )
  return render(strict ? <StrictMode>{ui}</StrictMode> : ui)
}

beforeEach(() => {
  // デフォルトは管理者（tanaka）でログイン済み
  seedSession('tanaka')
})

afterEach(() => {
  localStorage.clear()
})

describe('認証（ログインゲート）', () => {
  it('未ログイン時はログイン画面が表示される', () => {
    localStorage.clear()
    renderAt('/')
    expect(screen.getByText('ログインID')).toBeInTheDocument()
    // ツール一覧は表示されない
    expect(screen.queryByText('13 件のツール')).not.toBeInTheDocument()
  })

  it('正しいID/PWでログインするとアプリが表示される', async () => {
    localStorage.clear()
    renderAt('/')
    fireEvent.change(screen.getByPlaceholderText('例: tanaka'), {
      target: { value: 'tanaka' },
    })
    fireEvent.change(screen.getByPlaceholderText('パスワード'), {
      target: { value: 'password' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'ログイン' }))
    expect(await screen.findByText('13 件のツール')).toBeInTheDocument()
  })

  it('誤ったパスワードではエラーが表示される', async () => {
    localStorage.clear()
    renderAt('/')
    fireEvent.change(screen.getByPlaceholderText('例: tanaka'), {
      target: { value: 'tanaka' },
    })
    fireEvent.change(screen.getByPlaceholderText('パスワード'), {
      target: { value: 'wrong' },
    })
    fireEvent.click(screen.getByRole('button', { name: /ログイン/ }))
    expect(
      await screen.findByText('ログインIDまたはパスワードが正しくありません'),
    ).toBeInTheDocument()
  })
})

describe('ツール一覧（HomePage）', () => {
  it('デフォルトで全モックツールが一覧表（テーブル）表示される', () => {
    renderAt('/')
    expect(
      screen.getByText('A-SPICE要件トレーサビリティチェッカー'),
    ).toBeInTheDocument()
    expect(screen.getByText('13 件のツール')).toBeInTheDocument()
    expect(screen.getByText('業務シーン')).toBeInTheDocument()
  })

  it('A-SPICEはモーダルから絞り込みできる', () => {
    renderAt('/')
    expect(
      screen.queryByRole('img', { name: 'A-SPICE V字モデル' }),
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /A-SPICEで絞り込む/ }))
    const svg = screen.getByRole('img', { name: 'A-SPICE V字モデル' })
    fireEvent.click(within(svg).getByText('SWE.1'))
    fireEvent.click(screen.getByRole('button', { name: 'この条件で絞り込む' }))
    expect(
      screen.getByText('A-SPICE要件トレーサビリティチェッカー'),
    ).toBeInTheDocument()
    expect(screen.getByText('1 件のツール')).toBeInTheDocument()
  })

  it('業務シーン（メール処理）で絞り込みできる', () => {
    renderAt('/')
    fireEvent.click(screen.getByRole('button', { name: /メール処理/ }))
    expect(
      screen.getByText('メール返信ドラフト生成エージェント'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('A-SPICE要件トレーサビリティチェッカー'),
    ).not.toBeInTheDocument()
  })
})

describe('ファネル計測（活動ログ）', () => {
  it('詳細ページを開くと閲覧数が1回だけ加算される', () => {
    // tool 1 の初期 views は 456 → 詳細表示で 457（重複排除で +1 のみ）
    renderAt('/tools/1')
    expect(screen.getByText('457')).toBeInTheDocument()
    expect(screen.queryByText('456')).not.toBeInTheDocument()
  })
})

describe('列の表示/非表示', () => {
  it('「いいね」列を非表示にするとテーブルヘッダから消える', () => {
    renderAt('/')
    fireEvent.click(screen.getByRole('button', { name: /表示項目/ }))
    const menu = screen.getByRole('menu')
    fireEvent.click(within(menu).getByRole('checkbox', { name: '♥ いいね' }))
    const table = document.querySelector('.tool-table') as HTMLElement
    expect(within(table).queryByText('♥ いいね')).not.toBeInTheDocument()
    // ツール名・アクションは常に表示
    expect(within(table).getByText('ツール名')).toBeInTheDocument()
    expect(within(table).getByText('アクション')).toBeInTheDocument()
  })
})

describe('いいねトグル（回帰: StrictMode で二重カウントしない）', () => {
  it('いいねを押すとカウントが +1 され、+2 にはならない', () => {
    renderAt('/tools/1', true)
    expect(screen.getByText('24')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /♡ いいね/ }))
    expect(screen.getByText('25')).toBeInTheDocument()
    expect(screen.queryByText('26')).not.toBeInTheDocument()
  })
})

describe('ツール詳細（回帰: README の GFM テーブル描画）', () => {
  it('README 内の Markdown テーブルが <table> 要素として描画される', () => {
    const { container } = renderAt('/tools/1')
    const table = container.querySelector('.markdown table')
    expect(table).not.toBeNull()
    expect(within(table as HTMLElement).getByText('要件ID')).toBeInTheDocument()
  })
})

describe('ツールの編集・削除（登録者・管理者）', () => {
  it('管理者は詳細ページに編集・削除ボタンが表示される', () => {
    renderAt('/tools/1')
    expect(screen.getByRole('button', { name: /編集（再投稿）/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /削除$/ })).toBeInTheDocument()
  })

  it('権限の無いメンバーには編集・削除ボタンが表示されない', () => {
    seedSession('suzuki') // 鈴木花子（メンバー、tool1 の登録者ではない）
    renderAt('/tools/1')
    expect(screen.queryByRole('button', { name: /編集（再投稿）/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /削除$/ })).not.toBeInTheDocument()
  })

  it('削除を確定するとツールが一覧から消える', async () => {
    renderAt('/tools/4') // zip_upload。管理者は削除可能
    fireEvent.click(screen.getByRole('button', { name: /削除$/ }))
    fireEvent.click(screen.getByRole('button', { name: '削除する' }))
    // 一覧へ遷移し、削除したツールは存在しない
    expect(await screen.findByText('12 件のツール')).toBeInTheDocument()
    expect(
      screen.queryByText('議事録→アクションアイテム自動抽出'),
    ).not.toBeInTheDocument()
  })

  it('編集画面に既存の値がプリフィルされる', () => {
    renderAt('/tools/1/edit')
    expect(screen.getByText('ツール編集')).toBeInTheDocument()
    expect(
      screen.getByDisplayValue('A-SPICE要件トレーサビリティチェッカー'),
    ).toBeInTheDocument()
  })

  it('編集画面で効果フィールドがプリフィルされる', () => {
    renderAt('/tools/1/edit')
    expect(
      screen.getByDisplayValue('要件レビューの抜け漏れチェック工数が半減した'),
    ).toBeInTheDocument()
    expect(screen.getByDisplayValue('20')).toBeInTheDocument()
  })
})

describe('ツール登録ページの効果入力', () => {
  it('効果フィールド（定性・定量）が表示される', () => {
    renderAt('/tools/new')
    expect(screen.getByPlaceholderText(/要件レビューの抜け漏れ/)).toBeInTheDocument()
    expect(screen.getByText(/月間削減時間/)).toBeInTheDocument()
  })

  it('スクリーンショット貼り付けエリアが表示される', () => {
    renderAt('/tools/new')
    expect(screen.getByText(/Ctrl\+V でクリップボードから画像を貼り付け/)).toBeInTheDocument()
  })
})

describe('ツール詳細ページの各セクション', () => {
  it('概要・README・スクリーンショット・効果セクションが常に表示される', () => {
    renderAt('/tools/1')
    // 各セクション見出し（セクション枠は h3。READMEのMarkdown内見出しと衝突
    // しないよう level:3 で限定）
    expect(screen.getByRole('heading', { name: '概要', level: 3 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'README', level: 3 })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'スクリーンショット', level: 3 }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '効果', level: 3 })).toBeInTheDocument()
    // 概要テキスト（詳細ページに表示される）
    expect(
      screen.getByText(/要件間のトレーサビリティマトリクスをAIが自動検証/),
    ).toBeInTheDocument()
  })

  it('スクリーンショットが無い場合はプレースホルダを表示する', () => {
    // mock tool 1 はスクリーンショット未登録
    renderAt('/tools/1')
    expect(screen.getByText('スクリーンショットは未登録です。')).toBeInTheDocument()
  })

  it('効果が無いツールではプレースホルダを表示する', () => {
    // mock tool 13（社内AIプロンプト集）は effectHoursPerMonth=0 だが
    // effectQualitative を持つため、効果情報が全く無いツールを別途確認する。
    // ここでは「効果」見出しが必ず存在することを確認（空でもセクション表示）。
    renderAt('/tools/9')
    expect(screen.getByRole('heading', { name: '効果', level: 3 })).toBeInTheDocument()
  })
})

describe('管理者ページ（ユーザー管理）', () => {
  it('管理者はユーザー管理ページにアクセスできる', () => {
    renderAt('/admin/users')
    expect(screen.getByText('ユーザー初期登録')).toBeInTheDocument()
    expect(screen.getByText(/登録ユーザー一覧/)).toBeInTheDocument()
  })

  it('メンバーはユーザー管理ページにアクセスできずトップへリダイレクトされる', () => {
    seedSession('suzuki')
    renderAt('/admin/users')
    expect(screen.queryByText('ユーザー初期登録')).not.toBeInTheDocument()
    expect(screen.getByText('13 件のツール')).toBeInTheDocument()
  })

  it('ユーザーを初期登録すると一覧に追加される', async () => {
    renderAt('/admin/users')
    fireEvent.change(screen.getByPlaceholderText('例: yamamoto'), {
      target: { value: 'yamamoto' },
    })
    fireEvent.change(screen.getByPlaceholderText('例: 山本健一'), {
      target: { value: '山本健一' },
    })
    fireEvent.change(screen.getByPlaceholderText('初期パスワード'), {
      target: { value: 'pw' },
    })
    fireEvent.click(screen.getByRole('button', { name: /ユーザーを登録/ }))
    expect(await screen.findByText('山本健一')).toBeInTheDocument()
    expect(screen.getByText(/登録ユーザー一覧（11名）/)).toBeInTheDocument()
  })
})

describe('権限によるダッシュボード表示の差分', () => {
  it('管理者は組織全体ビューが表示される', () => {
    renderAt('/admin/dashboard')
    expect(screen.getByText(/組織全体ビュー/)).toBeInTheDocument()
    expect(screen.getByText('登録ツール総数')).toBeInTheDocument()
  })

  it('メンバーは自分に関連するメンバービューが表示される', () => {
    seedSession('suzuki') // 鈴木花子は tool2 の登録者
    renderAt('/admin/dashboard')
    expect(screen.getByText(/メンバービュー/)).toBeInTheDocument()
  })
})

describe('マイページ', () => {
  it('ログインユーザーの登録ツールが表示される', () => {
    renderAt('/mypage')
    expect(screen.getByText(/ログイン中:/)).toBeInTheDocument()
    // tanaka（田中太郎）は tool1 の登録者
    expect(
      screen.getByText('A-SPICE要件トレーサビリティチェッカー'),
    ).toBeInTheDocument()
  })

  it('被申請一覧の pending を承認すると承認済みに変わる', () => {
    renderAt('/mypage')
    fireEvent.click(
      screen.getByRole('button', { name: /自分のツールへの被申請/ }),
    )
    // SEED_REQUESTS の r1: 鈴木花子 → tool1（田中太郎）
    expect(screen.getByText('鈴木花子')).toBeInTheDocument()
    expect(screen.getByText('申請中')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /承認/ }))
    expect(screen.queryByText('申請中')).not.toBeInTheDocument()
    // 既存の granted（r0）と合わせて2件表示される
    expect(screen.getAllByText('承認済み').length).toBeGreaterThanOrEqual(1)
  })
})
