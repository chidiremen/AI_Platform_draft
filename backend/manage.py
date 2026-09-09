#!/usr/bin/env python
"""Django's command-line utility for administrative tasks."""

import os
import sys
from pathlib import Path


def _load_env():
    """プロジェクトルート `.env` → backend/.env の順に読み込む（先に読んだ側が優先）。

    文字コードは config.envfile 側で吸収する。以前はここで load_dotenv() を
    直接呼んでいたため、`.env` が Shift-JIS 保存されていると
    UnicodeDecodeError で manage.py 自体が起動しなくなっていた。
    """
    here = Path(__file__).resolve().parent
    sys.path.insert(0, str(here))
    try:
        from config.envfile import load_env_files
    except Exception:  # 依存が無くても manage.py は動くべき
        return
    load_env_files(here.parent / ".env", here / ".env")


def main():
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    _load_env()

    # `python manage.py runserver` にポート指定が無ければ BACKEND_PORT を補完。
    # runserver は「addr:port」または「port」形式を受けるため、数字を含む
    # 引数が既にあれば触らない。
    if len(sys.argv) >= 2 and sys.argv[1] == "runserver":
        has_port_arg = any(
            (":" in a and a.rsplit(":", 1)[-1].isdigit()) or a.isdigit()
            for a in sys.argv[2:]
        )
        if not has_port_arg:
            port = os.environ.get("BACKEND_PORT", "8009")
            sys.argv.append(port)

    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
