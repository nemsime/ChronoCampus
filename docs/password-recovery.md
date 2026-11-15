# SMTP password recovery

ChronoCampus uses Python/FastAPI, SQLAlchemy/pyodbc, SQL Server and React/Vite.
Reset emails use standard SMTP; no Brevo account or provider-specific integration
is required. Local Mailpit captures actual SMTP messages in a browser inbox.
Mailpit does **not** deliver messages to university Outlook inboxes.

## Configuration

Environment variables override `backend/.env`; that file is ignored by Git.

```dotenv
MAIL_MODE=smtp
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASS=
MAIL_FROM="ChronoCampus <no-reply@chronocampus.local>"
FRONTEND_URL=http://localhost:3000
```

For an external sender, enter the authorized provider's host, login, password and
sender address. Port 465 uses implicit TLS. Port 587 uses STARTTLS with certificate
verification. Unauthenticated plaintext is restricted to local Mailpit on port
1025 with host `localhost`, `127.0.0.1`, `::1`, or `mailpit`. Both credentials may
be empty for Mailpit. Existing `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM` and
`PUBLIC_URL` remain accepted aliases; new names take precedence.

Use an HTTPS `FRONTEND_URL` and secure cookies for public hosting. A localhost
link works on the demo machine only. Configure your static host to serve the SPA
for `/reset-password` and omit query strings from access logs for that route. No credentials, message content, token or
password values belong in logs or Git.

## Migration and explicit deletion approval

The current application schema is `0007_dean_suggestions`. Its additive dean
tables do not change password recovery. The approval requirement below applies
when upgrading through `0006_smtp_password_reset` with retained tokens.

Stop the API and workers, take a native SQL Server backup, verify it, and test on
a restored copy first. Migration `0006_smtp_password_reset` refuses to proceed
when tokens exist unless deletion has been explicitly approved. It removes
existing verification/reset tokens and their encrypted mail outbox records and
cancels unfinished referenced mail jobs. Existing users and schedules remain.
Users with unverified registration can request a fresh verification link.

From the repository root, on a new database without existing tokens:

```bash
cd backend
.venv/bin/python -m alembic upgrade head
```

**Only after approval for the named retained database**, from `backend`:

```bash
.venv/bin/python -m alembic -x purge_reset_tokens=yes upgrade head
```

Windows substitutes `.venv/Scripts/python.exe`. In Docker, replace the Python
prefix with `docker compose -f compose.yaml -f compose.mailpit.yaml run --rm --no-deps backend python`.
Do not run the archived database bootstrap. Downgrade cannot restore deleted
links; a backup is required to recover historical tokens/outbox records.

## Local SMTP inbox

Standalone, native API:

```bash
docker run -d --name mailpit -p 127.0.0.1:8025:8025 -p 127.0.0.1:1025:1025 axllent/mailpit
```

Or run the application with its external SQL Server configuration and Mailpit:

```bash
docker compose -f compose.yaml -f compose.mailpit.yaml up -d --build
```

The Docker override supplies `SMTP_HOST=mailpit`; a container's `localhost`
refers to itself. Registration verification still uses the encrypted worker
queue, so initialize its key once with `python -m app.local_runtime init-mail-key`
and keep the I/O worker running. Password reset uses in-memory background SMTP
delivery after the hash-only transaction commits, without persisting raw tokens.
If the API exits before delivery, the user can request another link.

## Behavior

- `POST /api/auth/forgot-password` accepts `{ "email": "..." }`. Valid requests
  always return 202 and the same generic notice, including unknown/inactive/
  unverified accounts, throttled requests and SMTP failure. Invalid input/origin
  and actual database outages are still reported as errors.
- Tokens are 32 random bytes encoded as 64 hex characters. SQL stores only the
  SHA-256 hex digest in `token_hash`. Creation/expiry use the database UTC clock;
  expiry is 30 minutes. Issuing a token invalidates previous unused reset tokens.
- Maximum three issued reset tokens per user in a rolling hour; the IP limit
  silently skips delivery after 30 requests in 15 minutes. Cleanup preserves
  issuance history for at least an hour so expiry cannot defeat the user limit.
- `/reset-password?token=...` captures the token into React memory and removes it
  from the URL. Reloading after removal requires reopening the email link.
- `POST /api/auth/reset-password` accepts `{ "token": "...", "newPassword": "..." }`.
  The existing `password` spelling remains accepted for compatibility.
- Passwords remain salted PBKDF2-SHA256, 600,000 iterations, 12–256 characters.
  The SQL Server procedure atomically claims an unexpired reset-purpose token,
  changes only an active verified account, clears the temporary-password flag,
  consumes other account tokens, and revokes existing `UserSession` rows in the
  same transaction. No password timestamp column or JWT scheme is added.
- SQLite tests have an atomic UPDATE/RETURNING adapter; production SQL Server
  calls `dbo.usp_ResetPassword`. SQL integration tests verify the real procedure.

## Checks

From the repository root:

```bash
backend/.venv/bin/python -m pytest backend/tests -q
backend/.venv/bin/python -m ruff check --isolated --select E4,E7,E9,F backend/app backend/tests backend/alembic
npm --prefix frontend run typecheck
npm --prefix frontend run build
git diff --check
```

For real SQL Server concurrency tests, create and migrate an **isolated** database
named `ChronoCampus_ResetTest_Empty_YYYYMMDD_HHMMSS` or
`ChronoCampus_ResetTest_Legacy_YYYYMMDD_HHMMSS`, point the process's connection
settings to it, and set `CHRONOCAMPUS_RESET_TEST_DATABASE` to exactly that name:

```bash
backend/.venv/bin/python -m pytest backend/tests/test_sqlserver_password_recovery.py -q
```

## Manual test

1. Use a registered, verified, active demo account. Request **Forgot password**.
2. Open `http://localhost:8025`; open the reset email and its link.
3. Confirm the token disappears from the address bar. Enter matching passwords
   of at least 12 characters and submit.
4. Sign in with the new password; check the old password fails and any old session
   requires sign-in again.
5. Reopen the used link: submitting it must produce the generic invalid-link error.
6. Request an unknown address: verify the same public notice, without a new email.
7. Request resets repeatedly: only three new tokens/emails per user per hour;
   requesting a new token invalidates the previous unused link.
8. Stop Mailpit and request a reset: verify the public response is unchanged and
   server diagnostics record only a fixed delivery-failure code.

External inbox delivery requires a functioning authorized SMTP sender and a
separate delivery test with that provider. Successful local Mailpit delivery
proves the application's SMTP/reset flow, not university inbox placement.
