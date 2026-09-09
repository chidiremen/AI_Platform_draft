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

## 4. よくあるトラブル

| ログの内容 | 原因と対処 |
| --- | --- |
| `[ERROR] npm not found on PATH` | Node.js 未インストール、または「ログオンしているかどうかにかかわらず実行する」になっている。全般タブを見直す |
| `[WARN] venv missing at ...` | `setup.bat` をまだ実行していない |
| `[FAIL] frontend did not come up ...` | `logs\frontend.log` を見る。`npm install` 未実行が大半 |
| `[SKIP] backend already listening ...` | すでに起動済み。二重起動は自動で避けられるので放置してよい |
| ブラウザは開くが API が 404 / 接続拒否 | `.env` の `VITE_USE_MOCK` が `true` のまま、または `BACKEND_PORT` の不一致 |

## 5. 補足

- `start.bat` は起動済みポートを検出して**二重起動しません**。ログオンのたびに
  実行されても安全です。
- Django は `--noreload` で起動しています。自動リロードはプロセスを2つ
  フォークするため、`stop.bat` がきれいに止められなくなるためです。
  開発中にホットリロードが欲しいときは、バッチではなく手で
  `python manage.py runserver` を実行してください。
- これは Django の開発用サーバー（`runserver`）です。社内の少人数利用を
  想定した構成で、本格的な運用が必要になったら waitress + IIS などへの
  移行を検討してください。
