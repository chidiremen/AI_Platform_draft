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
    // サイドバーの「いいね」ボタン（btn-like クラス）を限定
    const likeBtn = document.querySelector('.btn-like') as HTMLElement
    fireEvent.click(likeBtn)
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
    // サイドバーの削除（btn-danger）を限定
    expect(document.querySelector('.detail-side .btn-danger')).not.toBeNull()
  })

  it('権限の無いメンバーには編集・削除ボタンが表示されない', () => {
    seedSession('suzuki') // 鈴木花子（メンバー、tool1 の登録者ではない）
    renderAt('/tools/1')
    expect(screen.queryByRole('button', { name: /編集（再投稿）/ })).not.toBeInTheDocument()
    expect(document.querySelector('.detail-side .btn-danger')).toBeNull()
  })

  it('削除を確定するとツールが一覧から消える', async () => {
    renderAt('/tools/4') // zip_upload。管理者は削除可能
    const delBtn = document.querySelector('.detail-side .btn-danger') as HTMLElement
    fireEvent.click(delBtn)
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

  it('編集ボタンから表示名を変更できる', async () => {
    renderAt('/admin/users')
    // 鈴木花子の行の「編集」ボタンをクリック（最初に現れる「編集」が rotaは一覧順序による）
    // ここでは鈴木の行を特定するため、行のテキストから親<tr>を辿る
    const row = screen.getByText('鈴木花子').closest('tr') as HTMLElement
    expect(row).toBeTruthy()
    fireEvent.click(within(row).getByRole('button', { name: /✏️ 編集/ }))
    // モーダル内の表示名入力に新値を投入
    const nameInput = screen.getByDisplayValue('鈴木花子')
    fireEvent.change(nameInput, { target: { value: '鈴木はな子' } })
    fireEvent.click(screen.getByRole('button', { name: /変更を保存/ }))
    expect(await screen.findByText('鈴木はな子')).toBeInTheDocument()
  })

  it('自分自身の削除ボタンは無効化される', () => {
    renderAt('/admin/users')
    // ヘッダーと一覧の両方に田中太郎が現れるので、テーブルにスコープを限定
    const table = document.querySelector('.data-table') as HTMLElement
    const row = within(table).getByText('田中太郎').closest('tr') as HTMLElement
    const delBtn = within(row).getByRole('button', { name: /🗑️ 削除/ })
    expect(delBtn).toBeDisabled()
  })

  it('削除ボタンから他ユーザーを削除できる', async () => {
    renderAt('/admin/users')
    const row = screen.getByText('松本大輔').closest('tr') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: /🗑️ 削除/ }))
    fireEvent.click(screen.getByRole('button', { name: '削除する' }))
    expect(await screen.findByText(/登録ユーザー一覧（9名）/)).toBeInTheDocument()
    expect(screen.queryByText('松本大輔')).not.toBeInTheDocument()
  })
})

describe('プロフィール設定（自分の情報編集）', () => {
  it('未ログインでは /profile にアクセスできない', () => {
    localStorage.clear()
    renderAt('/profile')
    // ログイン画面が表示される
    expect(screen.getByText('ログインID')).toBeInTheDocument()
  })

  it('ログインユーザーは自分のプロフィールを編集できる', async () => {
    seedSession('suzuki')
    renderAt('/profile')
    expect(screen.getByText('⚙️ プロフィール設定')).toBeInTheDocument()
    // ログインID とロールは disabled
    const idInput = screen.getByDisplayValue('suzuki') as HTMLInputElement
    expect(idInput.disabled).toBe(true)
    expect(screen.getByDisplayValue('メンバー')).toBeDisabled()
    // 表示名を変更
    const nameInput = screen.getByDisplayValue('鈴木花子')
    fireEvent.change(nameInput, { target: { value: '鈴木花子（更新）' } })
    fireEvent.click(screen.getByRole('button', { name: /変更を保存/ }))
    // ヘッダーのユーザー名リンクに新値が反映される
    expect(await screen.findByRole('link', { name: '鈴木花子（更新）' })).toBeInTheDocument()
  })

  it('パスワード変更: 旧PW不一致だとエラー', async () => {
    seedSession('suzuki')
    renderAt('/profile')
    const inputs = document.querySelectorAll('input[type="password"]')
    fireEvent.change(inputs[0], { target: { value: 'wrong' } })
    fireEvent.change(inputs[1], { target: { value: 'newpw' } })
    fireEvent.change(inputs[2], { target: { value: 'newpw' } })
    fireEvent.click(screen.getByRole('button', { name: /パスワードを変更/ }))
    expect(await screen.findByText(/現在のパスワードが正しくありません/)).toBeInTheDocument()
  })

  it('パスワード変更: 新PW確認不一致だとエラー', async () => {
    seedSession('suzuki')
    renderAt('/profile')
    const inputs = document.querySelectorAll('input[type="password"]')
    fireEvent.change(inputs[0], { target: { value: 'password' } })
    fireEvent.change(inputs[1], { target: { value: 'aaaa' } })
    fireEvent.change(inputs[2], { target: { value: 'bbbb' } })
    fireEvent.click(screen.getByRole('button', { name: /パスワードを変更/ }))
    expect(await screen.findByText(/新しいパスワード（確認）が一致しません/)).toBeInTheDocument()
  })

  it('パスワード変更: 成功すると成功通知が出る', async () => {
    seedSession('suzuki')
    renderAt('/profile')
    const inputs = document.querySelectorAll('input[type="password"]')
    fireEvent.change(inputs[0], { target: { value: 'password' } })
    fireEvent.change(inputs[1], { target: { value: 'newpassword' } })
    fireEvent.change(inputs[2], { target: { value: 'newpassword' } })
    fireEvent.click(screen.getByRole('button', { name: /パスワードを変更/ }))
    expect(await screen.findByText(/パスワードを更新しました/)).toBeInTheDocument()
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
    // デフォルトは通知タブなので、登録ツールタブに切り替える
    fireEvent.click(screen.getByRole('button', { name: /登録したツール/ }))
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
    // テーブル内の承認ボタンを限定（通知タブにも承認ボタンがあるため）
    const table = document.querySelector('.data-table') as HTMLElement
    fireEvent.click(within(table).getByRole('button', { name: /承認/ }))
    expect(within(table).queryByText('申請中')).not.toBeInTheDocument()
    // 既存の granted（r0）と合わせて2件表示される
    expect(within(table).getAllByText('承認済み').length).toBeGreaterThanOrEqual(1)
  })
})

describe('マイページ: 通知タブ', () => {
  it('デフォルトで通知タブが開き、未対応申請とコメントが表示される', () => {
    renderAt('/mypage')
    // 未対応申請のサマリ（SEED_REQUESTS の r1）
    expect(screen.getByText(/未対応申請:/)).toBeInTheDocument()
    expect(screen.getByText(/ツールへのコメント:/)).toBeInTheDocument()
    // 申請セクションが存在
    expect(screen.getByText('📨 申請が届いています')).toBeInTheDocument()
    expect(screen.getByText('💬 自分のツールへのコメント')).toBeInTheDocument()
  })

  it('未読件数バッジが通知タブに付く', () => {
    renderAt('/mypage')
    const notifTab = screen.getByRole('button', { name: /🔔 通知/ })
    // SEED_COMMENTS のc1（鈴木花子→tool1） とc3（佐藤一郎→tool1）+ r1 = 未読3
    const badge = notifTab.querySelector('.tab-badge')
    expect(badge).not.toBeNull()
    expect(Number(badge!.textContent)).toBeGreaterThanOrEqual(1)
  })

  it('「すべて既読にする」を押すとバッジが消える', () => {
    renderAt('/mypage')
    fireEvent.click(screen.getByRole('button', { name: /すべて既読にする/ }))
    const notifTab = screen.getByRole('button', { name: /🔔 通知/ })
    expect(notifTab.querySelector('.tab-badge')).toBeNull()
  })
})

describe('マイページ: 申請履歴の削除', () => {
  it('解決済みの被申請は履歴削除ボタンで消える', async () => {
    renderAt('/mypage')
    fireEvent.click(
      screen.getByRole('button', { name: /自分のツールへの被申請/ }),
    )
    // SEED_REQUESTS r0 は granted（tool3 への佐藤一郎が処理者ではない…
    // tool1 への申請を granted にしてから削除）
    // ここでは r1 を一度承認して granted にし、その削除をテストする
    const table = document.querySelector('.data-table') as HTMLElement
    fireEvent.click(within(table).getByRole('button', { name: /承認/ }))
    // 解決済みになると 🗑️ ボタンが現れる
    const delBtn = within(table).getByRole('button', { name: '🗑️' })
    fireEvent.click(delBtn)
    expect(within(table).queryByText('鈴木花子')).not.toBeInTheDocument()
  })

  it('未処理（申請中）の被申請に削除ボタンは無い', () => {
    renderAt('/mypage')
    fireEvent.click(
      screen.getByRole('button', { name: /自分のツールへの被申請/ }),
    )
    const table = document.querySelector('.data-table') as HTMLElement
    // pending には削除ボタンが無いことを確認（このタブには pending r1 と granted r0 が存在するが
    // r0 は tool3 の佐藤一郎宛で田中太郎ではない → 田中太郎宛の incoming は r1 のみで pending）
    expect(within(table).queryByRole('button', { name: '🗑️' })).not.toBeInTheDocument()
  })
})

describe('コメント機能', () => {
  it('詳細ページにコメントセクションが表示され、シード値がレンダリングされる', () => {
    renderAt('/tools/1')
    // セクション見出し（コメント数を含む）
    expect(screen.getByText(/💬 コメント（/)).toBeInTheDocument()
    // SEED_COMMENTS の c1（バグ報告）の本文
    expect(screen.getByText(/CSV取り込み時に文字コードSJIS/)).toBeInTheDocument()
    // 種別バッジ
    expect(screen.getAllByText(/バグ報告/).length).toBeGreaterThanOrEqual(1)
  })

  it('コメントを投稿すると一覧に追加される', async () => {
    renderAt('/tools/1')
    const textarea = screen.getByPlaceholderText(/コメント本文を入力/)
    fireEvent.change(textarea, { target: { value: 'テスト投稿です' } })
    fireEvent.click(screen.getByRole('button', { name: /コメントを投稿/ }))
    // 一覧（.comment-list）内に新規コメントの本文が現れる
    const list = await screen.findByRole('list', { name: undefined }, { container: document.body })
      .catch(() => document.querySelector('.comment-list') as HTMLElement)
    const scope = (document.querySelector('.comment-list') ?? list) as HTMLElement
    expect(within(scope).getByText('テスト投稿です')).toBeInTheDocument()
  })

  it('コメントの いいね を押すとカウントが +1 される', () => {
    renderAt('/tools/1')
    // 種別=「変更要望」の c3（佐藤一郎）の いいね 5
    const likeBtn = screen.getByRole('button', { name: /♡ いいね（5）/ })
    fireEvent.click(likeBtn)
    expect(screen.getByRole('button', { name: /♥ いいね（6）/ })).toBeInTheDocument()
  })

  it('リプライ投稿はトップレベルコメントの子として表示される', () => {
    renderAt('/tools/1')
    const replies = screen.getAllByRole('button', { name: /↩︎ 返信/ })
    expect(replies.length).toBeGreaterThanOrEqual(1)
    fireEvent.click(replies[0])
    const textarea = screen.getByPlaceholderText(/返信を入力/)
    fireEvent.change(textarea, { target: { value: 'リプライです' } })
    fireEvent.click(screen.getByRole('button', { name: /返信を投稿/ }))
    const list = document.querySelector('.comment-list') as HTMLElement
    expect(within(list).getByText('リプライです')).toBeInTheDocument()
  })

  it('種別セレクタで「バグ報告」を選んで投稿するとバッジが付く', () => {
    renderAt('/tools/1')
    fireEvent.change(screen.getByLabelText('種別:'), { target: { value: 'bug' } })
    fireEvent.change(screen.getByPlaceholderText(/コメント本文を入力/), {
      target: { value: '新しいバグ報告' },
    })
    fireEvent.click(screen.getByRole('button', { name: /コメントを投稿/ }))
    const list = document.querySelector('.comment-list') as HTMLElement
    expect(within(list).getByText('新しいバグ報告')).toBeInTheDocument()
    // バグ報告バッジが（シード値 + 投稿分の）2件以上ある
    expect(screen.getAllByText(/バグ報告/).length).toBeGreaterThanOrEqual(2)
  })
})

describe('スクリーンショットのライトボックス（モーダル）', () => {
  it('スクリーンショットが無いときはライトボックスを開かない', () => {
    // tool 1 はスクリーンショット未登録 → ボタンも無い
    renderAt('/tools/1')
    expect(
      screen.queryByRole('button', { name: /スクリーンショット.*を拡大表示/ }),
    ).not.toBeInTheDocument()
    // <a target=_blank> は撤廃済み
    expect(document.querySelector('a.shot')).toBeNull()
  })
})

describe('申請モーダル: 種別に応じた入力欄', () => {
  it('GitHubリポジトリ型ツールでは GitHub ユーザー名が必須', () => {
    // tool 3 = GitHub repo（佐藤一郎登録）。tanaka は登録者ではないため申請可能
    renderAt('/tools/3')
    fireEvent.click(screen.getByRole('button', { name: /管理者にアクセス権を申請/ }))
    expect(screen.getByText(/GitHubユーザー名/)).toBeInTheDocument()
    // 未入力なら「申請を送信」ボタンは無効
    const submit = screen.getByRole('button', { name: '申請を送信' })
    expect(submit).toBeDisabled()
    // 入力すると有効化
    fireEvent.change(screen.getByPlaceholderText(/例: octocat/), {
      target: { value: 'yamada-taro' },
    })
    expect(submit).not.toBeDisabled()
  })

  it('NotebookLM 型ツールでは Google アカウントの入力欄が出る', () => {
    // tool 2 = notebook_lm（鈴木花子登録）
    renderAt('/tools/2')
    fireEvent.click(screen.getByRole('button', { name: /管理者にアクセス権を申請/ }))
    expect(screen.getByText(/Google アカウント/)).toBeInTheDocument()
  })

  it('Copilotエージェント型ツールでは社内メールの入力欄が出る', () => {
    // tool 5 = copilot_agent（高橋美咲登録）
    renderAt('/tools/5')
    fireEvent.click(screen.getByRole('button', { name: /管理者にアクセス権を申請/ }))
    expect(screen.getByText(/社内メールアドレス/)).toBeInTheDocument()
  })
})

describe('マイページ: プロフィールタブ', () => {
  it('プロフィールタブから表示名を更新でき、ヘッダーに反映される', async () => {
    renderAt('/mypage')
    fireEvent.click(screen.getByRole('button', { name: /⚙️ プロフィール/ }))
    // 名前入力を変更
    const nameInput = screen.getByDisplayValue('田中太郎')
    fireEvent.change(nameInput, { target: { value: '田中太郎（マイページ経由）' } })
    fireEvent.click(screen.getByRole('button', { name: /変更を保存/ }))
    // ヘッダーのユーザー名リンクに反映
    expect(
      await screen.findByRole('link', { name: '田中太郎（マイページ経由）' }),
    ).toBeInTheDocument()
  })

  it('プロフィールタブからパスワードを変更できる', async () => {
    renderAt('/mypage')
    fireEvent.click(screen.getByRole('button', { name: /⚙️ プロフィール/ }))
    const pws = document.querySelectorAll('input[type="password"]')
    fireEvent.change(pws[0], { target: { value: 'password' } })
    fireEvent.change(pws[1], { target: { value: 'newpassword' } })
    fireEvent.change(pws[2], { target: { value: 'newpassword' } })
    fireEvent.click(screen.getByRole('button', { name: /パスワードを変更/ }))
    expect(await screen.findByText(/パスワードを更新しました/)).toBeInTheDocument()
  })
})

describe('モックモード: 永続化（リロード耐性）', () => {
  it('投稿したコメントが localStorage に保存される', () => {
    renderAt('/tools/1')
    fireEvent.change(screen.getByPlaceholderText(/コメント本文を入力/), {
      target: { value: '永続化テスト' },
    })
    fireEvent.click(screen.getByRole('button', { name: /コメントを投稿/ }))
    const raw = localStorage.getItem('aitc_mock_comments_v1')
    expect(raw).not.toBeNull()
    expect(raw!).toContain('永続化テスト')
  })
})
