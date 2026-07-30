# AI Tool Catalog — Backend

Django 5 + Django REST Framework backend for the internal "AI Tool Catalog"
platform (Panasonic Automotive Systems). Provides the catalog API, like /
access-request actions, activity logging, and role-based dashboards.

> The React frontend (`../frontend`) can run in either mode:
> **mock**（`VITE_USE_MOCK=true`／バックエンド不要）と
> **実API**（`VITE_USE_MOCK=false`／この API に接続）。
> 実APIモードで DB が空だとカタログが空になり、いいね・ダッシュボードの数字も
> すべて 0 になるため、下記の `seed_*` コマンドでデモデータを投入しておくと
> モードを切り替えても見え方が揃う。

## Requirements

- Python 3.12 (3.11+ works)
- SQLite (bundled; used for development)

## Setup

```bash
cd backend

# 1. Create and activate a virtualenv
#    (環境により python / python3 のどちらか。以降は `python` で記載)
python -m venv venv               # または: python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure environment (optional — sensible dev defaults exist)
cp .env.example .env              # then edit as needed

# 4. Run migrations
python manage.py migrate

# 5. Seed A-SPICE processes + demo users (optional)
python manage.py seed_data

# 5b. Seed demo tools so the catalog / dashboard are not empty (optional)
#     実APIモードで DB が空だとカタログが真っ白になり、いいね・ダッシュボードも
#     すべて 0 になる。モックと同じ 13 件を投入して見え方を揃える。
python manage.py seed_tools --with-metrics

# 5c. Seed guide / Q&A / forum demo data (optional)
python manage.py seed_docs
python manage.py seed_forum
python manage.py forum_names --seed

# 6. Create a Django admin superuser (optional; or use seeded `admin`)
#    createsuperuser で作成したユーザーは自動的に role=admin（組織管理者）として扱われます。
python manage.py createsuperuser

# 7. Run the dev server
#    プロジェクトルート `.env` の BACKEND_PORT を自動採用（既定 8009）。
#    明示指定したい場合: python manage.py runserver 8010
python manage.py runserver
```

The API is served under `http://localhost:8009/api/` and the Django admin at
`http://localhost:8009/admin/`.

### Seeded accounts (from `seed_data`)

| username   | password      | role   |
| ---------- | ------------- | ------ |
| `admin`    | `admin12345`  | admin  |
| `member01` | `member12345` | member |
| `member02` | `member12345` | member |

> These are development credentials only. Change them before any shared use.

## Environment variables

Read from the environment (or a `.env` file via `python-dotenv`):

| Variable               | Default                                              | Description                                  |
| ---------------------- | ---------------------------------------------------- | -------------------------------------------- |
| `SECRET_KEY`           | dev placeholder                                      | Django secret key. **Set a real one.**       |
| `DEBUG`                | `True`                                               | Debug mode toggle.                           |
| `ALLOWED_HOSTS`        | `localhost,127.0.0.1,0.0.0.0`                        | Comma-separated allowed hosts.               |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5174,http://127.0.0.1:5174`        | React (Vite) dev origins allowed via CORS.   |
| `CSRF_TRUSTED_ORIGINS` | `http://localhost:5174,http://127.0.0.1:5174`        | Trusted origins for CSRF.                    |
| `TEAMS_WEBHOOK_URL`    | empty                                                | MS Teams incoming webhook (notifications).   |

## Apps

- **accounts** — custom `User` model (`role` = admin/member, `display_name`),
  auth + admin user management endpoints, `seed_data` command.
- **tools** — `Tool`, `AspiceProcess`, `ToolAspiceProcess`, `Like`,
  `AccessRequest`, `Screenshot`; catalog CRUD + search/filter/sort and the
  fork / like / request-access / download actions.
- **metrics** — `ActivityLog` plus role-scoped dashboard endpoints.

## API overview

Authentication: DRF `SessionAuthentication` + `TokenAuthentication`. Reads are
public; writes require auth. `role == "admin"` grants org-admin permissions.

### Auth
- `POST /api/auth/login/` — `{username, password}` → `{token, user}`
- `POST /api/auth/logout/`
- `POST /api/auth/register/` — `{username, password, display_name?, role?}`

### Tools
- `GET  /api/tools/` — list. Query params:
  `q`, `aspice` (CSV of process ids, OR), `tool_type` (CSV), `work_category`
  (CSV), `sort` ∈ {`newest`,`likes`,`requests`,`views`,`name`}, `page`.
- `GET  /api/tools/{id}/` — detail
- `POST /api/tools/` — create (author = current user)
- `PUT/PATCH /api/tools/{id}/` — update (author or admin)
- `DELETE /api/tools/{id}/` — delete (author or admin)
- `POST /api/tools/{id}/fork/` — returns a copy payload (`forked_from` set)
- `POST /api/tools/{id}/like/` — toggle like
- `POST /api/tools/{id}/request-access/` — create access request
- `GET  /api/tools/{id}/download/` — download zip (auth required)

Write payloads accept `aspice_process_ids` (list of process id strings) and
`work_categories` (list of strings, e.g. `meeting`, `mail`, `document`).

### Metrics
- `POST /api/activity/` — record activity (single object or list; auth optional)
- `GET  /api/dashboard/summary/` — role-scoped totals + top tools
- `GET  /api/dashboard/funnel/` — role-scoped funnel
- `GET  /api/dashboard/aspice-distribution/` — role-scoped A-SPICE distribution

Dashboards are role-scoped: admins see all tools; members see only their own.

### Current user
- `GET /api/me/`
- `GET /api/me/tools/`
- `GET /api/me/likes/`
- `GET /api/me/requests/`
- `GET /api/me/incoming-requests/`

### Admin user management (admin role only)
- `GET  /api/admin/users/` — list users
- `POST /api/admin/users/` — create user (`username`, `password`, `role`)
- `PATCH /api/admin/users/{id}/` — update role / status / display name
```
