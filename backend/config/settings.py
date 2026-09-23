"""
Django settings for the AI Tool Catalog backend (config project).

Reads SECRET_KEY and TEAMS_WEBHOOK_URL from the environment with sensible
development defaults. Uses SQLite for local development.
"""

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# Optional .env support (python-dotenv). プロジェクトルート `.env` を最初に、
# backend/.env をその後に読み込む（先に読んだ側が優先）。
# 文字コードの揺れ（Windows の ANSI=cp932 保存など）は envfile 側で吸収する。
from config.envfile import load_env_files  # noqa: E402

load_env_files(BASE_DIR.parent / ".env", BASE_DIR / ".env")

# --------------------------------------------------------------------------- #
# Core / security
# --------------------------------------------------------------------------- #
SECRET_KEY = os.environ.get(
    "SECRET_KEY",
    "dev-insecure-change-me-0407yh-ai-tool-catalog",  # dev default only
)

DEBUG = os.environ.get("DEBUG", "True").lower() in ("1", "true", "yes")

ALLOWED_HOSTS = os.environ.get(
    "ALLOWED_HOSTS", "localhost,127.0.0.1,0.0.0.0"
).split(",")

# External integration (Microsoft Teams notifications for access requests, etc.)
# 旧: Teams Incoming Webhook へ MessageCard を直接投げる経路。
# Microsoft がこの種のコネクタを廃止する方針のため、新規は下の
# POWER_AUTOMATE_WEBHOOK_URL を使う（両方設定されている場合は
# 二重通知を避けるため Power Automate 側だけが動く）。
TEAMS_WEBHOOK_URL = os.environ.get("TEAMS_WEBHOOK_URL", "")

# --------------------------------------------------------------------------- #
# 通知（Power Automate 連携）
# --------------------------------------------------------------------------- #
# Power Automate の「HTTP 要求の受信時」トリガーが発行する URL。
# 全イベントをこの1本に投げ、フロー側の Switch で振り分ける想定。
# URL には SAS 署名が含まれるので、実質的な認証情報として扱うこと。
POWER_AUTOMATE_WEBHOOK_URL = os.environ.get("POWER_AUTOMATE_WEBHOOK_URL", "")

# 送信するイベントをカンマ区切りで限定する。空なら全イベントを送る。
# 例: NOTIFY_EVENTS=tool.created,access_request.created
NOTIFY_EVENTS = os.environ.get("NOTIFY_EVENTS", "")

# 宛先が特定できないイベント（ツール登録の周知など）で使う既定の宛先。
NOTIFY_DEFAULT_EMAILS = os.environ.get("NOTIFY_DEFAULT_EMAILS", "")

# フロー側で「想定外の送信元を弾く」ための合言葉。X-AITC-Token で送る。
NOTIFY_SHARED_TOKEN = os.environ.get("NOTIFY_SHARED_TOKEN", "")

NOTIFY_TIMEOUT_SECONDS = float(os.environ.get("NOTIFY_TIMEOUT_SECONDS", "8"))

# True にすると同期送信になる（テスト用）。既定は別スレッドで送るので、
# Webhook が遅くても画面側の応答は待たされない。
NOTIFY_SYNC = os.environ.get("NOTIFY_SYNC", "").lower() == "true"

# 通知に載せるリンクのベース URL。未設定なら FRONTEND_PORT から組み立てる
# （社内配布時は localhost ではないので明示すること）。
FRONTEND_BASE_URL = os.environ.get("FRONTEND_BASE_URL", "")

# フィードバックメールの宛先（カンマ区切り）。未設定なら admin/tool_admin の
# メールアドレスを宛先にする。送信自体はクライアントの mailto:（Outlook 等）。
FEEDBACK_TO_EMAIL = os.environ.get("FEEDBACK_TO_EMAIL", "")

# --------------------------------------------------------------------------- #
# Applications
# --------------------------------------------------------------------------- #
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third-party
    "rest_framework",
    "rest_framework.authtoken",
    "corsheaders",
    # Local apps
    "accounts",
    "tools",
    "metrics",
    "docs",
    "forum",
    "themes",
    "notifications",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

# --------------------------------------------------------------------------- #
# Database (SQLite for dev)
# --------------------------------------------------------------------------- #
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

# --------------------------------------------------------------------------- #
# Authentication
# --------------------------------------------------------------------------- #
AUTH_USER_MODEL = "accounts.User"

# テーマがこの日数だけ進捗更新されないと一覧で「停滞」と表示する。
# データは書き換えず表示上の判定だけなので、変更しても既存データに影響しない。
THEME_STALLED_AFTER_DAYS = int(os.environ.get("THEME_STALLED_AFTER_DAYS", "30"))

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation."
        "UserAttributeSimilarityValidator"
    },
    {
        "NAME": "django.contrib.auth.password_validation."
        "MinimumLengthValidator"
    },
    {
        "NAME": "django.contrib.auth.password_validation."
        "CommonPasswordValidator"
    },
    {
        "NAME": "django.contrib.auth.password_validation."
        "NumericPasswordValidator"
    },
]

# --------------------------------------------------------------------------- #
# Internationalization
# --------------------------------------------------------------------------- #
LANGUAGE_CODE = "ja"
TIME_ZONE = "Asia/Tokyo"
USE_I18N = True
USE_TZ = True

# --------------------------------------------------------------------------- #
# Static & media
# --------------------------------------------------------------------------- #
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --------------------------------------------------------------------------- #
# Django REST Framework
# --------------------------------------------------------------------------- #
REST_FRAMEWORK = {
    # Token first: a token-bearing SPA request authenticates via the token
    # and never triggers SessionAuthentication's CSRF enforcement. Session
    # auth is kept (after token) for the browsable API / Django admin.
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.TokenAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ],
    # Reads are public by default; write/admin views override per-view.
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.AllowAny",
    ],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 12,
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
        "rest_framework.parsers.MultiPartParser",
        "rest_framework.parsers.FormParser",
    ],
}

# --------------------------------------------------------------------------- #
# CORS / CSRF
#   デフォルト値は FRONTEND_PORT から自動生成。明示的に上書きしたい場合は
#   環境変数 CORS_ALLOWED_ORIGINS / CSRF_TRUSTED_ORIGINS を設定する。
# --------------------------------------------------------------------------- #
_FRONTEND_PORT = os.environ.get("FRONTEND_PORT", "5174")
_default_origins = (
    f"http://localhost:{_FRONTEND_PORT},http://127.0.0.1:{_FRONTEND_PORT}"
)
CORS_ALLOWED_ORIGINS = os.environ.get(
    "CORS_ALLOWED_ORIGINS", _default_origins
).split(",")
CORS_ALLOW_CREDENTIALS = True

CSRF_TRUSTED_ORIGINS = os.environ.get(
    "CSRF_TRUSTED_ORIGINS", _default_origins
).split(",")
