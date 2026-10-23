# ChronoCampus

University timetable generation with manual corrections and explicit publication. React/TypeScript, FastAPI, SQL Server, SQLAlchemy/Alembic, and OR-Tools CP-SAT.

Includes local accounts and roles, administrative catalogs, configurable calendars, semester workloads, automatic generation, pins, conflict checking, publication, personal dated notes, and private feedback. Interface languages: Russian, Armenian, English. Full-time and part-time calendars are independent.

## Documentation for the team

| Document | Start here when you need to… |
| --- | --- |
| [Developer guide / Руководство разработчика](docs/developer-guide.md) | Find the active code, understand the data flow, and safely extend or test a feature. |
| [nemsime contribution / Вклад в этот этап](docs/contributions.md) | Distinguish the starting project from this delivery and find the corresponding commits. |
| [University rules](docs/requirements.md) | Check confirmed requirements and facts still awaiting university confirmation. |
| [Architecture](docs/architecture.md) | Understand generation, persistence, security, and operational boundaries. |
| [Demo data provenance](docs/demo-data.md) | Understand which data came from Word structure and which are fictional. |
| [Verification record](docs/verification.md) | Find actual test results, acceptance evidence, and remaining limitations. |
| [Contribution workflow](skills/repo-workflow/SKILL.md) | Work on a branch, verify integration, and prepare authorized remote publication. |

[Preview.md](docs/Preview.md) is the historical review from 22 October 2026, before the modular implementation; use the documents above for the current system.

## Run locally on Windows

Requirements: Python 3.11+, Node.js 20.19+ or 22.12+, SQL Server, and [Microsoft ODBC Driver 18](https://learn.microsoft.com/en-us/sql/connect/odbc/download-odbc-driver-for-sql-server).

From the repository root in PowerShell:

```powershell
python -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -e './backend[dev]'
Copy-Item backend/.env.example backend/.env
npm --prefix frontend ci
```

Configure `backend/.env`. Use an isolated database such as `ChronoCampus_Development`. For an existing database, back it up and restore a development copy before migrations. For a fresh installation, create an empty database. The migration account needs schema modification permissions; the running application needs SELECT/INSERT/UPDATE/DELETE on its tables. Keep credentials out of Git.

`db/ChronoCampus.sql` is an archived destructive bootstrap script. **Do not use it to upgrade retained data.** Alembic now owns incremental schema changes. Legacy catalogs are preserved; prototype user records do not automatically acquire application roles.

```powershell
Set-Location backend
.venv/Scripts/python.exe -m alembic upgrade head
.venv/Scripts/python.exe -m app.manage create-admin admin@your-university.example --name Administrator
.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Enter the administrator password at the hidden prompt; it must be changed at first login. Run **one API process**: generation uses one background worker and restart recovery assumes a single process.

In a second terminal, from the repository root:

```powershell
npm --prefix frontend run dev -- --host 127.0.0.1 --port 3000 --strictPort
```

Open [ChronoCampus](http://localhost:3000). Vite forwards `/api` to port 8000. `frontend/.env.example` documents the server-only `API_PROXY_TARGET` setting. Use a consistent browser hostname. [API documentation](http://localhost:8000/docs) describes endpoints; `/api/health` checks the process, not database availability. On Linux/macOS substitute `python3` and `backend/.venv/bin/python` for the Windows paths.

## Demonstration data

After migrations, from `backend`:

```powershell
.venv/Scripts/python.exe -m app.manage seed-demo
```

The command accepts only `ChronoCampus_Development`. Repeated runs reuse its named records. It creates two faculties with several majors, four full-time cohorts and one part-time cohort, nested student groups, rooms, equipment, workloads, and fictional users. Random passwords are stored in ignored `backend/.demo-credentials.json`; they are not printed or committed. Administrator: `admin.demo@example.invalid`.

Demo teaching dates and academic-hour settings are illustrative. Real university calendars remain unconfirmed until an administrator enters the missing facts. See [data provenance](docs/demo-data.md).

## Prepare and publish a semester

1. In **Data & rules**, configure faculties, majors, cohorts, subgroups, rooms/equipment, and users.
2. Configure a calendar, semester boundaries, and explicit **teaching periods**. Exam months remain inside semester boundaries but outside teaching periods. Confirm hours per lesson and teaching-week count.
3. Enter workload components: subject, cohort/subgroup, lecturer, lesson type, semester hours, assessment, equipment. Add holidays, unavailable intervals, preferences, and explicitly allowed extra slots.
4. In **Planner**, create a draft for a semester and selected cohorts. Generate with a recorded seed. Review completeness, hours, unresolved lessons, and diagnostics.
5. Move or pin lessons. Each change runs the same hard-constraint validation. Regeneration retains pins; changed inputs invalidate a running result instead of overwriting newer work.
6. Publish a complete valid draft. Students and lecturers see their latest published schedule. Create a new draft for subsequent changes. Personal notes follow the same lesson occurrence when it moves.

Holiday cancellations count separately from delivered hours and need no makeup. Emergency cancellations require an explicitly permitted extra slot on the original date. Permission never overrides room, teacher, or student conflicts.

## Recovery and deployment

Configure actual university domains in `UNIVERSITY_EMAIL_DOMAINS`. Local `MAIL_MODE=file` writes messages to ignored `backend/.mail` and sends no email. To send, configure `MAIL_MODE=smtp`, STARTTLS host/port, sender, and credentials, then verify with the university mail service. Reset links expire, are single-use, and change passwords only after form submission. Administrators can issue a temporary password requiring a change.

For hosting, build the frontend and serve it with `/api` behind one HTTPS origin; set `PUBLIC_URL`, `CORS_ORIGINS`, and `COOKIE_SECURE=true`. Local HTTP configuration is for development. Microsoft SSO is outside this version.

Docker Compose definitions are supplied, but native Windows is the verified setup. Compose uses an existing SQL Server; use `host.docker.internal` for a host server and suitable SQL authentication. Apply migrations explicitly with `docker compose run --rm backend python -m alembic upgrade head`, then `docker compose up --build`.

## Verification

From `backend`:

```powershell
.venv/Scripts/python.exe -m pytest tests -q
```

From the repository root:

```powershell
npm --prefix frontend run typecheck
npm --prefix frontend run build
git diff --check
```

Default tests isolate database state with SQLite. The opt-in concurrency test uses real SQL Server: create and migrate an isolated `ChronoCampus_MigrationTest_YYYYMMDD` database and set `CHRONOCAMPUS_TEST_DATABASE` to that name when running pytest. It writes disposable fixtures only there and verifies that concurrent conflicting publications cannot both succeed.

Live acceptance: administrator login, generation and publication, student/lecturer schedules, note retention after a move, feedback replies/statuses/privacy, all three languages, desktop and mobile. Check partial-publication rejection and prohibited moves. See [verification evidence and limits](docs/verification.md).

## Code map

- `backend/app/accounts`: authentication, sessions, password recovery, permissions.
- `backend/app/academics`: catalogs and workloads.
- `backend/app/calendar`: shared date, parity, slot, and audience rules.
- `backend/app/scheduling`: snapshots, solvers, independent validator, drafts, jobs, publication.
- `backend/app/notes`, `feedback`: private user data.
- `backend/app/db`: models, transactions, revision lock; `backend/alembic`: migrations.
- `frontend/src/system`: active interface through `App.tsx`. Earlier prototype components outside this import graph are retained as reference and are not mounted.
- [Requirements](docs/requirements.md), [architecture](docs/architecture.md), [Git workflow](skills/repo-workflow/SKILL.md).
