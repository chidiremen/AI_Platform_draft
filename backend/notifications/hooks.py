"""各イベントの発火点。

views からはここの関数だけを呼ぶ。「何を通知したいか」を1か所に集め、
ペイロードの組み立てを views に散らさないため。新しい通知を足すときは
ここに関数を1つ増やして、呼び出し側から呼ぶだけでよい。

どの関数も例外を外に出さない。通知が落ちたせいで本来の処理（ツール登録
など）が失敗するのは本末転倒なので。
"""
import logging

from .events import Event, dispatch, link

logger = logging.getLogger(__name__)


def _safe(fn):
    """通知の失敗で呼び出し元を巻き込まないためのラッパ。"""

    def wrapper(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except Exception as exc:  # pragma: no cover - 保険
            logger.warning("通知の組み立てに失敗しました (%s): %s", fn.__name__, exc)
            return None

    wrapper.__name__ = fn.__name__
    wrapper.__doc__ = fn.__doc__
    return wrapper


def _name(user) -> str:
    if user is None:
        return "システム"
    return getattr(user, "display_name", "") or getattr(user, "username", "") or "不明"


def _email(user) -> list[str]:
    addr = (getattr(user, "email", "") or "").strip()
    return [addr] if addr else []


# --------------------------------------------------------------------------- #
# ツール
# --------------------------------------------------------------------------- #
@_safe
def tool_created(tool):
    """ツールが新規登録された。

    部門への周知が主目的なので宛先は既定（NOTIFY_DEFAULT_EMAILS）に任せ、
    Teams チャネルへの投稿を主線に想定している。
    """
    dispatch(
        Event.TOOL_CREATED,
        title="🆕 新しいツールが登録されました",
        summary=f"{_name(tool.author)} さんが「{tool.title}」を登録しました",
        url=link(f"/tools/{tool.id}"),
        actor=tool.author,
        data={
            "tool_id": str(tool.id),
            "title": tool.title,
            "summary": tool.summary,
            "tool_type": tool.tool_type,
            "tags": [t.strip() for t in (tool.tags or "").split(",") if t.strip()],
            "work_categories": tool.work_categories or [],
            "effect_qualitative": tool.effect_qualitative or "",
            "effect_hours_per_month": (
                float(tool.effect_hours_per_month)
                if tool.effect_hours_per_month is not None
                else None
            ),
            "access_url": tool.access_url or "",
            "has_zip": bool(tool.zip_file),
        },
    )


@_safe
def tool_updated(tool, actor=None):
    dispatch(
        Event.TOOL_UPDATED,
        title="✏️ ツールが更新されました",
        summary=f"{_name(actor or tool.author)} さんが「{tool.title}」を更新しました",
        url=link(f"/tools/{tool.id}"),
        actor=actor or tool.author,
        data={"tool_id": str(tool.id), "title": tool.title},
    )


@_safe
def access_request_created(req):
    """アクセス権の申請。

    対応するのはツールの登録者本人なので、宛先をその人のメールにする。
    このテナントでは Teams の個人チャットに送れないため、個人に確実に
    届けたい通知はメールに寄せる必要がある。
    """
    tool = req.tool
    dispatch(
        Event.ACCESS_REQUEST_CREATED,
        title="📬 アクセス権の申請があります",
        summary=(
            f"{_name(req.requester)} さんが「{tool.title}」の"
            "アクセス権を申請しました"
        ),
        url=link("/mypage"),
        actor=req.requester,
        to=_email(tool.author),
        data={
            "request_id": str(req.id),
            "tool_id": str(tool.id),
            "tool_title": tool.title,
            "tool_type": tool.tool_type,
            "requester": _name(req.requester),
            "requester_email": (getattr(req.requester, "email", "") or ""),
            "reason": req.reason or "",
            "owner": _name(tool.author),
        },
    )


@_safe
def access_request_resolved(req, actor=None):
    """申請が承認/却下された。結果を知りたいのは申請者本人。"""
    tool = req.tool
    decided = "承認" if req.status == "granted" else "却下"
    dispatch(
        Event.ACCESS_REQUEST_RESOLVED,
        title=f"✅ アクセス権申請が{decided}されました",
        summary=f"「{tool.title}」のアクセス権申請が{decided}されました",
        url=link(f"/tools/{tool.id}"),
        actor=actor,
        to=_email(req.requester),
        data={
            "request_id": str(req.id),
            "tool_id": str(tool.id),
            "tool_title": tool.title,
            "status": req.status,
            "requester": _name(req.requester),
        },
    )


@_safe
def comment_created(comment):
    """ツールへのコメント。ツールの登録者に届けたい。"""
    tool = comment.tool
    # 自分のツールに自分で書いた場合は通知しない（自分宛のノイズ）
    to = [] if comment.author_id == tool.author_id else _email(tool.author)
    dispatch(
        Event.COMMENT_CREATED,
        title="💬 ツールにコメントが付きました",
        summary=(
            f"{_name(comment.author)} さんが「{tool.title}」に"
            f"コメントしました"
        ),
        url=link(f"/tools/{tool.id}"),
        actor=comment.author,
        to=to,
        data={
            "tool_id": str(tool.id),
            "tool_title": tool.title,
            "comment_id": str(comment.id),
            "comment_type": comment.comment_type,
            "body": comment.body,
            "author": _name(comment.author),
        },
    )


# --------------------------------------------------------------------------- #
# テーマ / アイデア
# --------------------------------------------------------------------------- #
@_safe
def theme_created(theme):
    """テーマの登録。重複開発の抑止が目的なので、広く周知したい。"""
    dispatch(
        Event.THEME_CREATED,
        title="🚀 新しいテーマが始まりました",
        summary=f"{_name(theme.owner)} さんが「{theme.title}」に着手します",
        url=link(f"/themes/{theme.id}"),
        actor=theme.owner,
        data={
            "theme_id": str(theme.id),
            "title": theme.title,
            "summary": theme.summary,
            "status": theme.status,
            "tags": [t.strip() for t in (theme.tags or "").split(",") if t.strip()],
            "work_categories": theme.work_categories or [],
            "recruiting": theme.status == "recruiting",
        },
    )


@_safe
def theme_progress(theme, entry):
    dispatch(
        Event.THEME_PROGRESS,
        title="📈 テーマの進捗が更新されました",
        summary=f"「{theme.title}」に進捗が記録されました",
        url=link(f"/themes/{theme.id}"),
        actor=entry.author,
        data={
            "theme_id": str(theme.id),
            "title": theme.title,
            "body": entry.body,
            "progress_percent": entry.progress_percent,
            "author": _name(entry.author),
        },
    )


@_safe
def theme_frozen(theme, actor=None):
    """凍結。失敗の知見を共有したいので、理由を本文に含める。"""
    dispatch(
        Event.THEME_FROZEN,
        title="🧊 テーマが凍結されました",
        summary=f"「{theme.title}」が凍結されました: {theme.freeze_reason}",
        url=link(f"/themes/{theme.id}"),
        actor=actor or theme.owner,
        data={
            "theme_id": str(theme.id),
            "title": theme.title,
            "reason": theme.freeze_reason,
            "owner": _name(theme.owner),
        },
    )


@_safe
def theme_stalled(themes):
    """停滞しているテーマのまとめ。定期実行コマンドから呼ぶ。

    1件ずつ送るとチャネルが埋まるので、1通にまとめる。
    """
    if not themes:
        return
    lines = [f"・{t.title}（{_name(t.owner)}・{t.days_since_progress}日）" for t in themes]
    dispatch(
        Event.THEME_STALLED,
        title=f"⏳ 停滞しているテーマが {len(themes)} 件あります",
        summary="\n".join(lines),
        url=link("/themes?stalled=true"),
        data={
            "count": len(themes),
            "themes": [
                {
                    "theme_id": str(t.id),
                    "title": t.title,
                    "owner": _name(t.owner),
                    "owner_email": (getattr(t.owner, "email", "") or ""),
                    "days_since_progress": t.days_since_progress,
                    "url": link(f"/themes/{t.id}"),
                }
                for t in themes
            ],
        },
    )


@_safe
def idea_created(idea):
    """アイデアの投稿。作れる人の目に触れることが目的。"""
    dispatch(
        Event.IDEA_CREATED,
        title="💡 アイデアが投稿されました",
        summary=f"{_name(idea.author)} さん: {idea.title}",
        url=link(f"/ideas/{idea.id}"),
        actor=idea.author,
        data={
            "idea_id": str(idea.id),
            "title": idea.title,
            "body": idea.body,
            "tags": [t.strip() for t in (idea.tags or "").split(",") if t.strip()],
        },
    )


# --------------------------------------------------------------------------- #
# Q&A
# --------------------------------------------------------------------------- #
@_safe
def question_created(question):
    """質問の投稿。回答するのはツール管理者なので既定の宛先へ。"""
    dispatch(
        Event.QUESTION_CREATED,
        title="❓ Q&Aに質問が投稿されました",
        summary=f"{_name(question.asker)} さん: {question.title}",
        url=link(f"/qa/{question.id}"),
        actor=question.asker,
        data={
            "question_id": str(question.id),
            "title": question.title,
            "body": question.body,
        },
    )


@_safe
def answer_created(answer):
    """回答が付いた。知りたいのは質問者本人。"""
    question = answer.question
    dispatch(
        Event.ANSWER_CREATED,
        title="💡 質問に回答が付きました",
        summary=f"「{question.title}」に回答が付きました",
        url=link(f"/qa/{question.id}"),
        actor=answer.author,
        to=_email(question.asker),
        data={
            "question_id": str(question.id),
            "question_title": question.title,
            "answer_id": str(answer.id),
            "body": answer.body,
            "author": _name(answer.author),
        },
    )
