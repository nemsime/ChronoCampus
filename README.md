# ChronoCampus

University timetable management with a React/TypeScript/Vite frontend and a Python/FastAPI API backed by SQL Server.

## Current working slice

`GET /api/groups` reads `dbo.CourseGroup` joined to `dbo.Major`. The admin **Groups & Classrooms → Groups** screen requests these records, supports search, and shows loading, empty, error, and retry states. It displays capacity (not enrolled-student count), major, and admission year (not current course year).

Groups are read-only. Group writes, real authentication/permissions, and other screens remain future work; classrooms and other existing features still use prototype data. The API currently exposes only read endpoints without authentication. Run it locally until authorization is implemented.

## Prerequisites

- Python 3.11 or newer, with `venv` and pip.
- Node.js 20.19+ or 22.12+ and npm.
- A reachable SQL Server with the ChronoCampus schema.
- Microsoft **ODBC Driver 18 for SQL Server**, installed on the machine running Python. Linux also needs unixODBC; compiling pyodbc from source may require its development headers.

Driver installation is platform-specific: follow [Microsoft's installation instructions](https://learn.microsoft.com/en-us/sql/connect/odbc/download-odbc-driver-for-sql-server). Installing the Python package alone does not install the system driver or SQL Server.

## Database setup

For a new, disposable development database, open `db/ChronoCampus.sql` in a SQL Server client and execute it against your development instance. The file includes `GO` batch separators and sample data.

**The script drops and recreates ChronoCampus. Do not execute it against a database whose contents you need to preserve.** The API never runs this script automatically. Put subsequent incremental SQL changes in `db/migrations/` and repeatable demonstration inserts in `db/seeds/`.

Create a dedicated login/user with SELECT permissions on `dbo.CourseGroup` and `dbo.Major`, or ask the database owner for those credentials. Verify the records in your SQL client:

```sql
USE ChronoCampus;
SELECT g.id, g.group_code, m.name, g.admission_year, g.capacity
FROM dbo.CourseGroup AS g
JOIN dbo.Major AS m ON m.id = g.major_id
ORDER BY g.group_code, g.id;
```

## Backend: first terminal

From the repository root, on Linux/WSL/macOS:

```bash
python3 -m venv backend/.venv
source backend/.venv/bin/activate
python -m pip install -e './backend[dev]'
cp backend/.env.example backend/.env
```

Edit `backend/.env`: set your server, port, database, username, and password in `SQLSERVER_CONNECTION_STRING`. Never commit this file. ODBC values containing semicolons must be enclosed in braces, with any closing brace escaped as `}}`. For a local self-signed server certificate only, change `TrustServerCertificate=no` to `yes`; retain certificate verification for deployed environments.

Check the driver and start the API:

```bash
python -c "import pyodbc; print(pyodbc.drivers())"
cd backend
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The driver list must include `ODBC Driver 18 for SQL Server`. Configuration loads from `backend/.env` regardless of the shell's current directory; environment variables override the file.

- API documentation: http://localhost:8000/docs
- Process health: http://localhost:8000/api/health (does not query SQL Server)
- Database-backed groups: http://localhost:8000/api/groups

Missing configuration or database/driver failures return HTTP 503 without exposing connection details.

## Frontend: second terminal

From the repository root:

```bash
cd frontend
npm install
npm run dev -- --host 127.0.0.1 --port 3000 --strictPort
```

Open http://localhost:3000. Expand the administrator login and use `admin@example.com` with the prototype password `password123` (complete the simulated password-change dialog if prompted), then open **Groups & Classrooms → Groups**. Login remains simulated; it does not secure the API.

The API URL defaults to `http://localhost:8000/api`. To change it, copy `frontend/.env.example` to `frontend/.env`, edit `VITE_API_BASE_URL`, and restart Vite. If the frontend origin changes, update the JSON array `CORS_ORIGINS` in `backend/.env` and restart the backend. Only variables prefixed `VITE_` go into the browser bundle; never put database credentials there.

## Verification

From the repository root:

```bash
backend/.venv/bin/python -m pytest backend/tests
npm --prefix frontend run build
curl --fail http://localhost:8000/api/health
curl --fail http://localhost:8000/api/groups
```

The automated API tests substitute database connections; they verify response mapping, empty results, connection cleanup, and sanitized failures. The final curl command and groups screen require a configured live database and provide the integration check. Compare the response against the SQL query above. Stop the backend and reload the groups screen to verify its error/retry state.

## Repository layout

- `frontend/`: existing React interface and API client.
- `backend/app/api/`: HTTP routes; `schemas/`: response models.
- `backend/app/core/`: environment configuration; `db/`: connections.
- `backend/app/services/`: database queries and feature logic.
- `backend/tests/`: API tests.
- `db/`: schema, incremental migrations, and seeds.
- `docs/`: requirements and original university timetable documents.

Implementation references: [FastAPI environment settings](https://fastapi.tiangolo.com/advanced/settings/), [FastAPI CORS](https://fastapi.tiangolo.com/tutorial/cors/), and [pyodbc](https://github.com/mkleehammer/pyodbc).
