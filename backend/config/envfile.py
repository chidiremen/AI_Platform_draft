"""`.env` を文字コードに寛容に読み込むための小さなヘルパ。

python-dotenv の既定エンコーディングは utf-8 固定である。ところが Windows
（特に日本語環境）では、メモ帳や古いエディタで `.env` を「ANSI」保存すると
cp932 になり、`load_dotenv()` が UnicodeDecodeError を投げる。

`config/settings.py` 側は try/except で握りつぶしているので落ちはしないが、
その場合ポートや SECRET_KEY が黙って既定値に戻るという分かりにくい壊れ方を
する。`manage.py` 側は例外が素通りするため、コマンド自体が起動しなくなる。
`.env.example` に日本語コメントを載せている以上これは十分起こりうるので、
ここで複数のエンコーディングを順に試して吸収する。

`manage.py` の冒頭（Django の import 前）からも呼ぶため、
このモジュールは Django に依存してはいけない。
"""
from __future__ import annotations

import io
from pathlib import Path

#: 試す順。utf-8-sig は BOM 付き/無し両方の UTF-8 を吸収する。
#: utf-16 はメモ帳の「Unicode」保存。cp932 は日本語 Windows の「ANSI」。
#: latin-1 はどんなバイト列でも失敗しない最後の砦で、日本語コメントは
#: 文字化けするが `KEY=VALUE` 行（ASCII）は正しく読めるため実害が小さい。
_ENCODINGS = ("utf-8-sig", "utf-16", "cp932", "latin-1")


def decode_env_bytes(raw: bytes) -> str | None:
    """`.env` のバイト列をデコードする。どれでも読めなければ None。"""
    for enc in _ENCODINGS:
        try:
            return raw.decode(enc)
        except (UnicodeDecodeError, UnicodeError, LookupError):
            continue
    return None


def load_env_file(path) -> bool:
    """`.env` を1つ読み込む。読み込めたら True。

    python-dotenv が無い / ファイルが無い / 解析できない場合は False を返し、
    例外は外に出さない（.env はあくまで任意の設定ファイルであるため）。
    """
    try:
        from dotenv import load_dotenv
    except Exception:  # python-dotenv 未インストールなら黙って諦める
        return False

    path = Path(path)
    try:
        if not path.is_file():
            return False
        text = decode_env_bytes(path.read_bytes())
        if text is None:
            return False
        # stream 経由で渡すことで、python-dotenv 側の utf-8 固定読み込みを回避する。
        load_dotenv(stream=io.StringIO(text))
    except Exception:
        return False
    return True


def load_env_files(*paths) -> None:
    """複数の `.env` を順に読み込む。

    先に読んだ側が優先される（python-dotenv の override=False の既定に従い、
    既に os.environ にある値は上書きしない）。
    """
    for path in paths:
        load_env_file(path)
