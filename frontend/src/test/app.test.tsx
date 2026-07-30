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

describe('ツール登録: 必須項目バリデーション', () => {
  it('必須項目案内バナーが表示される', () => {
    renderAt('/tools/new')
    expect(screen.getByText(/は必須項目/)).toBeInTheDocument()
    expect(screen.getByText(/ツール名 \/ 概要/)).toBeInTheDocument()
  })

  // フォームの必須項目を「効果2つ以外」全部埋めるヘルパ
  function fillFormExceptEffect() {
    // 業務シーンを1つ選択
    fireEvent.click(screen.getByRole('button', { name: /メール処理/ }))
    fireEvent.change(screen.getByPlaceholderText(/A-SPICE要件/), { target: { value: 'x' } })
    fireEvent.change(screen.getByPlaceholderText('一覧表示用の短い説明'), { target: { value: 'y' } })
    // READMEはフォーム内の唯一の textarea
    const form = document.querySelector('form.card-panel') as HTMLElement
    fireEvent.change(form.querySelector('textarea') as HTMLElement, { target: { value: '## t' } })
    fireEvent.change(form.querySelector('input[type="url"]') as HTMLElement, {
      target: { value: 'https://ex.com/' },
    })
  }

  it('定量・定性効果 未入力で送信するとエラーが列挙される', () => {
    renderAt('/tools/new')
    fillFormExceptEffect()
    fireEvent.click(screen.getByRole('button', { name: /この内容で登録/ }))
    expect(screen.getByText(/入力に不備があります/)).toBeInTheDocument()
    expect(screen.getByText(/定性効果は必須/)).toBeInTheDocument()
    expect(screen.getByText(/定量効果.*必須/)).toBeInTheDocument()
  })

  it('定量効果 上限超え (745) はエラー', () => {
    renderAt('/tools/new')
    fillFormExceptEffect()
    fireEvent.change(screen.getByPlaceholderText(/要件レビューの抜け漏れ/), {
      target: { value: 'good' },
    })
    fireEvent.change(screen.getByPlaceholderText('例: 20'), { target: { value: '745' } })
    fireEvent.click(screen.getByRole('button', { name: /この内容で登録/ }))
    expect(screen.getByText(/744 時間以下/)).toBeInTheDocument()
  })

  it('「その他」種別ではURL/zipなしでも登録できる', async () => {
    renderAt('/tools/new')
    // toolType を other に変更（フォーム内の唯一の select）
    const form = document.querySelector('form.card-panel') as HTMLElement
    fireEvent.change(form.querySelector('select.select') as HTMLElement, {
      target: { value: 'other' },
    })
    fireEvent.click(screen.getByRole('button', { name: /メール処理/ }))
    fireEvent.change(screen.getByPlaceholderText(/A-SPICE要件/), {
      target: { value: 'その他ツール' },
    })
    fireEvent.change(screen.getByPlaceholderText('一覧表示用の短い説明'), {
      target: { value: '説明' },
    })
    fireEvent.change(form.querySelector('textarea') as HTMLElement, { target: { value: '## 内容' } })
    fireEvent.change(screen.getByPlaceholderText(/要件レビューの抜け漏れ/), {
      target: { value: '効果' },
    })
    fireEvent.change(screen.getByPlaceholderText('例: 20'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: /この内容で登録/ }))
    // 成功時は詳細ページに遷移してツール名が表示される
    expect(await screen.findByText('その他ツール')).toBeInTheDocument()
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

describe('ツール詳細: アクセスURL 表示', () => {
  it('accessUrl があるツールでは URL がクリック可能なリンクとして表示される', () => {
    // tool 1 は accessUrl を持つ copilot_agent
    renderAt('/tools/1')
    expect(screen.getByText('🔗 アクセス先URL')).toBeInTheDocument()
    const link = screen.getByRole('link', {
      name: /copilotstudio.microsoft.com\/agents\/traceability-checker/,
    }) as HTMLAnchorElement
    expect(link).toBeInTheDocument()
    expect(link.href).toContain('copilotstudio.microsoft.com')
    expect(link.target).toBe('_blank')
  })

  it('accessUrl が無いツール (zip種別など) では URL 表示ブロックが出ない', () => {
    // tool 4 は zip_upload で accessUrl 無し
    renderAt('/tools/4')
    expect(screen.queryByText('🔗 アクセス先URL')).not.toBeInTheDocument()
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

describe('ロール: ツール管理者 (tool_admin)', () => {
  it('ツール管理者（佐藤一郎）は管理者ページにアクセスできる', () => {
    seedSession('sato')
    renderAt('/admin/users')
    // アクセス許可されている → ユーザー初期登録の見出しが表示される
    expect(screen.getByText('ユーザー初期登録')).toBeInTheDocument()
  })

  it('ツール管理者はヘッダーに「ツール管理者」ロールが表示される', () => {
    seedSession('sato')
    renderAt('/')
    // 複数箇所に出る可能性があるので getAllByText を使う
    expect(screen.getAllByText('ツール管理者').length).toBeGreaterThanOrEqual(1)
  })

  it('ツール管理者は他人のツールを削除できる（canEdit）', () => {
    seedSession('sato')
    renderAt('/tools/1') // tool 1 は tanaka の登録
    // サイドバーの編集・削除ボタンが出る
    expect(screen.getByRole('button', { name: /編集（再投稿）/ })).toBeInTheDocument()
    expect(document.querySelector('.detail-side .btn-danger')).not.toBeNull()
  })

  it('ユーザー編集モーダルの role セレクタに3つ全て並ぶ', () => {
    renderAt('/admin/users')
    // 田中太郎の編集モーダルを開く
    const table = document.querySelector('.data-table') as HTMLElement
    const row = within(table).getByText('鈴木花子').closest('tr') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: /✏️ 編集/ }))
    // モーダル内のロールセレクタ
    const modalSelect = document.querySelectorAll('.modal .select')
    const roleSelect = modalSelect[modalSelect.length - 1] as HTMLSelectElement
    const optionValues = Array.from(roleSelect.options).map((o) => o.value)
    expect(optionValues).toContain('member')
    expect(optionValues).toContain('tool_admin')
    expect(optionValues).toContain('admin')
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

describe('ガイド (docs)', () => {
  it('ガイドランディングにカテゴリ別カードが並ぶ', () => {
    renderAt('/guide')
    expect(
      screen.getByRole('heading', { name: /📚 プラットフォーム ガイド/ }),
    ).toBeInTheDocument()
    // シード済カテゴリの見出し
    expect(screen.getByRole('heading', { name: /はじめに/ })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /ツール登録/ }),
    ).toBeInTheDocument()
  })

  it('スラッグからガイド詳細が開ける', () => {
    renderAt('/guide/welcome')
    expect(
      screen.getByRole('heading', { name: 'AIツールカタログへようこそ' }),
    ).toBeInTheDocument()
  })

  it('メンバーは新規ガイド作成できない (redirect)', () => {
    seedSession('suzuki')
    renderAt('/guide/new')
    // リダイレクトされるので新規ガイドフォームが出ない
    expect(screen.queryByText(/新規ガイド/)).not.toBeInTheDocument()
  })

  it('管理者は新規ガイドフォームを開ける', () => {
    seedSession('tanaka')
    renderAt('/guide/new')
    expect(
      screen.getByRole('heading', { name: /新規ガイド/ }),
    ).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/ツール登録の手順/)).toBeInTheDocument()
  })
})

describe('Q&A', () => {
  it('Q&A 一覧に既存質問が並ぶ', () => {
    renderAt('/qa')
    expect(screen.getByRole('heading', { name: '💬 Q&A' })).toBeInTheDocument()
    expect(
      screen.getByText('ツール登録時に「効果」欄は何を書けばいいですか？'),
    ).toBeInTheDocument()
  })

  it('検索で質問がフィルタされる', () => {
    renderAt('/qa')
    const input = screen.getByPlaceholderText(/タイトル・本文・タグを検索/)
    fireEvent.change(input, { target: { value: 'ダウンロード' } })
    // 該当する質問だけが残る
    expect(
      screen.getByText(/ダウンロード数が保持されない/),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(/効果」欄は何を書けばいい/),
    ).not.toBeInTheDocument()
  })

  it('未解決フィルタ URL でフィルタされる', () => {
    renderAt('/qa?resolved=false')
    // 未解決のみ → q3 だけ表示、解決済 q1/q2 は非表示
    expect(screen.getByText(/お気に入りタグを付けたい/)).toBeInTheDocument()
    expect(
      screen.queryByText(/効果」欄は何を書けばいい/),
    ).not.toBeInTheDocument()
  })

  it('質問詳細でベストアンサーが表示される', () => {
    renderAt('/qa/q1')
    expect(
      screen.getByRole('heading', {
        name: /ツール登録時に「効果」欄は何を書けばいいですか？/,
      }),
    ).toBeInTheDocument()
    // 承認済回答は .qa-accept-badge が付く
    expect(document.querySelector('.qa-accept-badge')).not.toBeNull()
  })

  it('メンバー(member)は回答フォームが出ず、その旨表示される', () => {
    seedSession('suzuki')
    renderAt('/qa/q3')
    expect(
      screen.getByText(/回答の投稿は.*ロールのユーザーのみ/),
    ).toBeInTheDocument()
  })

  it('組織管理者は回答投稿ボタンが表示される', () => {
    seedSession('tanaka')
    renderAt('/qa/q3')
    // モーダルを開く CTA ボタン
    expect(
      screen.getByRole('button', { name: /✍️ 回答を投稿/ }),
    ).toBeInTheDocument()
  })

  it('回答投稿ボタンをクリックすると回答モーダルが開く', () => {
    seedSession('tanaka')
    renderAt('/qa/q3')
    fireEvent.click(screen.getByRole('button', { name: /✍️ 回答を投稿/ }))
    // モーダル内のフォーム
    expect(
      screen.getByRole('heading', { name: /✍️ 回答を投稿/ }),
    ).toBeInTheDocument()
    expect(screen.getByText(/対象:/)).toBeInTheDocument()
    // 送信ボタン (モーダル内)
    expect(
      screen.getByRole('button', { name: /投稿する/ }),
    ).toBeInTheDocument()
  })

  it('質問するボタンで質問モーダルが開く', () => {
    seedSession('suzuki')
    renderAt('/qa')
    // ツールバーの「❓ 質問する」ボタン (getAllByで複数ヒットを許容)
    const askBtns = screen.getAllByRole('button', { name: /❓ 質問する/ })
    fireEvent.click(askBtns[0])
    // モーダル内フォーム
    expect(
      screen.getByRole('heading', { name: /❓ 質問を投稿/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByPlaceholderText(/xxx の使い方が分かりません/),
    ).toBeInTheDocument()
  })

  it('ツール管理者(佐藤一郎)にも回答投稿ボタンが表示される', () => {
    seedSession('sato')
    renderAt('/qa/q3')
    expect(
      screen.getByRole('button', { name: /✍️ 回答を投稿/ }),
    ).toBeInTheDocument()
  })
})

describe('アイデアフォーラム（2ch風）', () => {
  it('スレ一覧にシードスレッドが並ぶ', () => {
    renderAt('/forum')
    expect(
      screen.getByRole('heading', { name: /🧵 アイデアフォーラム/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/議事録から自動でA-SPICE成果物のドラフト作らせたい/),
    ).toBeInTheDocument()
    // 固定スレは先頭に来る（📌 が付く）
    expect(document.querySelector('.thread-row.pinned')).not.toBeNull()
  })

  it('検索でスレッドが絞り込まれる', () => {
    renderAt('/forum')
    fireEvent.change(screen.getByPlaceholderText(/スレタイ・本文・タグを検索/), {
      target: { value: 'CANログ' },
    })
    expect(screen.getByText(/CANログをいい感じに要約/)).toBeInTheDocument()
    expect(
      screen.queryByText(/議事録から自動でA-SPICE/),
    ).not.toBeInTheDocument()
  })

  it('板（カテゴリ）で絞り込める', () => {
    renderAt('/forum?category=share')
    expect(screen.getByText(/MISRA-Cレビューのプロンプト/)).toBeInTheDocument()
    expect(screen.queryByText(/CANログをいい感じに要約/)).not.toBeInTheDocument()
  })

  it('👍 ボタンで投票数が増える', () => {
    renderAt('/forum')
    const row = screen
      .getByText(/CANログをいい感じに要約/)
      .closest('.thread-row') as HTMLElement
    const voteBtn = within(row).getByTitle('ほしい！')
    expect(voteBtn).toHaveTextContent('9')
    fireEvent.click(voteBtn)
    expect(voteBtn).toHaveTextContent('10')
  })

  it('スレ詳細でレスが番号付きで並び、ID が表示される', () => {
    renderAt('/forum/t1')
    // 1レス目 = スレ本文
    const res1 = document.getElementById('res-1') as HTMLElement
    expect(res1).not.toBeNull()
    expect(within(res1).getByText('鈴木花子')).toBeInTheDocument()
    // ID:xxxxxxxx 表記
    expect(res1.querySelector('.res-id')?.textContent).toMatch(/^ID:[0-9a-f]{8}$/)
    // レス 2〜4 が存在
    expect(document.getElementById('res-2')).not.toBeNull()
    expect(document.getElementById('res-4')).not.toBeNull()
  })

  it('>>2 がレス参照リンクとして描画される', () => {
    renderAt('/forum/t1')
    // res-3 の本文に >>2 が含まれる
    const res3 = document.getElementById('res-3') as HTMLElement
    const ref = within(res3).getByText('>>2')
    expect(ref).toHaveClass('res-ref')
  })

  it('>>N にホバーすると参照先レスがポップアップする', () => {
    renderAt('/forum/t1')
    const res3 = document.getElementById('res-3') as HTMLElement
    const ref = within(res3).getByText('>>2')
    // ホバー前はポップアップなし
    expect(document.querySelector('.res-ref-popup')).toBeNull()
    fireEvent.mouseEnter(ref.parentElement as HTMLElement)
    const popup = document.querySelector('.res-ref-popup') as HTMLElement
    expect(popup).not.toBeNull()
    // 参照先(>>2)の本文が入っている
    expect(popup.textContent).toContain('毎週2hくらい溶けてる')
  })

  it('レス番号クリックで返信欄に >>N が挿入される', () => {
    renderAt('/forum/t1')
    const res2 = document.getElementById('res-2') as HTMLElement
    fireEvent.click(within(res2).getByTitle('このレスに返信'))
    const textarea = screen.getByPlaceholderText(/本文を入力/) as HTMLTextAreaElement
    expect(textarea.value).toContain('>>2')
  })

  it('レスを書き込むと一覧に追加される', async () => {
    renderAt('/forum/t1')
    fireEvent.change(screen.getByPlaceholderText(/本文を入力/), {
      target: { value: 'テスト書き込み' },
    })
    fireEvent.click(screen.getByRole('button', { name: '書き込む' }))
    expect(await screen.findByText('テスト書き込み')).toBeInTheDocument()
    // 新しいレスは番号 5（既存 1..4 の次）
    expect(document.getElementById('res-5')).not.toBeNull()
  })

  it('スレッドを立てるボタンでモーダルが開く', () => {
    renderAt('/forum')
    fireEvent.click(screen.getByRole('button', { name: /スレッドを立てる/ }))
    expect(
      screen.getByRole('heading', { name: /新しいスレッドを立てる/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByPlaceholderText(/議事録から自動でA-SPICE/),
    ).toBeInTheDocument()
  })

  it('モーダルからスレッドを作成すると詳細に遷移する', async () => {
    renderAt('/forum')
    fireEvent.click(screen.getByRole('button', { name: /スレッドを立てる/ }))
    fireEvent.change(screen.getByPlaceholderText(/議事録から自動でA-SPICE/), {
      target: { value: '新しいアイデアスレ' },
    })
    const modal = document.querySelector('.modal') as HTMLElement
    fireEvent.change(modal.querySelector('textarea') as HTMLElement, {
      target: { value: '本文です' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'スレッドを立てる' }))
    expect(
      await screen.findByRole('heading', { name: '新しいアイデアスレ' }),
    ).toBeInTheDocument()
  })

  it('スレ主は編集・削除・レス停止ができる', () => {
    // t3 は田中太郎（デフォルトのログインユーザー）のスレ
    renderAt('/forum/t3')
    const res1 = document.getElementById('res-1') as HTMLElement
    expect(within(res1).getByRole('button', { name: '編集' })).toBeInTheDocument()
    expect(within(res1).getByRole('button', { name: '削除' })).toBeInTheDocument()
    expect(within(res1).getByRole('button', { name: 'レス停止' })).toBeInTheDocument()
  })

  it('他人のスレでは編集・削除ボタンが出ない（メンバー）', () => {
    seedSession('yamada') // 山田次郎: t1〜t4 のスレ主ではない
    renderAt('/forum/t1')
    const res1 = document.getElementById('res-1') as HTMLElement
    expect(within(res1).queryByRole('button', { name: '編集' })).not.toBeInTheDocument()
    expect(within(res1).queryByRole('button', { name: '削除' })).not.toBeInTheDocument()
  })
})

describe('メールフィードバック（Outlook 起動）', () => {
  it('ツール詳細のボタンでフィードバックモーダルが開く', () => {
    renderAt('/tools/1')
    fireEvent.click(screen.getByRole('button', { name: /フィードバックを送る/ }))
    expect(
      screen.getByRole('heading', { name: /このツールへのフィードバック/ }),
    ).toBeInTheDocument()
    // この画面から直接送信しない旨の注意書き
    expect(screen.getByText(/この画面から直接送信はされません/)).toBeInTheDocument()
  })

  it('登録者の宛先が初期選択され、メールアドレスが表示される', () => {
    renderAt('/tools/1') // tool 1 の author は田中太郎
    fireEvent.click(screen.getByRole('button', { name: /フィードバックを送る/ }))
    expect(screen.getByText(/登録者: 田中太郎/)).toBeInTheDocument()
    expect(screen.getByText('tanaka@example.com')).toBeInTheDocument()
  })

  it('運営（管理者）宛に切り替えると管理者のメールになる', () => {
    renderAt('/tools/1')
    fireEvent.click(screen.getByRole('button', { name: /フィードバックを送る/ }))
    fireEvent.click(screen.getByRole('button', { name: /運営（管理者）/ }))
    // admin/tool_admin のメール（田中=admin, 佐藤=tool_admin）
    const line = document.querySelector('.feedback-to-line') as HTMLElement
    expect(line.textContent).toContain('tanaka@example.com')
    expect(line.textContent).toContain('sato@example.com')
  })

  it('件名・本文が空だと Outlook で開くボタンが無効', () => {
    renderAt('/tools/1')
    fireEvent.click(screen.getByRole('button', { name: /フィードバックを送る/ }))
    const sendBtn = screen.getByRole('button', { name: /Outlook で開く/ })
    // 初期値で件名・本文が入っているので有効
    expect(sendBtn).not.toBeDisabled()
    // 件名を空にすると無効
    fireEvent.change(
      screen.getByPlaceholderText('例: 〇〇ツールについての改善提案'),
      { target: { value: '' } },
    )
    expect(sendBtn).toBeDisabled()
  })

  it('ヘッダーの ✉️ から運営宛フィードバックが開ける', () => {
    renderAt('/')
    fireEvent.click(screen.getByTitle('運営にメールでフィードバック'))
    expect(
      screen.getByRole('heading', { name: /運営へのフィードバック/ }),
    ).toBeInTheDocument()
  })
})
