"""アクセス権申請の通知（Teams Incoming Webhook）。

仕様書 8 章に基づき、申請が発生した際に登録者（Author）が属するチャネルへ
MessageCard を投稿する。``TEAMS_WEBHOOK_URL`` 未設定なら何もしない。
ネットワーク失敗で申請処理を妨げないよう、ベストエフォート（例外を握り潰す）。
"""
import json
import logging
import urllib.request

from django.conf import settings

logger = logging.getLogger(__name__)


def build_card(access_request) -> dict:
    tool = access_request.tool
    requester = access_request.requester
    requester_name = getattr(requester, "display_name", "") or requester.username
    return {
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        "summary": "アクセス権の申請がありました",
        "themeColor": "0078D7",
        "title": "📬 アクセス権の申請がありました",
        "sections": [
            {
                "facts": [
                    {"name": "ツール", "value": tool.title},
                    {"name": "申請者", "value": requester_name},
                    {"name": "理由", "value": access_request.reason or "（記載なし）"},
                ],
                "text": "該当サービスで権限を付与してください。",
            }
        ],
    }


def notify_access_request(access_request) -> bool:
    """Webhook へ通知を送る。送信したら True、未設定/失敗なら False。"""
    url = getattr(settings, "TEAMS_WEBHOOK_URL", "") or ""
    if not url:
        return False
    payload = json.dumps(build_card(access_request), ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url, data=payload, headers={"Content-Type": "application/json"}
    )
    try:
        urllib.request.urlopen(req, timeout=5)  # noqa: S310 (信頼できる社内Webhook)
        return True
    except Exception as exc:  # ベストエフォート
        logger.warning("Teams通知の送信に失敗しました: %s", exc)
        return False
