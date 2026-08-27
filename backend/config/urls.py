"""Root URL configuration for the AI Tool Catalog backend."""

import os

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import HttpResponseRedirect
from django.urls import include, path, re_path


def _frontend_url() -> str:
    """開発時、Django にブラウザで直接アクセスされたときにフロントへ誘導する URL。"""
    port = os.environ.get("FRONTEND_PORT", "5174")
    return f"http://localhost:{port}"


def _redirect_to_frontend(request, path: str = ""):
    """バックエンドの `/` `/login` などを叩かれたらフロントへ飛ばす。

    誤って `http://localhost:8009/` `http://localhost:8009/login` を開いても
    Django のバニラ 404 ではなく、フロントの該当ページへリダイレクトする。
    `/api/*` `/admin/*` は先に urlpatterns で処理されるためここには来ない。
    """
    target = _frontend_url()
    if path:
        target = f"{target}/{path.lstrip('/')}"
    else:
        target = f"{target}/"
    return HttpResponseRedirect(target)


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("accounts.urls")),
    path("api/", include("tools.urls")),
    path("api/", include("metrics.urls")),
    path("api/", include("docs.urls")),
    path("api/", include("forum.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    # 開発時のみ: `/api/*` `/admin/*` 以外はフロントエンドへ誘導する。
    urlpatterns += [
        re_path(r"^$", _redirect_to_frontend),
        re_path(r"^(?P<path>(?!api/|admin/|media/|static/).+)$", _redirect_to_frontend),
    ]
