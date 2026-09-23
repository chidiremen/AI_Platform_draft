# 通知（Power Automate 連携）

プラットフォーム内で起きたことを Power Automate へ HTTP で投げ、
**Teams チャネル投稿**と**Outlook メール**に振り分けるための仕組みです。
Power Automate 側のフローはお任せするので、こちら側は
「決まった形の JSON を1本の URL に POST する」ところまでを担います。

## 設計の前提

- **Teams の個人チャット/メンションは使えません**（このテナントで確認済み）。
  そのため「特定の個人に確実に届ける」手段はメールだけです。
  ペイロードに宛先メールアドレス（`recipients.to`）を入れてあるのはこのためです。
- **Teams Incoming Webhook（従来のコネクタ）は使いません。** Microsoft が
  廃止していく方針のため、Power Automate 経由に寄せています。
  旧経路（`TEAMS_WEBHOOK_URL`）は残していますが、Power Automate を設定すると
  二重通知を避けて自動的に止まります。
- **1本の URL に全イベントを投げます。** イベントごとに URL を分けると
  フローが増えて管理しきれなくなり、「チャネル投稿＋メール」のロジックを
  毎回コピーすることになるためです。振り分けはフロー側の Switch で行います。

## 全体の流れ

```
 Django                          Power Automate                   届き先
 ───────                         ──────────────                  ────────
 ツール登録   ─┐
 申請         ─┤                ┌─ HTTP 要求の受信時
 コメント     ─┼─ POST(JSON) ──▶│  （URL を1本発行）
 テーマ/進捗  ─┤                │
 凍結         ─┤                ├─ Switch (event)
 Q&A          ─┘                │    ├─ Teams: チャネルに投稿  ──▶ チャネル
                                │    └─ 条件: recipients.to が空でない
                                │         └─ Outlook: メール送信 ──▶ 個人
```

## 1. Power Automate 側で URL を発行する

1. 新しいフローを「**インスタント クラウド フロー**」で作成
2. トリガーに「**要求 / HTTP 要求の受信時**」を選ぶ
3. 「要求本文の JSON スキーマ」に、下の**スキーマ**（後述）を貼る
4. 一度保存すると **HTTP POST の URL** が発行されるので、それをコピー

## 2. Django 側に設定する

ルートの `.env` に貼ります。

```
POWER_AUTOMATE_WEBHOOK_URL=https://prod-XX.japaneast.logic.azure.com:443/workflows/...
FRONTEND_BASE_URL=http://社内ホスト名:5174
NOTIFY_DEFAULT_EMAILS=ai-suishin@example.co.jp
NOTIFY_SHARED_TOKEN=好きな文字列
```

| 設定 | 意味 |
| --- | --- |
| `POWER_AUTOMATE_WEBHOOK_URL` | 発行された URL。**SAS 署名入りなので認証情報として扱う** |
| `FRONTEND_BASE_URL` | 通知に載せるリンクのベース。未設定だと localhost になるので実配布時は必須 |
| `NOTIFY_EVENTS` | 送るイベントを絞る（空＝全部）。例: `tool.created,theme.frozen` |
| `NOTIFY_DEFAULT_EMAILS` | 宛先が特定できないイベント（ツール登録の周知など）の既定宛先 |
| `NOTIFY_SHARED_TOKEN` | `X-AITC-Token` ヘッダで送る合言葉。フロー側で照合して想定外の送信元を弾く |
| `NOTIFY_TIMEOUT_SECONDS` | 送信タイムアウト（既定8秒） |

## 3. 疎通を確認する

フローを組む前に、ペイロードの形だけ見られます。

```
:: 送れるイベントの一覧と現在の設定
python manage.py send_test_event

:: 送らずにペイロードだけ表示（スキーマ作成用）
python manage.py send_test_event tool.created --dry-run

:: 実際に送る
python manage.py send_test_event tool.created

:: 宛先を指定して送る（メール分岐の確認用）
python manage.py send_test_event access_request.created --to you@example.co.jp
```

送信結果は Django 管理画面の「**Webhook送信ログ**」に残ります
（`/admin/notifications/webhookdelivery/`）。通知が届かないときは
まずここを見れば、送っていないのか・送って失敗したのかが分かります。

## ペイロードの形

どのイベントでも共通です。**`title` / `summary` / `url` の3つだけ使えば、
1つの分岐で全イベントの通知を組めます。** 細かく出し分けたいものだけ
`data` を見てください。

```json
{
  "source": "ai-tool-catalog",
  "event": "tool.created",
  "event_id": "bfb8ada8-c3f7-432b-a242-c2fb239528e5",
  "occurred_at": "2026-09-23T17:00:17+00:00",
  "title": "🆕 新しいツールが登録されました",
  "summary": "田中 太郎 さんが「議事録要約くん」を登録しました",
  "url": "http://localhost:5174/tools/0000...",
  "actor":      { "username": "tanaka", "name": "田中 太郎", "email": "tanaka@example.co.jp" },
  "recipients": { "to": ["author@example.co.jp"], "cc": [] },
  "data":       { "...": "イベントごとに異なる" }
}
```

| フィールド | 用途 |
| --- | --- |
| `event` | フロー側の Switch の分岐キー |
| `title` | Teams 投稿の見出し / メール件名にそのまま使える |
| `summary` | 本文にそのまま使える1〜数行 |
| `url` | 該当ページへの直リンク |
| `actor` | 操作した人 |
| `recipients.to` | **メールを送るべき宛先。空なら個人宛は不要（チャネルだけでよい）** |
| `data` | イベント固有の詳細。凝った表示をしたいときだけ参照 |

### JSON スキーマ

`data` はイベントごとに形が変わるので、**`data` だけは型を緩く**しておいて
ください。Power Automate の「サンプルペイロードからスキーマを生成」を
そのまま使うと `data` の中身まで固定され、他のイベントで解析エラーになります。

```json
{
  "type": "object",
  "properties": {
    "source":   { "type": "string" },
    "event":    { "type": "string" },
    "event_id": { "type": "string" },
    "occurred_at": { "type": "string" },
    "title":    { "type": "string" },
    "summary":  { "type": "string" },
    "url":      { "type": "string" },
    "actor": {
      "type": "object",
      "properties": {
        "username": { "type": "string" },
        "name":     { "type": "string" },
        "email":    { "type": "string" }
      }
    },
    "recipients": {
      "type": "object",
      "properties": {
        "to": { "type": "array", "items": { "type": "string" } },
        "cc": { "type": "array", "items": { "type": "string" } }
      }
    },
    "data": { "type": "object" }
  }
}
```

## イベント一覧

| イベント | いつ | `recipients.to` |
| --- | --- | --- |
| `tool.created` | ツールが新規登録された | 既定宛先 |
| `tool.updated` | ツールが更新された | 既定宛先 |
| `access_request.created` | アクセス権が申請された | **ツールの登録者** |
| `access_request.resolved` | 申請が承認/却下された | **申請者** |
| `comment.created` | ツールにコメントが付いた | **ツールの登録者**（自作自演時は空） |
| `theme.created` | テーマが登録された | 既定宛先 |
| `theme.progress` | テーマに進捗が記録された | 既定宛先 |
| `theme.frozen` | テーマが凍結された（理由つき） | 既定宛先 |
| `theme.stalled` | 停滞テーマのまとめ（定期実行） | 既定宛先 |
| `idea.created` | アイデアが投稿された | 既定宛先 |
| `question.created` | Q&Aに質問が投稿された | 既定宛先 |
| `answer.created` | 質問に回答が付いた | **質問者** |

`python manage.py send_test_event` でも同じ一覧が見られます。

### おすすめの絞り方

全部流すとチャネルが埋まります。最初は次くらいから始めて、
様子を見て足すのがおすすめです。

```
NOTIFY_EVENTS=tool.created,access_request.created,access_request.resolved,theme.created,theme.frozen,answer.created
```

## フローの組み方（推奨形）

```
[HTTP 要求の受信時]
      │
      ├─[条件] headers['X-AITC-Token'] が一致するか   ← 任意だが推奨
      │
      ├─[Teams] チャットまたはチャネルでメッセージを投稿する
      │     投稿者: フロー ボット / 投稿先: チャネル
      │     メッセージ: <b>@{triggerBody()?['title']}</b><br>
      │                 @{triggerBody()?['summary']}<br>
      │                 <a href="@{triggerBody()?['url']}">開く</a>
      │
      └─[条件] length(triggerBody()?['recipients']?['to']) > 0
            └─[Outlook] メールの送信 (V2)
                  宛先: join(triggerBody()?['recipients']?['to'], ';')
                  件名: @{triggerBody()?['title']}
                  本文: @{triggerBody()?['summary']} / @{triggerBody()?['url']}
```

イベントごとに文面を変えたい場合だけ、Teams 投稿の前に
`triggerBody()?['event']` で Switch を挟んでください。

## 停滞テーマの定期通知

「停滞」は保存された状態ではなく最終進捗からの経過日数で決まる派生値なので、
誰かが画面を開かない限り誰も気づきません。週1回まとめて通知します。

```
python manage.py notify_stalled_themes           # 送る
python manage.py notify_stalled_themes --dry-run # 対象だけ表示
python manage.py notify_stalled_themes --days 14 # しきい値を変えて確認
```

Windows のタスクスケジューラには同梱の `scripts\notify_stalled.bat` を
登録してください（週次・月曜9時など）。設定方法は
[`windows-task-scheduler.md`](windows-task-scheduler.md) と同じ要領です。

**1件ずつではなく必ず1通にまとめて**送ります。チャネルが埋まるためです。

## 動作上の保証

- **通知の失敗で本来の処理は失敗しません。** Webhook 先が死んでいても
  ツール登録・申請・コメントはすべて成功します（テストで担保）。
- **画面の応答を待たせません。** 送信は別スレッドで行います。
  テスト時のみ `NOTIFY_SYNC=true` で同期送信になります。
- **再送はしません。** 失敗は送信ログに残るだけです。確実性が必要な通知が
  出てきたら、その時点でキュー/再送を検討してください。

## 新しい通知を足すには

1. `backend/notifications/events.py` の `Event` と `EVENT_CATALOG` に追加
2. `backend/notifications/hooks.py` に関数を1つ追加（`@_safe` を付ける）
3. 発火させたい view から呼ぶ

ペイロードの組み立てを view に散らさないため、**必ず hooks.py を経由**させて
ください。
