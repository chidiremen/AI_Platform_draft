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

#: BOM 無しでも試すエンコーディング。utf-8-sig は BOM 付き/無し両方の UTF-8 を
#: 吸収する。cp932 は日本語 Windows の「ANSI」。latin-1 はどんなバイト列でも
#: 失敗しない最後の砦で、日本語コメントは化けるが `KEY=VALUE` 行（ASCII）は
#: 正しく読めるため実害が小さい。
ENCODINGS = ("utf-8-sig", "cp932", "latin-1")

#: UTF-16 の BOM。メモ帳の「Unicode」保存がこれ。
UTF16_BOMS = (b"\xff\xfe", b"\xfe\xff")


def _candidate_encodings(raw: bytes):
    """試す順にエンコーディングを返す。

    utf-16 は **BOM がある時だけ** 候補にする。BOM 無しの UTF-16 を推測で
    デコードすると、たまたま例外が出ずに全く別の文字列になってしまい
    （例: b"\x00\x01\x00\x02" が "ĀȀ" になる）、設定を静かにゴミで
    埋めることになるため。
    """
    if raw.startswith(UTF16_BOMS):
        yield "utf-16"
    yield from ENCODINGS


def decode_env_bytes_with_encoding(raw: bytes) -> tuple[str, str] | None:
    """デコード結果と、使えたエンコーディング名を返す。読めなければ None。

    「例外が出なかった＝正しく読めた」ではない点に注意。latin-1 はどんな
    バイト列でも通ってしまうので、バイナリを食わせると文字化けしたテキストが
    出来上がり、python-dotenv が意味のない行を延々と警告しながら設定を
    中途半端に読み込む。設定を黙ってゴミで埋めるくらいなら読まない方が
    マシなので、NUL を含む結果は失敗とみなす（まともな .env に NUL は無い）。
    """
    for enc in _candidate_encodings(raw):
        try:
            text = raw.decode(enc)
        except (UnicodeDecodeError, UnicodeError, LookupError):
            continue
        if "\x00" in text:
            continue
        return text, enc
    return None


def decode_env_bytes(raw: bytes) -> str | None:
    """`.env` のバイト列をデコードする。どれでも読めなければ None。"""
    found = decode_env_bytes_with_encoding(raw)
    return found[0] if found else None


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
