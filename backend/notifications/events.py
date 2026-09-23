"""Power Automate に投げる汎用イベント。

## なぜこの形か

Power Automate の「HTTP 要求の受信時」トリガーは、URL を1本発行して
JSON を受け取る。そこで **1本の URL に全イベントを投げ、フロー側の
Switch で振り分ける** 形にしている。イベントごとに URL を分けると
フローが増えて管理が破綻するし、Teams チャネル投稿と Outlook メールの
両方に流すロジックを毎回コピーすることになるため。

ペイロードは「フロー側が中身を解釈しなくても最低限の通知が組める」
ことを優先した自己記述型にしてある。``title`` / ``summary`` / ``url`` だけ
使えば、どのイベントでも1つの分岐で通知を組める。細かく出し分けたい
ものだけ ``data`` を見ればよい。

## recipients について

このテナントでは Teams の個人チャットに送れない（管理者確認済み）。
つまり「特定の個人に届ける」手段はメールだけになる。そのため
ペイロードに宛先メールアドレスを入れてある。

    recipients.to  … その人に直接届けるべき相手（例: ツールの登録者）
    recipients.cc  … 補助的な宛先

Teams チャネルへの投稿は全イベント共通で行い、``recipients.to`` が
空でなければ追加で Outlook メールを送る、という組み方を想定している。

## 送信の失敗は握り潰す

通知が落ちたせいでツール登録が失敗するのは本末転倒なので、送信は
別スレッドでベストエフォートに行い、結果は WebhookDelivery に残す。
"""
import json
import logging
import threading
import time
import urllib.error
import urllib.request
import uuid

from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)


# --------------------------------------------------------------------------- #
# イベント定義
# --------------------------------------------------------------------------- #
class Event:
    """発火しうるイベント名。Power Automate の Switch はこの値で分岐する。"""

    TOOL_CREATED = "tool.created"
    TOOL_UPDATED = "tool.updated"
    ACCESS_REQUEST_CREATED = "access_request.created"
    ACCESS_REQUEST_RESOLVED = "access_request.resolved"
    COMMENT_CREATED = "comment.created"
    THEME_CREATED = "theme.created"
    THEME_PROGRESS = "theme.progress"
    THEME_FROZEN = "theme.frozen"
    THEME_STALLED = "theme.stalled"
    IDEA_CREATED = "idea.created"
    QUESTION_CREATED = "question.created"
    ANSWER_CREATED = "answer.created"


#: イベント名 → 説明。ドキュメント生成とテスト送信コマンドで使う。
EVENT_CATALOG: dict[str, str] = {
    Event.TOOL_CREATED: "ツールが新規登録された",
    Event.TOOL_UPDATED: "ツールが更新された",
    Event.ACCESS_REQUEST_CREATED: "アクセス権が申請された",
    Event.ACCESS_REQUEST_RESOLVED: "アクセス権申請が承認/却下された",
    Event.COMMENT_CREATED: "ツールにコメントが付いた",
    Event.THEME_CREATED: "テーマが登録された",
    Event.THEME_PROGRESS: "テーマに進捗が記録された",
    Event.THEME_FROZEN: "テーマが凍結された",
    Event.THEME_STALLED: "テーマが停滞している（定期実行で検出）",
    Event.IDEA_CREATED: "アイデアが投稿された",
    Event.QUESTION_CREATED: "Q&Aに質問が投稿された",
    Event.ANSWER_CREATED: "Q&Aの質問に回答が付いた",
}


# --------------------------------------------------------------------------- #
# 設定の読み出し
# --------------------------------------------------------------------------- #
def webhook_url() -> str:
    return (getattr(settings, "POWER_AUTOMATE_WEBHOOK_URL", "") or "").strip()


def is_configured() -> bool:
    return bool(webhook_url())


def enabled_events() -> set[str] | None:
    """送信対象のイベント。未設定（空）なら全イベントを送る。"""
    raw = (getattr(settings, "NOTIFY_EVENTS", "") or "").strip()
    if not raw:
        return None
    return {e.strip() for e in raw.split(",") if e.strip()}


def is_enabled(event: str) -> bool:
    allowed = enabled_events()
    return allowed is None or event in allowed


def frontend_base_url() -> str:
    """通知に載せるリンクのベース URL。

    社内配布時は localhost ではないため、``FRONTEND_BASE_URL`` で明示できる
    ようにしてある。未設定なら FRONTEND_PORT から組み立てる。
    """
    explicit = (getattr(settings, "FRONTEND_BASE_URL", "") or "").strip()
    if explicit:
        return explicit.rstrip("/")
    import os

    port = os.environ.get("FRONTEND_PORT", "5174")
    return f"http://localhost:{port}"


def link(path: str) -> str:
    return f"{frontend_base_url()}/{path.lstrip('/')}"


def admin_emails() -> list[str]:
    """イベント固有の宛先が無いときに使う既定の宛先。"""
    raw = (getattr(settings, "NOTIFY_DEFAULT_EMAILS", "") or "").strip()
    return [e.strip() for e in raw.split(",") if e.strip()]


# --------------------------------------------------------------------------- #
# ペイロード
# --------------------------------------------------------------------------- #
def user_ref(user) -> dict:
    """ユーザーを通知用の最小表現にする。"""
    if user is None:
        return {"username": "", "name": "システム", "email": ""}
    return {
        "username": getattr(user, "username", "") or "",
        "name": getattr(user, "display_name", "") or getattr(user, "username", "") or "",
        "email": getattr(user, "email", "") or "",
    }


def build_payload(
    event: str,
    *,
    title: str,
    summary: str,
    url: str = "",
    actor=None,
    to: list[str] | None = None,
    cc: list[str] | None = None,
    data: dict | None = None,
) -> dict:
    """フロー側が最低限 title / summary / url だけ見れば組める形にする。"""
    return {
        "source": "ai-tool-catalog",
        "event": event,
        "event_id": str(uuid.uuid4()),
        "occurred_at": timezone.now().isoformat(),
        "title": title,
        "summary": summary,
        "url": url,
        "actor": user_ref(actor),
        "recipients": {
            # 重複と空文字を落としたうえで順序は保つ
            "to": _clean_emails(to if to is not None else admin_emails()),
            "cc": _clean_emails(cc or []),
        },
        "data": data or {},
    }


def _clean_emails(values) -> list[str]:
    out: list[str] = []
    for v in values or []:
        v = (v or "").strip()
        if v and v not in out:
            out.append(v)
    return out


# --------------------------------------------------------------------------- #
# 送信
# --------------------------------------------------------------------------- #
class WebhookStatus:
    SENT = "sent"
    FAILED = "failed"
    SKIPPED = "skipped"


def _record(event: str, status: str, *, detail="", response_status=None, payload=None, duration_ms=None):
    from .models import WebhookDelivery

    try:
        WebhookDelivery.objects.create(
            event=event,
            status=status,
            detail=detail[:300],
            response_status=response_status,
            payload=payload or {},
            duration_ms=duration_ms,
        )
    except Exception as exc:  # ログ保存自体で本処理を壊さない
        logger.warning("Webhook送信ログの保存に失敗: %s", exc)


def _post(payload: dict) -> tuple[str, int | None, str, int]:
    url = webhook_url()
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    headers = {"Content-Type": "application/json; charset=utf-8"}
    token = (getattr(settings, "NOTIFY_SHARED_TOKEN", "") or "").strip()
    if token:
        # フロー側で「想定外の送信元を弾く」ための合言葉。
        # Power Automate の URL 自体に SAS 署名が付いているので、これは
        # 二重の保険であって暗号学的な認証ではない。
        headers["X-AITC-Token"] = token

    started = time.monotonic()
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    timeout = float(getattr(settings, "NOTIFY_TIMEOUT_SECONDS", 8))
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:  # noqa: S310
            ms = int((time.monotonic() - started) * 1000)
            return WebhookStatus.SENT, res.status, "", ms
    except urllib.error.HTTPError as exc:
        ms = int((time.monotonic() - started) * 1000)
        return WebhookStatus.FAILED, exc.code, f"HTTPError: {exc.reason}", ms
    except Exception as exc:
        ms = int((time.monotonic() - started) * 1000)
        return WebhookStatus.FAILED, None, f"{type(exc).__name__}: {exc}", ms


def send(payload: dict) -> str:
    """同期送信。戻り値は WebhookStatus。"""
    event = payload.get("event", "?")
    if not is_configured():
        _record(event, WebhookStatus.SKIPPED, detail="POWER_AUTOMATE_WEBHOOK_URL 未設定", payload=payload)
        return WebhookStatus.SKIPPED
    if not is_enabled(event):
        _record(event, WebhookStatus.SKIPPED, detail="NOTIFY_EVENTS で無効", payload=payload)
        return WebhookStatus.SKIPPED

    status, code, detail, ms = _post(payload)
    if status == WebhookStatus.FAILED:
        logger.warning("Webhook送信に失敗しました (%s): %s", event, detail)
    _record(event, status, detail=detail, response_status=code, payload=payload, duration_ms=ms)
    return status


def dispatch(event: str, **kwargs) -> None:
    """イベントを送る。呼び出し側は結果を気にしなくてよい。

    既定では別スレッドで送るため、Webhook が遅くても画面側の応答は
    待たされない。テストでは ``NOTIFY_SYNC=True`` で同期送信にする。
    """
    payload = build_payload(event, **kwargs)
    if getattr(settings, "NOTIFY_SYNC", False):
        send(payload)
        return
    if not is_configured() or not is_enabled(event):
        # 送らないと決まっているならスレッドを起こす意味はない
        send(payload)
        return
    threading.Thread(target=send, args=(payload,), daemon=True).start()
