# AI_WeeklyNews 連携手順書

AI ツールカタログ（本プラットフォーム）と、別リポジトリの **AI_WeeklyNews**
（RSS からニュースを収集して日本語ダイジェストを生成するツール）をつなぐ手順。

最終更新: 2026-08-27

---

## 1. 連携方式（現在の構成）

**ファイル連携**でスモールスタートしている。AI_WeeklyNews が出力した
`articles.jsonl` を、カタログ側の管理コマンドが読み込んで DB に取り込む。

```
┌─────────────────────┐        ┌──────────────────────────────┐
│ AI_WeeklyNews       │        │ AIツールカタログ             │
│ (タスクスケジューラ)│        │ (Django + React)             │
│                     │        │                              │
│  python -m ainews   │        │  manage.py import_news       │
│         │           │        │         │                    │
│         ▼           │        │         ▼                    │
│  output/data/       │──読む─▶│  NewsArticle テーブル        │
│    articles.jsonl   │        │         │                    │
└─────────────────────┘        │         ▼                    │
                               │  トップのバナー / /news      │
                               │  → 掲示板でディスカッション  │
                               └──────────────────────────────┘
```

**両者は疎結合**。カタログ側は jsonl を読むだけで、AI_WeeklyNews のコードには
一切依存しない。AI_WeeklyNews 側の変更も不要。

> 将来 API push 方式（AI_WeeklyNews から HTTP POST）に移したくなった場合は
> 「7. 将来: API push への移行」を参照。

---

## 2. セットアップ

### 2-1. 取り込み元のパスを決める

取り込み元は次の優先順で決まる。

| 優先 | 指定方法 | 例 |
|------|----------|-----|
| 1 | `--path` 引数 | `manage.py import_news --path D:\ai\output\data\articles.jsonl` |
| 2 | 環境変数 `NEWS_JSONL_PATH` | `.env` に記載 |
| 3 | 既定ディレクトリ | `backend/data/incoming/` |

**パスにはファイルとディレクトリのどちらも指定できる。**
ディレクトリを指定した場合は配下の `*.jsonl` を全て読む。

### 2-2. 構成パターン

**パターンA: 同じPCで動かす（推奨・最も簡単）**

AI_WeeklyNews の出力先を直接指させる。ファイルのコピーが不要。

プロジェクトルートの `.env` に追記:

```env
NEWS_JSONL_PATH=D:\projects\AI_WeeklyNews\output\data\articles.jsonl
```

**パターンB: 別PC / 共有フォルダ経由**

AI_WeeklyNews 側で生成した jsonl を、共有フォルダやカタログ側の
`backend/data/incoming/` にコピーしてから取り込む。

```env
NEWS_JSONL_PATH=\\fileserver\share\ainews\
```

ディレクトリ指定なので、日付別ファイル（`2026-08-27.jsonl` など）を
置いていく運用にもできる。

### 2-3. 動作確認

```bash
cd backend

# まず書き込まずに確認（何件入るか）
python manage.py import_news --dry-run

# 実行
python manage.py import_news
```

出力例:

```
取り込み元: D:\projects\AI_WeeklyNews\output\data\articles.jsonl
  - articles.jsonl

新規 42 件 / 更新 0 件 / スキップ 0 件
DB 内のニュース記事: 42 件
```

---

## 3. 定期実行の設定（Windows タスクスケジューラ）

AI_WeeklyNews の収集が終わった **あと** に取り込みが走るようにする。

### 方法1: バッチファイルにまとめる（推奨）

`run_news_sync.bat` を作る:

```bat
@echo off
REM ── 1. ニュース収集（AI_WeeklyNews 側） ──
cd /d D:\projects\AI_WeeklyNews
call run_daily.bat

REM ── 2. カタログへ取り込み ──
cd /d D:\projects\AI_Platform_draft\backend
call venv\Scripts\activate
python manage.py import_news >> ..\logs\import_news.log 2>&1
```

タスクスケジューラにこの 1 本を登録すれば、収集 → 取り込みが順に走る。

### 方法2: 別タスクとして時間をずらす

| タスク | 時刻 | 内容 |
|--------|------|------|
| AI_WeeklyNews 収集 | 07:00 | `run_daily.bat` |
| カタログ取り込み | 07:30 | `python manage.py import_news` |

収集が長引くと取りこぼす可能性があるため、方法1の方が確実。

> **取り込みは冪等**（同じファイルを何度流し込んでも件数は増えない）なので、
> 多重実行や再実行を恐れなくてよい。

---

## 4. データの受け渡し仕様

### 4-1. 期待するスキーマ

AI_WeeklyNews の `output/data/articles.jsonl`（1行1JSON / UTF-8）:

```json
{"collected_at":"2026-08-27T07:00:12+09:00","published":"2026-08-26T18:30:00+00:00","source":"OpenAI Blog","category":"モデル","title":"Introducing a faster model","title_ja":"高速なモデルを発表","summary":"要約テキスト","link":"https://example.com/a"}
```

| フィールド | 必須 | 用途 |
|-----------|------|------|
| `link` | **必須** | 記事URL。**主キー扱い**（重複排除のキー） |
| `title` | 推奨 | 原題 |
| `title_ja` | 任意 | 日本語タイトル。無ければ `title` を表示に使う |
| `summary` | 任意 | 要約 |
| `source` | 任意 | 配信元。フィルタに使う |
| `category` | 任意 | カテゴリ。フィルタに使う |
| `published` | 任意 | 公開日時（ISO8601）。並び順に使う |
| `collected_at` | 任意 | 収集日時。`published` が無いとき並び順に使う |

### 4-2. スキーマの揺れに対する耐性

連携先の小さな変更で取り込みが止まらないよう、以下のようにしてある。

- **`link` の代替キーを許容**: `link` が無ければ `url` → `id` の順で探す
- **欠けたフィールドは既定値で続行**（必須は `link` のみ）
- **未知のフィールドは失わない**: 行全体を `NewsArticle.raw`（JSONField）に保存
- **壊れた行はその行だけスキップ**して処理を継続し、末尾に件数を報告
- **日付は寛容にパース**: ISO8601 のほか `2026-08-27` のような日付だけの形式も可。
  タイムゾーンが無ければ UTC とみなす

つまり **AI_WeeklyNews 側がフィールドを増やしても、カタログ側の改修は不要**。
増えた項目を画面に出したくなったときだけ手を入れればよい。

### 4-3. 冪等性

`link` をキーにした upsert（`update_or_create`）。

- 同じ URL の記事が再度現れたら **更新**（要約が良くなった場合などを反映）
- 件数は増えない
- AI_WeeklyNews 側の「追記専用・URL がプライマリキー」という規約に合わせている

---

## 5. コマンドリファレンス

```bash
python manage.py import_news                      # 既定パスから取り込み
python manage.py import_news --path <file|dir>    # パス指定
python manage.py import_news --dry-run            # 書き込まず件数だけ確認
python manage.py import_news --limit 50           # 先頭N件だけ
python manage.py import_news --since 2026-08-01   # 公開日で絞る
```

---

## 6. カタログ側での見え方

| 画面 | 内容 |
|------|------|
| トップページ上部 | ニュースバナー。**大（カード3件）/ 小（ティッカー5件）/ 畳む** を切替でき、選択はブラウザごとに保存される。0件なら何も表示しない |
| `/news` | 一覧。検索（タイトル・要約・ソース）、カテゴリ / ソース / 期間で絞り込み |
| `/news/:id` | 個別記事。要約と元記事リンク |
| ヘッダー | 📰 ニュース |

### ディスカッション連携

各記事の「💬 このニュースについてディスカッションする」から掲示板へ飛ぶ。

- **記事1件につきスレッド1本**（`NewsArticle.discussion_thread` で 1 対 1）
- 初回クリックでスレッドを作成し、1レス目に記事タイトル・要約・元記事リンクを自動で入れる
- 2人目以降は**同じスレッドに合流**する（ボタン文言も「議論を見る」に変わる）
- 議論が始まっている記事にはレス数（💬 3）が表示される
- スレッドは掲示板の匿名ルールに従う（名無し表記・投稿ID）

### 管理者向け

不適切・重複した記事は個別に非表示にできる（`🙈 非表示`）。
記事自体は消さず、一般ユーザーから見えなくなるだけ。

---

## 7. 将来: API push への移行

別PCで動かす、リアルタイム性を上げたい、といった理由でファイル連携をやめる場合。

**必要な作業:**

1. カタログ側に取り込みエンドポイントを追加
   （`POST /api/news/import/`、管理者トークン必須、body は jsonl と同じ形の配列）
2. AI_WeeklyNews 側の実行後処理で、生成した jsonl を POST する

**移行しやすくしてある点:**

- 取り込みロジック（`link` での upsert、スキーマ揺れの吸収、日付パース）は
  `import_news.py` の関数に分かれているので、エンドポイントから再利用できる
- データ形式が同じなので、**フロントエンドと DB スキーマの変更は不要**

現時点では**ファイル連携で十分**なので、必要になるまで実装しない
（AI_WeeklyNews 側の「依存追加は最小限に」という方針とも整合する）。

---

## 8. トラブルシューティング

**「取り込み元が見つかりません」と出る**
パスを確認する。Windows のパスはバックスラッシュのままでよいが、
`.env` に書くときは引用符で囲まない。

```env
NEWS_JSONL_PATH=D:\projects\AI_WeeklyNews\output\data\articles.jsonl
```

**取り込んだのに画面に出ない**
- ブラウザをリロードする（ニュースはログイン時に取得する）
- 管理者が非表示にしていないか `/news` で確認する（管理者には薄く表示される）
- `python manage.py import_news --dry-run` で件数を確認する

**「不正行 N 件」と出る**
その行が JSON として壊れているか `link` が無い。処理自体は続行しており、
残りの行は取り込めている。頻発する場合は AI_WeeklyNews 側の出力を確認する。

**記事が重複して見える**
`link` が異なると別記事として扱われる（URL のクエリ違いなど）。
AI_WeeklyNews 側の重複排除で吸収するのが本筋。

---

## 9. 設計上の約束（変更前に確認）

1. **本文は転載しない。** 保持するのは要約と元記事リンクのみ。
   AI_WeeklyNews 側の「著作権上、組織外への再配布はしない」方針に合わせている
2. **`link` が主キー。** 取り込みは upsert で、既存行の削除はしない
3. **AI_WeeklyNews のコードには依存しない。** jsonl というデータ境界だけで接続する
4. **スキーマ揺れで壊れないこと。** 必須は `link` のみ。未知フィールドは `raw` に退避
5. **ニュース0件でも画面が壊れないこと。** バナーは何も表示せず、一覧は案内文を出す
