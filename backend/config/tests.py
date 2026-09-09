"""`.env` の文字コード揺れに対する耐性テスト。

背景: python-dotenv の既定は utf-8 固定なので、Windows のメモ帳で
「ANSI」保存された `.env`（日本語環境なら cp932）を読むと
UnicodeDecodeError になる。以前は manage.py がその例外をそのまま伝播させ、
`manage.py runserver` すら起動しなくなっていた。
"""
import os
import tempfile
from pathlib import Path

from django.test import SimpleTestCase

from config.envfile import decode_env_bytes, load_env_file, load_env_files

BODY = (
    "# ---- ポート設定（日本語コメント）----\n"
    "AITC_TEST_FRONTEND_PORT=5174\n"
    "AITC_TEST_BACKEND_PORT=8009\n"
)

KEYS = ("AITC_TEST_FRONTEND_PORT", "AITC_TEST_BACKEND_PORT")


class EnvFileEncodingTests(SimpleTestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)
        self.addCleanup(self._clear_keys)
        self._clear_keys()

    def _clear_keys(self):
        for k in KEYS:
            os.environ.pop(k, None)

    def _write(self, data: bytes) -> Path:
        path = Path(self.dir.name) / ".env"
        path.write_bytes(data)
        return path

    def _assert_loaded(self, data: bytes, label: str):
        self._clear_keys()
        self.assertTrue(load_env_file(self._write(data)), f"{label}: 読み込めなかった")
        self.assertEqual(os.environ.get(KEYS[0]), "5174", label)
        self.assertEqual(os.environ.get(KEYS[1]), "8009", label)

    def test_utf8_without_bom(self):
        self._assert_loaded(BODY.encode("utf-8"), "UTF-8 (BOMなし)")

    def test_utf8_with_bom(self):
        self._assert_loaded(b"\xef\xbb\xbf" + BODY.encode("utf-8"), "UTF-8 (BOMあり)")

    def test_shift_jis(self):
        """回帰: メモ帳の「ANSI」保存。以前はここで manage.py ごと落ちていた。"""
        self._assert_loaded(BODY.encode("cp932"), "Shift-JIS (ANSI)")

    def test_utf16_with_bom(self):
        """メモ帳の「Unicode」保存。"""
        self._assert_loaded(BODY.encode("utf-16"), "UTF-16 (BOMあり)")

    def test_crlf_line_endings(self):
        """Windows で編集された CRLF 改行。"""
        self._assert_loaded(BODY.replace("\n", "\r\n").encode("utf-8"), "CRLF")

    def test_missing_file_is_not_an_error(self):
        self.assertFalse(load_env_file(Path(self.dir.name) / "存在しない.env"))

    def test_binary_garbage_does_not_raise(self):
        """どんなバイト列でも例外を外に出さない（.env は任意の設定ファイル）。"""
        path = self._write(bytes(range(256)) * 4)
        try:
            load_env_file(path)
        except Exception as exc:  # pragma: no cover
            self.fail(f"例外が漏れた: {exc!r}")

    def test_decode_env_bytes_never_fails_on_arbitrary_bytes(self):
        self.assertIsNotNone(decode_env_bytes(b"\x83\x81\x83\x82\xff\xfe\x00"))

    def test_first_file_wins(self):
        """load_env_files は先に読んだ側を優先する（override=False の既定）。"""
        first = Path(self.dir.name) / "first.env"
        second = Path(self.dir.name) / "second.env"
        first.write_text(f"{KEYS[0]}=1111\n", encoding="utf-8")
        second.write_text(f"{KEYS[0]}=2222\n", encoding="utf-8")
        load_env_files(first, second)
        self.assertEqual(os.environ.get(KEYS[0]), "1111")
