# ニュース取り込みの受け皿

AI_WeeklyNews が出力した `articles.jsonl` をここに置くと、
`python manage.py import_news` が取り込みます。

別の場所を直接指したい場合は、プロジェクトルート `.env` に
`NEWS_JSONL_PATH` を設定してください（ファイル / ディレクトリどちらでも可）。

詳細: `docs/news-integration.md`

※ このディレクトリに置いた `*.jsonl` は .gitignore 済みです。
