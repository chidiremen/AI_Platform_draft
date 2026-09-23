# Windows での起動手順（タスクスケジューラ登録）

`start.bat` ひとつでバックエンド（Django）とフロントエンド（Vite）の両方が
立ち上がります。ポートはプロジェクトルートの `.env` から自動で読まれるので、
バッチファイルを書き換える必要はありません。

## ファイル構成

| ファイル | 役割 |
| --- | --- |
| `setup.bat` | 初回セットアップ（`.env` 作成 / venv 作成 / 依存インストール / マイグレーション）。手で1回だけ実行 |
| `start.bat` | 起動。タスクスケジューラに登録するのはこれ |
| `stop.bat` | 停止。ポートを LISTEN しているプロセスを落とす |
| `doctor.bat` | セットアップ診断（読み取り専用）。ログインできない等の切り分けに使う |
| `scripts\notify_stalled.bat` | 停滞テーマの週次通知（タスクスケジューラに週1で登録） |
| `scripts\load_env.bat` | `.env` から `FRONTEND_PORT` / `BACKEND_PORT` を読む共通処理 |
| `scripts\run_backend.bat` | Django を実際に起動する子スクリプト（`start.bat` から呼ばれる） |
| `scripts\run_frontend.bat` | Vite を実際に起動する子スクリプト（同上） |

ログは `logs\` に出ます。

- `logs\start.log` … 起動/停止の履歴（どこで失敗したかはまずここを見る）
- `logs\backend.log` … Django の標準出力・エラー
- `logs\frontend.log` … Vite の標準出力・エラー

`logs\` は `.gitignore` 済みです。

## 1. 初回セットアップ

前提として **Python 3.11 以上** と **Node.js 20 以上** がインストール済みで、
`python` と `npm` が PATH に通っていること。

エクスプローラで `setup.bat` をダブルクリックするか、コマンドプロンプトで:

```
cd C:\work\AI_platform_draft
setup.bat
```

これで以下が実行されます。

1. `.env` が無ければ `.env.example` からコピー
2. `backend\.venv` を作成
3. `requirements.txt` をインストール
4. `manage.py migrate`
5. `frontend` で `npm ci`（失敗したら `npm install`）

管理者ユーザーがまだ無ければ作ってください。

```
backend\.venv\Scripts\python.exe backend\manage.py createsuperuser
```

### `.env` の確認

本番（実API）モードで使う場合は `.env` を開いて次を確認します。

```
FRONTEND_PORT=5174
BACKEND_PORT=8009
VITE_USE_MOCK=false
```

`VITE_USE_MOCK=true` のままだとフロントがモックデータで動き、Django に
つながりません。`.env.example` の既定は `true`（バックエンド無しでも動く安全側）
なので、実運用では **`false` に変えてください**。

## 2. 手動起動の確認

タスクスケジューラに登録する前に、必ず一度手で動くことを確認します。

```
start.bat
```

- `AITC-backend` / `AITC-frontend` という最小化ウィンドウが2つ開きます
- コンソールに `[ OK ] backend listening ...` / `[ OK ] frontend listening ...`
  と出れば成功
- `[DONE] app: http://localhost:5174/` の URL をブラウザで開く

ブラウザも一緒に開きたい場合は `start.bat open` と引数を付けます。

停止は `stop.bat`。

## 3. タスクスケジューラに登録

「タスク スケジューラ」→「タスクの作成」（「基本タスクの作成」ではなく
**「タスクの作成」** を使う。作業ディレクトリを指定できるため）。

### 全般タブ

- 名前: `AI Tool Catalog`
- **「ユーザーがログオンしているときのみ実行する」を選ぶ**
  - 「ログオンしているかどうかにかかわらず実行する」にすると、セッション0で
    動くため Node.js やユーザー PATH が引き継がれず、`npm not found` で
    失敗しがちです。
- 「最上位の特権で実行する」は不要（1024番以上のポートなので管理者権限は不要）

### トリガータブ

- 新規 → タスクの開始: **「ログオン時」**
- 「遅延時間を指定する」に 1分 程度を入れておくと、ネットワークやディスクの
  準備が済んでから起動できて安定します。

### 操作タブ

- 操作: 「プログラムの開始」
- プログラム/スクリプト: `C:\work\AI_platform_draft\start.bat`
- 引数: （空欄。ブラウザも開きたければ `open`）
- **開始 (オプション)**: `C:\work\AI_platform_draft`
  - `start.bat` は自身の場所から相対でパスを解決するので空欄でも動きますが、
    入れておくのが無難です。

### 条件タブ

- 「コンピューターをAC電源で使用している場合のみタスクを開始する」の
  チェックを**外す**（ノートPCで起動しない事故を防ぐ）

### 設定タブ

- 「タスクが失敗した場合の再起動の間隔」: 1分 / 再試行回数 3回 くらい
- 「タスクを停止するまでの時間」: **チェックを外す**
  - 既定の3日で勝手に止められてしまうため

## 4. 運用中の環境を別フォルダに複製する（A/B 構成）

すでに運用中の A を触らずに、B に新しいバージョンを立てて同じデータで
動作確認したい場合の手順。

### 手順

```bat
:: 1) B のフォルダを用意して、新しいソースを展開する
::    （A のフォルダは触らない）

:: 2) B でセットアップ
cd C:\work\B
setup.bat

:: 3) .env を編集する（ここが最重要。下の「必ず確認すること」参照）

:: 4) A の DB とアップロード済みファイルをコピー
::    ※ backend\ の直下です。フォルダ直下ではありません
copy    C:\work\A\backend\db.sqlite3  C:\work\B\backend\db.sqlite3
xcopy /E /I /Y C:\work\A\backend\media  C:\work\B\backend\media

:: 5) スキーマを B のコードに合わせる（A が古いバージョンなら必須）
backend\.venv\Scripts\python.exe backend\manage.py migrate

:: 6) 診断してから起動
doctor.bat
start.bat
```

### 必ず確認すること

| 項目 | 内容 |
| --- | --- |
| **`VITE_USE_MOCK=false`** | `true` だとフロントは**ソースに埋め込まれたデモユーザー**と照合するだけで、DB を一切見ません。コピーした DB のユーザーではログインできず、データも空に見えます。**A/B 構成でいちばん引っかかる罠** |
| **DB の置き場所** | `B\backend\db.sqlite3` です。フォルダ直下（`B\db.sqlite3`）に置くと Django は**空の DB を新規作成**します。結果ユーザー0件でログイン不可 |
| **`manage.py migrate`** | A が古いバージョンなら、A の DB には B のコードが期待するカラムがありません。`no such column` でログインが 500 になります |
| **ポートを A と変える** | `FRONTEND_PORT` / `BACKEND_PORT` を A と別にしてください。同じだと B のサーバーがポートを掴めず起動に失敗します。ポートを分けると localStorage も別オリジンになるので、A のログイン状態が混ざりません |
| **`media\` もコピー** | DB にはファイル名しか入っていません。`backend\media\` を持ってこないと zip やスクショが 404 になります |
| コピーのタイミング | A が書き込み中だと不整合になり得ます。`db.sqlite3-wal` / `-shm` / `-journal` があれば一緒にコピーしてください |

### パスワードについて

**`SECRET_KEY` が A と違っても、パスワードはそのまま使えます。**
Django のパスワードは PBKDF2 + 個別ソルトで DB 内に完結しており、
`SECRET_KEY` に依存しません。`SECRET_KEY` が影響するのはセッション
Cookie と CSRF トークンだけなので、「一度ログアウト状態になる」だけです。

つまり **ログインできない原因は上の表のどれか**で、パスワードの持ち回りは
疑わなくて大丈夫です。

### 切り分けコマンド

```bat
doctor.bat
```

読み取り専用で、次を一度に報告します。

- `.env` の場所・文字コード・`VITE_USE_MOCK`・ポート
- DB の期待パスと実在有無・サイズ・未適用マイグレーション
- ユーザー数とログインIDの一覧（有効/無効・superuser 付き）
- `media/` の実ファイル数と DB 参照数の整合

問題があった行には `★` が付き、最後に「要確認」としてまとめて出ます。

## 5. 文字コードについて（バッチが転けがちな箇所）

Windows でバッチ化すると UTF-8 / Shift-JIS で事故りやすいので、
本リポジトリでは次のように対策済みです。**基本的に意識不要**ですが、
症状が出たときの手掛かりとして残しておきます。

| 箇所 | 対策 |
| --- | --- |
| `.bat` ファイル自身 | **中身を完全に ASCII のみ**で記述（日本語メッセージを入れない）。`chcp` も不要。コンソールのコードページが 932 でも 65001 でも同じ挙動になる |
| `.bat` の改行コード | `.gitattributes` で `*.bat text eol=crlf` を指定。LF のままだと `cmd.exe` がラベルやブロックの解釈に失敗することがある |
| `.bat` からの `.env` 読み取り | 日本語コメント行は `#` 始まりなので、コードページ解釈の前にスキップされる。UTF-8 / Shift-JIS / BOM付き / CRLF いずれでもポートを読める |
| Python からの `.env` 読み取り | `backend/config/envfile.py` が UTF-8 → UTF-16 → cp932 → latin-1 の順に試す。以前は Shift-JIS 保存の `.env` で `manage.py` 自体が起動しなくなっていた |
| `backend.log` への出力 | `run_backend.bat` で `PYTHONUTF8=1` / `PYTHONIOENCODING=utf-8` を設定。これが無いと、標準出力をファイルにリダイレクトした際に Python が cp932 で書こうとし、**絵文字を含むログやトレースバックで `UnicodeEncodeError` を起こしてサーバープロセスごと落ちる**（本アプリはツール名・フォーラム投稿・UI に絵文字が多い） |
| `frontend.log` への出力 | Node.js は常に UTF-8 出力なので対策不要 |

### `.env` の保存形式

**UTF-8 で保存してください。** BOM の有無、改行が CRLF / LF かは問いません。
Shift-JIS（メモ帳の「ANSI」）でも動きますが、日本語コメントが文字化けします。

唯一の例外が **UTF-16（メモ帳の「Unicode」）** で、これは `cmd.exe` が読めません。
その場合はポートが既定値（5174 / 8009）に戻り、`start.bat` が次の警告を出します。

```
[WARN] .env exists but the ports were not read from it - using defaults.
       Save .env as UTF-8, not UTF-16/Unicode.
```

起動ログの `source=` を見れば、どこから読まれたか常に分かります。

- `source=env` … `.env` から読めた
- `source=none` … `.env` が無いので既定値
- `source=partial` … `.env` はあるが読めなかった（上の警告が出る）

### ログの見方

`logsackend.log` と `logsrontend.log` は **UTF-8** です。
メモ帳でも VS Code でも正しく開けますが、文字化けする場合は
エンコーディングを UTF-8 に指定して開き直してください。

## 6. よくあるトラブル

| ログの内容 | 原因と対処 |
| --- | --- |
| `[ERROR] npm not found on PATH` | Node.js 未インストール、または「ログオンしているかどうかにかかわらず実行する」になっている。全般タブを見直す |
| `[WARN] venv missing at ...` | `setup.bat` をまだ実行していない |
| `[FAIL] frontend did not come up ...` | `logs\frontend.log` を見る。`npm install` 未実行が大半 |
| `[SKIP] backend already listening ...` | すでに起動済み。二重起動は自動で避けられるので放置してよい |
| ブラウザは開くが API が 404 / 接続拒否 | `.env` の `VITE_USE_MOCK` が `true` のまま、または `BACKEND_PORT` の不一致 |
| ログインできない / データが空 | `VITE_USE_MOCK` が `true`。`doctor.bat` で確認 |
| ユーザーが0件と出る | `db.sqlite3` の置き場所違い。`backend\` 直下に置く |
| ログインすると 500 になる | `manage.py migrate` 未実行。A の DB が古いスキーマのまま |
| `ports: ... source=partial` と出る | `.env` が UTF-16 保存。UTF-8 で保存し直す |
| `.env` のポートを変えたのに反映されない | 同上。起動ログの `source=` を確認 |
| `backend.log` が途中で切れてサーバーが落ちる | `PYTHONUTF8` が効いていない。`scripts\run_backend.bat` を最新に差し替える |

## 7. 補足

- `start.bat` は起動済みポートを検出して**二重起動しません**。ログオンのたびに
  実行されても安全です。
- Django は `--noreload` で起動しています。自動リロードはプロセスを2つ
  フォークするため、`stop.bat` がきれいに止められなくなるためです。
  開発中にホットリロードが欲しいときは、バッチではなく手で
  `python manage.py runserver` を実行してください。
- これは Django の開発用サーバー（`runserver`）です。社内の少人数利用を
  想定した構成で、本格的な運用が必要になったら waitress + IIS などへの
  移行を検討してください。
