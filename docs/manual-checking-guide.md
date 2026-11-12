# ChronoCampus full manual checking guide

Use this guide to check the current application from installation through publication and recovery. It covers the active React interface in `frontend/src/system` and its FastAPI services. It is a procedure, **not a record of checks already passed**. Record fresh results for the commit and environment you actually test.

The interface labels below use English. Select **English** in the language selector; a fresh browser otherwise defaults to Russian. The other supported languages are Russian and Armenian.

## Contents

1. [Test records and completion rules](#1-test-records-and-completion-rules)
2. [Prepare and start the environment](#2-prepare-and-start-the-environment)
3. [Prepare accounts and test data](#3-prepare-accounts-and-test-data)
4. [Quick smoke pass](#4-quick-smoke-pass)
5. [Authentication, accounts, and password recovery](#5-authentication-accounts-and-password-recovery)
6. [Catalogs and relationships](#6-catalogs-and-relationships)
7. [Calendars, teaching periods, and workload](#7-calendars-teaching-periods-and-workload)
8. [Drafts and generation](#8-drafts-and-generation)
9. [Manual corrections and hard constraints](#9-manual-corrections-and-hard-constraints)
10. [Holiday accounting and emergency makeup](#10-holiday-accounting-and-emergency-makeup)
11. [Publication and concurrent changes](#11-publication-and-concurrent-changes)
12. [Personal timetable and notes](#12-personal-timetable-and-notes)
13. [Private support requests](#13-private-support-requests)
14. [Diagnostics and generation history](#14-diagnostics-and-generation-history)
15. [Runtime and worker recovery](#15-runtime-and-worker-recovery)
16. [Languages, mobile layout, and accessibility](#16-languages-mobile-layout-and-accessibility)
17. [Direct API permission checks](#17-direct-api-permission-checks)
18. [Cleanup and sign-off](#18-cleanup-and-sign-off)

## 1. Test records and completion rules

Use an isolated SQL Server database. These checks change accounts, capacities, rules, and schedules and publish test data. An existing `ChronoCampus_Development` database can contain retained work: confirm it is disposable or use a separate restored copy. Do not run destructive checks against the university's original database.

Create a private results document using this header:

```text
Date/time and timezone:
Tester:
Branch / commit:
Operating system:
Browser / version:
Desktop and mobile viewport sizes:
SQL Server version / isolated database name:
Alembic current revision:
Account IDs and roles (no passwords):
Dataset: demo / small QA fixture / other:
Relevant configuration overrides (no secrets):
Evidence directory or issue links:
```

For each case record `PASS`, `FAIL`, `BLOCKED`, `NOT RUN`, or `N/A`, with evidence and a reason for anything other than `PASS`. `N/A` means the feature/environment is outside the agreed acceptance scope; a missing dependency is `BLOCKED`. Do not count a hidden button as proof that its API is protected.

```text
Case ID | Result | Actual result / HTTP status | Evidence or defect | Reason if skipped
```

Run the smoke pass first, then the feature sections in order. Most cases require the administrator; sections name other roles where needed. Restore each deliberately changed rule before continuing. Keep a baseline published schedule and use new drafts for experiments.

Completion requires all in-scope cases to pass or have an explicitly accepted defect/limitation. Unauthorized disclosure, lost saved changes, invalid publication, and incorrect hours prevent acceptance. Record Windows and Linux, SQL Server, university SMTP, HTTPS hosting, and optional monitoring separately; success on one environment does not prove another.

## 2. Prepare and start the environment

### Prerequisites and configuration

- Python 3.11+, Node.js 20.19+ or 22.12+, a reachable SQL Server, unixODBC on Linux, and Microsoft ODBC Driver 18. See [README setup](../README.md#run-locally-on-windows-or-linux) for installation links.
- Create an empty isolated database, or restore a backup into an isolated database. Apply Alembic migrations with an account permitted to change its schema. Do not run the archived destructive `db/ChronoCampus.sql` as an upgrade.
- For a fresh checkout, install dependencies with the commands below. Copy `.env.example` only when `backend/.env` does not already exist; preserve existing private configuration.

Windows PowerShell, from the repository root:

```powershell
python -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -e './backend[dev]'
if (-not (Test-Path backend/.env)) { Copy-Item backend/.env.example backend/.env }
npm --prefix frontend ci
```

Linux, from the repository root:

```bash
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -e './backend[dev]'
if [ ! -f backend/.env ]; then cp backend/.env.example backend/.env; fi
npm --prefix frontend ci
```

Edit `backend/.env` privately before continuing:

| Setting | Local check value / purpose |
| --- | --- |
| `SQLSERVER_CONNECTION_STRING` | Point to the isolated database; verify its `DATABASE` value before writing data. |
| `PUBLIC_URL` | `http://localhost:3000` for the steps below. |
| `CORS_ORIGINS` | Include the chosen frontend origin, e.g. `["http://localhost:3000"]`. |
| `COOKIE_SECURE` | `false` for local HTTP; HTTPS deployment needs `true`. |
| `UNIVERSITY_EMAIL_DOMAINS` | Include the test account domain; `["example.invalid"]` is for fictional local accounts. |
| `MAIL_MODE` | `file` for local recovery checks; messages stay in `backend/.mail`. |
| Job settings | Keep defaults initially; record any overrides used in recovery tests. |

`example.invalid` does not deliver mail. File mode allows local recovery testing without contacting a mail server. Do not put passwords, mail keys, connection strings, or reset links in the results document.

### Migrate, create the administrator, and start

Stop an older local runtime before applying migrations. On a fresh isolated database, use one of these sequences. Enter the administrator password at the hidden prompt; choose a private password of 12–256 characters.

Windows PowerShell:

```powershell
Push-Location backend
.venv/Scripts/python.exe -m alembic upgrade head
.venv/Scripts/python.exe -m alembic current
.venv/Scripts/python.exe -m app.manage create-admin qa.admin@example.invalid --name "QA Administrator"
Pop-Location
powershell -ExecutionPolicy Bypass -File scripts/local.ps1 init-mail-key
powershell -ExecutionPolicy Bypass -File scripts/local.ps1 start
powershell -ExecutionPolicy Bypass -File scripts/local.ps1 status
```

Linux:

```bash
cd backend
.venv/bin/python -m alembic upgrade head
.venv/bin/python -m alembic current
.venv/bin/python -m app.manage create-admin qa.admin@example.invalid --name 'QA Administrator'
cd ..
backend/.venv/bin/python -m app.local_runtime init-mail-key
backend/.venv/bin/python -m app.local_runtime start
backend/.venv/bin/python -m app.local_runtime status
```

For an already prepared database, reuse its administrator rather than recreating it. The current migration head is `0004_jobs`; follow `alembic upgrade head` if future migrations are added.

Open <http://localhost:3000> and keep that hostname throughout. Browser sessions on `localhost` and `127.0.0.1` are separate. The launcher starts an API, generation coordinator, mail/maintenance worker, and Vite, with a supervisor and a temporary solver during generation. Starting only the API and frontend leaves generation and mail jobs unprocessed. The root Docker Compose file is not a complete launch path.

Open browser developer tools with Console and Network available. Enable preservation of network logs if useful, but redact private data before sharing evidence. API reference: <http://localhost:8000/docs>.

| ID | Action | Expected result |
| --- | --- | --- |
| ENV-01 | Open the frontend and `http://localhost:3000/api/health`. | Login page renders; health returns HTTP 200 and `{"status":"ok"}` through the frontend proxy. |
| ENV-02 | Open `http://localhost:3000/api/ready`. | HTTP 200 and `{"status":"ready"}`; database connectivity and required schema are available. Health alone is insufficient. |
| ENV-03 | Run launcher `status`, then `start` again. | Existing owned group remains healthy; no duplicate API/coordinator/IO/frontend group appears. |
| ENV-04 | Log in with the CLI-created administrator and finish the required password change. | Other application pages remain restricted until the change; successful change signs out; new password signs in. |

## 3. Prepare accounts and test data

Use the demo for broad acceptance, or build the smaller fixture for predictable counts and focused negative cases. Both approaches use real SQL Server through the normal application. Do not assume a reseed resets an edited dataset.

### Option A: existing demonstration dataset

The seed accepts only `ChronoCampus_Development`. Run it after migrations, from `backend`:

```powershell
.venv/Scripts/python.exe -m app.manage seed-demo
```

Linux equivalent:

```bash
.venv/bin/python -m app.manage seed-demo
```

Read current random passwords privately from ignored `backend/.demo-credentials.json`. Every seed run reuses demo account records but resets their passwords and revokes their sessions; it replaces the file with the current credentials.

| Role / resource | Demo value |
| --- | --- |
| Administrator | `admin.demo@example.invalid`; seeded admin does not require a first-login change. |
| Lecturers | `teacher1.demo@example.invalid` through `teacher12.demo@example.invalid`. |
| Students | `student1.demo@example.invalid` through `student5.demo@example.invalid`. |
| Cohorts | `DEMO-1-26` through `DEMO-4-26` full-time; `DEMO-5-26` part-time. Each student belongs to the corresponding cohort's first subgroup/lab subgroup. |
| Semesters | `DEMO autumn 2026 · present` and `DEMO autumn 2026 · remote`. |
| Semester / teaching dates | 2026-09-01–2027-01-29 / 2026-09-01–2026-12-18. |
| Holiday | 2026-09-21; exempt policy. |
| Rooms | `D001`–`D004` lecture halls; `D005`–`D008` labs; `D009`–`D012` classrooms. |

These dates, hours, names, and part-time settings are illustrative. Their origin and limits are in [demo-data.md](demo-data.md). Choose the actual demo dates in Timetable filters even if today's default range is elsewhere. Generation across all demo cohorts can take the configured search budget plus preparation; use one cohort first.

### Option B: small reproducible QA fixture

Create the following in **Data & rules** in dependency order. Prefix names with a unique run label such as `QA-20261112-A` so other test records are easy to distinguish. Record generated IDs; never assume IDs start at 1. Use a unique unused positive major/building code if the database already contains data.

| Order | Resource | Values |
| --- | --- | --- |
| 1 | Faculties → Majors | One QA faculty/code; one full-time major (`present`), duration 4. |
| 2 | Cohorts | `QA-C1`, admission year 2026, capacity 20, QA major. |
| 3 | Subgroups → Lab subgroups | `QA-A` and `QA-B`, capacity 10 each; two lab subgroups of 5 under each. |
| 4 | Users | Two active lecturers, `qa.teacher1@example.invalid` and `qa.teacher2@example.invalid`; two active students, `qa.student.a@example.invalid` in A/first lab and `qa.student.b@example.invalid` in B/first lab. Assign the cohort and hierarchy correctly. Set private temporary passwords. |
| 5 | Buildings → Equipment | One QA building; equipment `QA projector`. |
| 6 | Rooms | `QA-L1`: lecture hall, capacity 40, projector. `QA-P1`: classroom, capacity 20, projector. `QA-LAB1`: lab, capacity 10, projector. Give each valid floor/room-on-floor values. |
| 7 | Subjects | `QA Lecture`, `QA Practical`, `QA Lab`. |
| 8 | Timetable grids | Full-time; first start 09:30, lessons 80 minutes, default break 10, break after lesson 2 = 30; Monday–Friday; 4 ordinary lessons; closing time 19:00; 2 academic hours/lesson; academic hour 40 minutes; teaching weeks 2; lecture order Same day; default weights; Rules confirmed. |
| 9 | Semesters | QA semester, academic year `2026/2027`, 2026-09-07–2026-09-25, QA grid, holiday policy Exempt, search budget 5 seconds for this small fixture, Rules confirmed. |
| 10 | Teaching periods | QA semester, all cohorts or QA-C1, 2026-09-07–2026-09-18. No holidays, availability rules, or extra permissions initially. |
| 11 | Workload | Three components, all QA semester/C1/teacher1: whole-cohort lecture, A-only practical, first lab of A-only lab. Each has 4 semester hours, its corresponding subject, and requires the projector. Set assessments to None. |

Complete first-login password changes for the four ordinary accounts before role checks. Use separate browser profiles or separate browsers for administrator, student A, student B, and lecturer; private windows in the same browser can share a session with one another.

With no other published occupancy using these resources, the fixture has **six required lesson occurrences and 12 required academic hours**. A complete, nonholiday schedule has two occurrences per workload and zero remaining hours. Student A and teacher1 see six lessons; student B sees the two whole-cohort lectures; teacher2 sees none. Use the full 2026-09-07–2026-09-18 range and clear filters when checking these counts. The exact placement can vary.

For the capacity-repair regression, move both lectures into `QA-L1` at free times before publishing the baseline. Afterward add a second lecture hall `QA-L2`, capacity 40 with projector, for repairs. Lecture lessons can also use classrooms, so merely creating `QA-L1` does not guarantee the solver assigns it.

Keep this fixture ledger in the private results:

```text
Term / grid / cohort IDs:
Student A / student B / teacher1 / teacher2 IDs:
Room IDs, original capacities/equipment:
Workload IDs and expected hours:
Baseline published version ID:
Working draft ID and latest revision:
Two lecture occurrence IDs with date / slot / room:
Note ID / support thread ID used for privacy checks:
```

Create additional disposable cohorts, terms, calendars, or workloads when a case calls for them. Once a draft materializes workload occurrences, changing the workload itself is restricted; build variants before creating their drafts.

## 4. Quick smoke pass

This is the short path for detecting a broken environment. A smoke pass does not replace the full guide.

1. Pass ENV-01–ENV-04; verify login and readiness.
2. In Data & rules, create, edit, refresh, and delete an unused QA subject (CAT-01).
3. Prepare one valid semester/cohort with workload; create and generate a draft (GEN-01–GEN-03).
4. Confirm exact hours, zero unresolved occurrences, and a complete report. Save one valid move and pin it; regenerate and check the pin (MOVE-01–MOVE-03).
5. Publish the valid draft (PUB-01); sign in as student and lecturer and check their published lessons (VIEW-01).
6. Save/reopen a student note and create a support request. Reply and change status as administrator (NOTE-01 and SUP-01–SUP-03).
7. Check an ordinary account receives 403 on an administrator API (API-02), then log out and check a private endpoint returns 401 (AUTH-05).
8. Repeat the core timetable/note flow in RU/HY/EN and at a 390-pixel viewport (UX-01 and UX-03).

## 5. Authentication, accounts, and password recovery

### Login and account management

| ID | Steps | Expected result |
| --- | --- | --- |
| AUTH-01 | At Sign in, submit empty fields, malformed email, wrong password, and an unknown email. Use a few attempts only. | Required/format errors are clear. Wrong/unknown credentials both receive HTTP 401 `invalid_credentials`; no authenticated content is shown. |
| AUTH-02 | Sign in as each role; use Show/Hide password; refresh the browser. | Password visibility control works; session restores. All roles have Timetable, Support, Account. Only admin has Planner, Data & rules, Diagnostics. Fresh admin login opens Planner; a restored session may open Timetable. |
| AUTH-03 | Create a student with a temporary password; sign in and try navigating to the timetable or calling its API before changing it. | Account/password-change screen is required; protected feature API returns 403 `password_change_required`. Password change/logout remain available. |
| AUTH-04 | In Account, try wrong current password, mismatched confirmation, and a new password shorter than 12 characters. Then change correctly. Keep a second session open for that account. | Invalid submissions do not change password. Success signs out; old password fails; new password works; the second old session cannot read private data. |
| AUTH-05 | Log out, refresh, press browser Back, and request `/api/auth/me` and `/api/schedule/facets`. | No usable authenticated session remains; protected requests return 401. Browser history cannot retrieve fresh private data. |
| AUTH-06 | As admin, edit a disposable user's display name without entering a password. Retry a request in that user's existing session. | Name persists; password remains unchanged, but the existing session is revoked. Signing in again works. All user edits revoke that user's sessions. |
| AUTH-07 | Edit a disposable user and enter a new temporary password in the Password field. | Existing sessions are revoked; old password fails; new temporary password requires a password change. There is no separate reset-password dialog in Data & rules. |
| AUTH-08 | Deactivate an otherwise unused user through Active; test old session and login. Reactivate afterward. | Old session is rejected; inactive login gets 401. Users are deactivated, not deleted. |
| AUTH-09 | Try deactivating/demoting the currently signed-in admin; try deactivating/demoting a lecturer with workload. | HTTP 409 `cannot_disable_self` / `teacher_has_workload`; original role/active state persists. Use disposable records and restore after permitted role changes. |
| AUTH-10 | Using a fresh test email address with no recent attempts, make nine login attempts within 15 minutes. An unknown disposable address is sufficient. | Ninth email-based attempt is limited with HTTP 429. Stop and use another address/account for subsequent checks; do not repeatedly retry the administrator. |

### Password recovery with local file mail

Preconditions: `MAIL_MODE=file`, allowed test email domain, initialized mail key, running IO worker. Read captures privately in `backend/.mail`; wait for worker processing rather than assuming a file appears synchronously with the HTTP response.

| ID | Steps | Expected result |
| --- | --- | --- |
| RESET-01 | Use Forgot password for an active allowed-domain account and a nonexistent address in that domain. | Both return HTTP 202 with `reset_requested` and the same public notice. Only the eligible existing account produces a usable reset message. |
| RESET-02 | Request recovery for an inactive account and an address outside the configured domains. | Generic notice remains; no usable recovery mail is delivered for either account. |
| RESET-03 | Open the captured link, whose token is in `#reset=…`. Before submitting it, verify the old password in another browser. | Link opens new-password/confirmation form. Opening it alone does not change the password. Keep the link out of screenshots and reports. |
| RESET-04 | Submit mismatched/too-short values, then a valid new password. | Invalid values are rejected. Valid reset returns 204, clears the URL fragment, returns to Sign in, and requires login with the new password. Old sessions and outstanding reset tokens are revoked. |
| RESET-05 | Reuse the successful link; try a malformed token. Test an unused link after its configured lifetime. | Used, malformed, and expired tokens cannot reset a password; validly shaped but unusable tokens return 400 `invalid_reset_token`. Default lifetime is 30 minutes. Record the expiry case as NOT RUN if no expired token was actually tested. |
| RESET-06 | In a disposable environment, request recovery while mail configuration is invalid; restore it and repeat. | Configuration failure is reported (503) without revealing whether the account exists; restored configuration permits delivery. Do not delete or replace existing keys to simulate this. |

## 6. Catalogs and relationships

For every catalog: add a valid disposable row, reopen it, edit a nonidentity field, save, refresh, and verify persistence. Delete it only while unused and where deletion is supported. A canceled dialog or canceled delete must leave the record unchanged. Expected successful API statuses are create 201, update 200, delete 204; invalid input/reference usually 422, duplicate/in-use database conflict 409.

| ID | Resource / action | Expected result |
| --- | --- | --- |
| CAT-01 | Subjects: create `QA subject temporary`, rename, refresh, cancel deletion, then confirm deletion. | Changes persist; canceled deletion keeps it; confirmed deletion removes it; unrelated subjects remain. |
| CAT-02 | Faculties and Majors: save a major under its faculty; test missing name/code, invalid faculty reference, invalid duration and study form. | Valid relation persists; invalid data is not saved. Internal `present` / `remote` mean full-time / part-time. |
| CAT-03 | Cohorts: save major/admission year/code/capacity; try zero capacity and changing major/year after workload exists. | Positive-capacity record persists; invalid capacity fails; identity change with workload returns 409. |
| CAT-04 | Subgroups and Lab subgroups: try totals exceeding the parent, reducing parent below child totals, and changing an existing child's parent. | Excess capacity is rejected; parent change returns 409 `group_parent_immutable`; valid sibling capacities remain intact. |
| CAT-05 | Users: create each role; try student without cohort, lab outside its subgroup, subgroup outside cohort, and lecturer/admin with student membership. | Valid accounts save; inconsistent membership fails. Changing cohort clears subgroup/lab selections; changing subgroup clears lab selection. New user requires a password despite the shared field being optional when editing. |
| CAT-06 | Buildings and Rooms: test building reference, number, floor, capacity, room type, and equipment selection. | Valid values/equipment persist after reopening. Invalid references/capacity are rejected; all four room types can be selected. |
| CAT-07 | Equipment: create a projector, select it on a disposable room and workload, then reopen both. | Selected IDs persist; unknown equipment IDs are rejected; deleting an in-use item cannot silently break references. |
| CAT-08 | Timetable grids and Semesters: edit each field and inspect saved values; cancel another edit. | Only saved values persist. Detailed fields are available in Edit even when omitted from table summaries. Rule-specific checks are in section 7. |
| CAT-09 | Teaching periods, Holidays, Extra lesson permissions: create valid term-bound entries; try dates outside the term or a reversed interval. | Valid records persist; invalid bounds are rejected. A cohort-specific period can be distinguished from an all-cohort period. |
| CAT-10 | Availability & preferences: choose lecturer only, then room only; try neither, both, nonlecturer ID, and reversed date/time range. | Exactly one valid resource is required; weekday/parity and hard/soft type persist; invalid entries are rejected. |
| CAT-11 | Workload: add/open/edit an unused component, then create its draft and attempt a substantive edit. | Unused component can be edited; once occurrences exist, edits return 409 `workload_has_occurrences`. Use a new fixture for a changed curriculum. |
| CAT-12 | Search using a name and a resolved reference label; try no matches; clear search; paginate a resource with more than 25 rows. | Result count/filtering is accurate; clear restores rows; search/resource changes reset to page one; pages have no duplicate/missing rows. |
| CAT-13 | Submit blank required strings, numeric bounds violations, and duplicates where the schema requires uniqueness. Delete a referenced parent. | Clear rejection; no half-created row or unrelated damage; errors contain no raw SQL/driver details. |
| CAT-14 | Refresh catalogs after another admin changes a record; test failed save and retry. | Saved server state is shown; failure is visible and preserves a recoverable form. Do not infer persistence from the form closing alone. |

### Room deletion regression

1. Create temporary equipment and an unused room containing it. Delete the room. Expect 204, room absent after refresh, equipment still in the equipment catalog.
2. Add the equipment to a room **actually assigned** in a draft/published schedule. Record its equipment IDs.
3. Attempt deletion. Expect 409; refresh/reopen the room. It must remain with all equipment associations preserved.
4. Check audit: failed deletion must not appear as a successful committed deletion. Remove the temporary equipment selection and clean up the unused equipment.

Record this sequence as **CAT-15**. Creating a room without assigning a lesson does not exercise the in-use case.

## 7. Calendars, teaching periods, and workload

Use disposable copies of rules or record and restore original values. Validate the resulting report as well as the form's save response; some combinations are accepted as configuration but intentionally block generation/publication.

| ID | Steps | Expected result |
| --- | --- | --- |
| RULE-01 | Save/reopen the QA grid and inspect its slot preview. | Slots 1–6: 09:30–10:50, 11:00–12:20, 12:50–14:10, 14:20–15:40, 15:50–17:10, 17:20–18:40. Extra slot times are calculated, not hard-coded. Preview reflects saved values; save/reopen after changes. |
| RULE-02 | Change first start, lesson duration, default break, and break override separately; save/reopen each. Test a late start that would push a lesson past midnight, and closing time at/before first start. | Preview and newly assigned lesson times follow saved settings. Closing time at/before first start is rejected on save. A grid can save with unusable late slots; those slots are omitted from preview and assignments beyond midnight/closing are rejected. Existing assignments can become invalid and need repair. |
| RULE-03 | Try duplicate/out-of-range weekday values through the API, invalid break overrides, and objective weights outside 0–100. | HTTP 422; saved grid remains unchanged. UI weekday controls map Monday=0 through Sunday=6. |
| RULE-04 | Unconfirm a calendar/term, or omit academic hours; inspect generation/report and publication. Then confirm valid values. | Missing confirmation/required academic settings are reported; no invalid publication succeeds. Confirmed grid without hours/lesson or confirmed term with unconfirmed holiday policy cannot save. |
| RULE-05 | On a separate term with workload, omit all teaching periods, create a draft, and generate. Add a valid period and regenerate. | Missing explicit teaching periods blocks a valid complete result/publication. Adding a period resolves that cause. Semester boundaries alone do not authorize teaching. |
| RULE-06 | Try placing a lesson on 2026-09-21 in the QA term: inside semester but outside its teaching period. Also try outside-semester and nonteaching weekday dates. | Each prohibited date is rejected; exam-only dates are not ordinary teaching dates. |
| RULE-07 | Set a cohort-specific teaching period in addition to a wider all-cohort period. | That cohort uses its specific periods instead of inheriting the wider fallback. Other cohorts retain the term-wide fallback. |
| RULE-08 | Make distinct teaching-week count differ from configured `teaching_weeks`; generate/inspect. | Report diagnoses `teaching_week_count_mismatch`; restore a matching count before publication. |
| RULE-09 | In a two-week variant beginning Tuesday 2026-09-01, inspect first partial week and week beginning 2026-09-07; add a holiday. | First partial calendar week is numerator, next denominator; holiday does not shift parity. Set teaching periods/week count consistently for this variant. |
| RULE-10 | Configure a separate part-time major/cohort/grid/term and workload; change only full-time bell times. | Part-time dates/bell times stay independent. Cross-form workload is rejected; Planner cohort choices follow semester study form. |
| RULE-11 | Create workload with 3 semester hours when a lesson is 2 academic hours; try zero hours, inactive/nonlecturer teacher, wrong hierarchy or equipment ID. | Invalid values are rejected; no silent rounding of fractional lessons. |
| RULE-12 | Before materializing occurrences, use 4 hours / 2 hours per lesson; also test a valid uneven workload over its teaching weeks. | First case creates two occurrences; other volumes preserve exact required hours without assuming every workload is weekly. Remaining hours match unresolved occurrences. |
| RULE-13 | Set assessment Exam or Credit on a disposable component and generate. | Assessment is retained; it does not cause automatic exam scheduling or replace the component's lesson type/hours. |
| RULE-14 | Add hard teacher unavailability and room closure; then add a preferred interval only. | Generation/moves obey hard closures. Preference is a soft objective and may be unmet; no claim of guaranteed preference satisfaction or optimum is made. |

## 8. Drafts and generation

Use **Planner → Create draft**. Record semester, selected cohorts, draft ID/revision, algorithm, seed, budget, and run ID. A run completing successfully does not publish it.

| ID | Steps | Expected result |
| --- | --- | --- |
| GEN-01 | Open Create draft; try missing name/semester/no cohort. Change semester after selecting a cohort. | Required choices are enforced; semester change clears selections and offers compatible cohorts. Cohort with no workload cannot yield a valid draft. |
| GEN-02 | Create a named draft for the valid fixture and refresh/reselect it. | Draft persists. Initial publication remains unchanged. A replacement draft copies the selected cohorts' current published assignments. |
| GEN-03 | Select CP-SAT, seed 7, Generate timetable. Follow current-run details to a terminal result. | Request returns 202; queued/running progress, stage, run ID and attempts appear. Small valid fixture becomes complete; six occurrences/12 hours, zero holiday/remaining hours. Capture actual outcome rather than assuming completion from elapsed time. |
| GEN-04 | Reload/close and reopen Planner during generation; switch to another draft and back. | Durable job continues; correct draft/run is shown; late responses from an old selection do not overwrite current selection. |
| GEN-05 | Record placed lessons, required/planned/canceled/remaining hours, unplaced occurrences, reasons, solver status and timings. | Counts agree across report and lesson list. `FEASIBLE` means a valid solution was found, not proof of optimality. Search budget excludes some preparation time. |
| GEN-06 | Run Greedy + local on a comparable draft; record the same seed and budget. | Algorithm is identified correctly; result independently validates. Either algorithm may return partial on constrained data. Compare quality only with matching substantive inputs. |
| GEN-07 | Use a variant requiring equipment no compatible room has; generate. | Incomplete outcome and diagnostic reasons are visible; missing hours remain; publication is unavailable and direct publish fails. A time limit alone does not prove infeasibility. |
| GEN-08 | While a run is active, try a second distinct generation request for that draft. | UI prevents duplicate work; direct request returns 409 `generation_already_running`. No second active run is created. |
| GEN-09 | Cancel a queued job, then a sufficiently long running job. | Cancellation is visible; final status is `cancelled`. Running solver is stopped before draft is released; edits/generation become available after terminal cancellation. |
| GEN-10 | After preparation/snapshot has begun, change a catalog input from another admin session. Wait for the old run. | Old result becomes `stale` and does not replace newer draft state. Regeneration uses current inputs. A catalog change while still queued can instead be included when first claimed; it does not reliably test staleness. |
| GEN-11 | While draft A generates, save a valid lesson move in inactive draft B or create an unrelated draft. Separately, while A generates, PUT a valid assignment change in A through its assignment API using its current revision (UI edits are disabled during a run). | B's edits/unrelated draft creation alone do not stale A. The assignment PUT in A advances A's revision and invalidates its old result. Shared catalog changes and publication can invalidate snapshots. |
| GEN-12 | Optional API check: repeat the exact generation body with the same actor and `idempotency_key` (16–80 characters). Reuse the key with a different seed. | Identical replay returns the original run ID, including after completion; no extra job. Different body returns 409 `idempotency_key_conflict`. See section 17 for replay method. |

Run states to recognize:

| State | Meaning / next check |
| --- | --- |
| `queued`, `running`, `retry_wait` | Active durable job; pending work, current attempt, or bounded retry. |
| `complete` | Full independently validated result; review and publish separately. |
| `partial` | Unresolved required lessons; inspect reasons and repair/regenerate. |
| `rejected` | Validator/pins rejected the result; inspect the report. |
| `stale` | Inputs/draft changed; old result was not applied. |
| `failed` | Execution/admission failure; use request ID, attempts and diagnostics. |
| `cancelled` | Cancellation completed and draft released. |
| `interrupted` | Historical status from before durable jobs; do not require it for current recovery. |

Durable job state and run state differ: a partial solver result can have job state `succeeded`, while its schedule remains unpublishable.

## 9. Manual corrections and hard constraints

Use a complete **draft**, not its published baseline. Click a lesson's Edit action; choose Date, Lesson number, Room, and optionally **Pin time and room**. No drag-and-drop is required. Save/reopen after each positive change; after a rejection, verify the previous successful assignment remains intact.

| ID | Steps | Expected result |
| --- | --- | --- |
| MOVE-01 | Move an unpinned lesson to a known free valid date/slot/room, save and refresh. Cancel another edit. | Valid move returns 200, persists, and updates times/report; canceled edit leaves no change. |
| MOVE-02 | Pin date/slot/room, regenerate, and inspect the same occurrence ID. | All three remain fixed; pin badge persists. |
| MOVE-03 | Explicitly edit a pinned lesson to a new valid assignment and uncheck Pin; regenerate. | Explicit edit can move/unpin that occurrence; all other pins remain protected. An unpinned lesson is allowed to move on regeneration. |
| MOVE-04 | Move into a room too small for the actual audience. Check cohort, subgroup and lab capacities separately. | Capacity conflict rejected; capacity uses the lesson's audience, not always the entire cohort. |
| MOVE-05 | Put lecture in lab, practical in lecture hall, and lab in classroom; remove required equipment from otherwise usable room. | Invalid room type/equipment is rejected. Lecture allows lecture hall/classroom; practical allows classroom/lab/language lab; lab allows lab/language lab. |
| MOVE-06 | Overlap another lesson using the same teacher, room, or whole cohort. | Each conflict rejected, including actual clock-time overlaps across different grids/slot numbers. |
| MOVE-07 | Overlap a whole-cohort lesson with its subgroup/lab; overlap subgroup with its child lab. Then arrange disjoint sibling audiences using different teachers/rooms. | Ancestor/child conflicts rejected. Disjoint siblings may overlap when other constraints allow. Add disposable workloads before creating this variant's draft. |
| MOVE-08 | Move into hard teacher unavailability or room closure, including selected parity/day restriction. | Overlapping restricted intervals rejected; an unrelated allowed date remains usable. |
| MOVE-09 | Move into slot 5 without permission; add a matching permission for that date/cohort/time and retry. Test too-short permission window and wrong weekday/cohort. | Extra slot requires explicit matching permission containing the full lesson interval. Invalid windows do not authorize it; valid permission still obeys all other rules. |
| MOVE-10 | Set closing time before slot 6 ends; replay a valid assignment PUT with `slot: 6`, matching extra permission and current draft revision. | Operating-hours conflict rejected; permission does not override closing time. Newly opened dialogs omit the invalid slot, so use API replay for the server check. Restore original closing time. |
| MOVE-11 | On a partial result, use Edit on an unresolved occurrence to place it in a valid free slot. | Assignment saves, unresolved count and remaining hours decrease; only full validity enables publication. |
| MOVE-12 | Open the same draft in two admin sessions; save a move in A and submit B's old dialog. | B's stale revision receives 409 and does not overwrite A. Refresh/reopen before retrying. |

### Repair several invalid lessons one at a time

This regression needs two lectures assigned to `QA-L1` and the spare compatible `QA-L2` from section 3.

1. Create a replacement draft of the complete baseline. Record both lecture occurrence IDs and the original room capacity (40).
2. Reduce `QA-L1` capacity below the whole cohort, e.g. 10 for a cohort of 20. Refresh Planner. Expect at least two capacity errors and blocked publication.
3. Move one affected lecture to free `QA-L2` with sufficient capacity/equipment. Expect 200; that correction persists although the second lecture is still invalid.
4. Try moving the remaining lecture into a teacher/cohort conflict or another undersized room. Expect 409; no rejected change is saved. A pre-existing unrelated error must not excuse a new error involving the edited lesson.
5. Repair the remaining invalid lectures individually. Expect completeness and zero remaining hours once all issues are fixed; publish the repaired draft if needed for later cases.
6. Restore the original room capacity. Record actual room assignments and publication/version IDs.

Record this as **MOVE-13**. Bell-time changes can also invalidate several lessons; repairs must respect other lessons' stored time intervals.

## 10. Holiday accounting and emergency makeup

Run these on dedicated variants so changing a holiday does not disrupt the baseline used for notes/publication. Record each occurrence ID, required hours, planned hours, canceled hours and remaining hours before and after.

For a deterministic holiday fixture, create a separate QA cohort/semester and a grid with only Monday selected, two teaching weeks, four ordinary slots, and two academic hours per lesson. Use 2026-09-07–2026-09-18 for semester and teaching period, a single 4-hour whole-cohort lecture, confirmed rules, Exempt policy, and a holiday on Monday 2026-09-14. Use a lecturer and compatible equipped room with no competing publication. Generation must account for two occurrences: 2 planned hours on 2026-09-07 and 2 canceled hours on 2026-09-14, with zero remaining. Use the normal weekday fixture for emergency cases.

| ID | Steps | Expected result |
| --- | --- | --- |
| HOL-01 | Generate the Monday-only holiday fixture described above with Exempt policy. | Two occurrences: one planned, one visibly canceled; 2 planned + 2 holiday-canceled = 4 required hours, zero remaining. Canceled hours are not delivered hours, and no holiday makeup is added. |
| HOL-02 | Try moving an ordinary, noncanceled lesson onto the holiday. | 409 `manual_holiday_move`; ordinary lessons cannot manufacture exempt holiday credit. |
| HOL-03 | In a strict-policy variant, add a holiday and generate. | No ordinary teaching is placed on the holiday; no exempt canceled-hour credit is fabricated. Required hours still need valid placements, or result remains incomplete. |
| HOL-04 | On a pinned lesson, try Emergency cancellation; then try a holiday-canceled lesson. | UI disables action; direct calls reject with `unpin_before_cancellation` / `holiday_not_emergency`. |
| HOL-05 | On an unpinned ordinary lesson, expand Emergency cancellation, enter a reason, and confirm. Generate without extra permission for that date. | Assignment is removed; occurrence remains required; missing replacement makes report incomplete and publication fails. Required reason is enforced. |
| HOL-06 | Add an extra permission for the original date, slot 5 (above the grid's 4 ordinary slots), 15:50–17:10, correct cohort. Ensure free room/teacher/audience; regenerate. | Replacement stays on the original date, uses an explicitly allowed extra slot, and restores required hours. It cannot be moved to another date or ordinary slot. |
| HOL-07 | Conflict the permitted makeup slot with another lesson, closure, insufficient capacity, equipment or operating end. | Permission does not override any hard constraint; unresolved makeup keeps publication blocked. |

## 11. Publication and concurrent changes

Keep student/lecturer browsers open on the baseline while the admin prepares replacements. Use explicit timetable refresh after publication; Support has different refresh behavior.

| ID | Steps | Expected result |
| --- | --- | --- |
| PUB-01 | Publish a complete valid draft and confirm the dialog. Refresh all roles. | Current revision is checked; version becomes published; selected cohorts' personal timetables now show it. Complete generation alone had not changed their timetables. |
| PUB-02 | Create and edit a replacement draft without publishing; cancel a publish confirmation. | Previous publication remains visible to ordinary users; cancel leaves draft unpublished. |
| PUB-03 | Try publishing a partial/invalid draft, including through a direct API request when the button is disabled. | 409 `publication_blocked` with report; previous publication unchanged. |
| PUB-04 | Change a relevant room/calendar/availability rule after obtaining a complete report; submit publish without relying on the old display. | Server revalidates current constraints transactionally and rejects an invalid result. Refresh displays current issues. |
| PUB-05 | On a published version, try editing, emergency cancellation, and republishing through API replay. Try a fresh generation request with no idempotency key or a new key. | Editing controls are absent/disabled; new writes return 409 `published_version_immutable`. Replaying an original generation key can still return its original run, without mutating the version. Use Create draft for further changes. |
| PUB-06 | Publish a replacement for one cohort while another cohort/term already has a publication. | Only selected term/cohort pointers change. Other published occupancy remains visible and constrains generation/moves. |
| PUB-07 | Prepare separate cohort drafts sharing teacher/room time; publish one, then try publishing the conflicting other draft. | Second publication is rejected for external occupancy; different grid slot numbers do not bypass real time overlap. |
| PUB-08 | With two admins and disposable drafts that conflict with each other but not existing publications, submit publication as concurrently as practical. | At most one conflicting publication succeeds. Record request statuses and assignments; a sequential attempt does not prove race protection. For repeatable SQL concurrency coverage, use the opt-in SQL Server test described in README. |
| PUB-09 | Publish with an old revision after another admin edits the same draft. | 409 `stale_revision`; no lost newer changes or publication of an outdated request. |

## 12. Personal timetable and notes

### Timetable

The active Timetable is a dated lesson list, paginated at 25 rows. Set a range of **1–31 inclusive days**; to inspect a longer semester, use adjacent ranges. Select 2026-09-07–2026-09-18 for the small fixture. Clear filters before verifying fixture totals.

| ID | Steps | Expected result |
| --- | --- | --- |
| VIEW-01 | Compare admin, lecturer1, student A and student B against the same current publication. | Admin sees current publications; lecturer only assigned teaching; students see whole-cohort plus their subgroup/lab lessons. QA baseline counts: 6 / 6 / 6 / 2; unrelated lecturer sees none. |
| VIEW-02 | Inspect one lecture, practical and lab card. | Correct date/weekday, start/end, slot, numerator/denominator, type, subject, teacher, room, cohort and subgroup/lab; pinned/canceled badges match assignment. |
| VIEW-03 | Filter by semester/cohort/lecturer/room/subject/type, combine filters, then clear. Use a subject occurring beyond the first page on a larger dataset. | Filters cover authorized published data across all pages; names/counts and results agree. Guessed filter IDs do not broaden access. |
| VIEW-04 | Use same start/end, 31 inclusive days, 32 inclusive days, empty/reversed range. | First two are allowed; invalid range shows guidance and no misleading results. API rejects invalid date ranges with 422. |
| VIEW-05 | On a dataset with more than 25 matches, use Next/Previous; change filters/date range while on a later page. | Stable ordering, no duplicates/omissions; filter/range changes reset pagination. Repeated next/previous does not mix earlier results. |
| VIEW-06 | Leave timetable open, publish a replacement elsewhere, then use Refresh, window focus, and normal polling. | Latest publication appears. Normal timetable refresh is every 30 seconds and on focus; stale cursor resets safely to first page. |
| VIEW-07 | Test before any publication, then a date/filter with no matching lessons after publication. Simulate a temporary read/network failure and retry. | No-publication, no-match and failure states are understandable; failure is not presented as a successful empty schedule. |
| VIEW-08 | Change a student's membership as admin while its old timetable browser remains open; issue another read. | Old session is revoked; new login uses new membership and authorized facets. Responses do not expose old/unrelated rows. Check `Cache-Control: private, no-store` in Network. |

### Personal notes

Notes are attached to a stable occurrence ID, not a date or assignment-row ID. The UI offers create/edit/delete through the lesson's note action; there is no separate notes list page.

| ID | Steps | Expected result |
| --- | --- | --- |
| NOTE-01 | As student A, save a distinctive private note on a whole-cohort lecture; close/reopen and refresh. Edit it. | Note text persists; note indicator appears; update changes the same owner/occurrence note rather than creating duplicates. |
| NOTE-02 | Try empty text and over 10,000 characters; cancel an edit; delete an existing note. Recreate the note on the recorded lecture afterward and record its new note ID for the following cases. | Bounds enforced; cancel preserves saved text; delete removes it and indicator after refresh; recreated note is available for privacy and retention checks. |
| NOTE-03 | As student B and admin, inspect the same lecture and `/api/notes`; try deleting A's note ID. | Each notes list is owner-only, including admin. A's note is absent; another user's delete returns 404 `note_not_found`. |
| NOTE-04 | Save a note against an occurrence not readable by the user, or an unpublished-only lesson. | 404 `lesson_not_found`; no new note. Use the occurrence ID for PUT, note ID for DELETE. |
| NOTE-05 | In a replacement draft, move the noted lecture to another valid date/slot/room, keeping occurrence ID; publish and refresh student A. | Same saved note follows moved lesson; note ID/content preserved. Edit/delete still work. An unpublished move must not move the student's current lesson early. |
| NOTE-06 | Save text such as `<b>QA note</b>` and inspect after reload. | Content is displayed as text; it does not execute markup/scripts. Confirm note bodies are absent from diagnostic/audit details. |

## 13. Private support requests

The English navigation label is **Support**. Cross-session replies/status changes load when revisiting/reloading the page; this page does not poll automatically.

| ID | Steps | Expected result |
| --- | --- | --- |
| SUP-01 | As student A, select New request; enter subject/message; send; refresh and reopen it. | HTTP 201; new thread has New status and the initial message exactly once. Subject/date/status appear in list. |
| SUP-02 | Reply as author, then as admin; revisit as author. | Replies persist in order; author sees admin response. Other party may be labeled Support rather than its actual account name. Latest message is reachable. |
| SUP-03 | As admin change New → In progress → Closed; revisit as author. | Status persists. Ordinary author cannot change status; closed notice replaces reply form for both admin and author. |
| SUP-04 | Replay a reply request against a closed thread; then reopen as admin and reply normally. | Closed reply returns 409 `thread_closed` for either role; reopened thread accepts messages. |
| SUP-05 | As student B or unrelated lecturer, list threads and try replying to A's thread ID. | A's thread absent; guessed reply returns 404 `thread_not_found`. Admin can see threads; ordinary users only their own. |
| SUP-06 | Test missing subject/message, subject over 150 chars, message/reply over 10,000; cancel compose. | Invalid input rejected; cancel creates no thread. Literal markup remains text. Message bodies are absent from diagnostics/audit. |
| SUP-07 | Simulate network failure on load/send; restore network and use retry/revisit. | Clear failure/retry state; no false success. Verify actual server thread/messages before resending after an ambiguous network failure. |

## 14. Diagnostics and generation history

Use an administrator and a known failed request ID, completed run IDs, and a few committed catalog changes. Error boxes and `X-Request-ID` identify server requests; the server generates this identifier.

| ID | Steps | Expected result |
| --- | --- | --- |
| DIAG-01 | Open Diagnostics and inspect system, database/schema, API process, SQL/request/log counters, queue and workers. | Current values render; process-specific scope is clear; heartbeat ages/current job correspond to actual activity. Database readiness agrees with `/api/ready`. |
| DIAG-02 | Toggle System overview and Run history auto-refresh separately and use their Refresh actions; observe an active run in Planner too. | Diagnostics monitors update about every four seconds. Each auto-refresh control affects its own monitor; other panels/expanded active attempts can continue polling. Planner's active-run polling is about every 1.5 seconds. Manual refresh works. |
| DIAG-03 | In Events, filter by request ID/level/event; open Details. | Relevant safe event metadata appears: method/route template/status/timing/code. No secrets, raw exception messages, local variables, SQL parameters or private message text. |
| DIAG-04 | In Audit, filter by actor/resource/request ID; inspect successful catalog edit, failed room deletion, lesson move/publication and status change. | Committed actions have consistent audit. Failed/rolled-back mutation has no committed success audit. Passwords/note/feedback bodies are omitted. |
| DIAG-05 | In Requests, make several API calls then refresh aggregates. | Method/route/status/count/average/max reflect traffic; route templates do not expose request values. Process reset is distinguished from durable history. |
| DIAG-06 | Open Run history, filter status, paginate, and inspect Details and Attempts for known runs. | Algorithm/seed/author/revision/hash/queue/preparation/solver progress/outcome are consistent; attempt worker/start/end/error data survives reload. Heavy snapshots are not returned as ordinary list data. |
| DIAG-07 | Compare exactly two finished runs with matching substantive inputs; repeat with a deliberate input change. | Same-input comparison is identified correctly; different/missing comparison hashes warn about comparability. Active runs cannot be compared as finished results. |
| DIAG-08 | Temporarily interrupt polling connectivity and restore it; change selected draft/run during a slow response. | Last successful data is marked stale, not falsely current; polling recovers; late response does not replace a different selection. |
| DIAG-09 | Sign in as student/lecturer and request diagnostics; repeat anonymously. | 403 for ordinary authenticated users, 401 anonymously. Optional metrics token grants metrics access only, not general administrator access. |
| DIAG-10 | After runtime restart, compare audit/run/attempt history with Events and process counters. | SQL-backed history persists; current-process event buffer and metrics can reset. Old missing progress fields show absent/— rather than fabricated values. |

For troubleshooting details and optional Grafana/Prometheus setup, see [observability.md](observability.md). Optional monitoring requires its own executed acceptance; it is not required for native local diagnostics.

## 15. Runtime and worker recovery

Run operational failures only in the isolated environment. Use launcher-owned process identities from `status`; do not terminate every Python/Node process or unrelated SQL Server. Restart commands from section 2 restore the group.

Windows stop:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/local.ps1 stop
```

Linux stop:

```bash
backend/.venv/bin/python -m app.local_runtime stop
```

| ID | Steps | Expected result |
| --- | --- | --- |
| RUN-01 | Start, inspect status, stop, inspect status, start again; check unrelated applications. | Only owned processes stop; ports release; normal restart works; unrelated applications remain running. |
| RUN-02 | During a sufficiently long generation, stop the owned group and restart it; inspect run/attempt history until terminal. | SQL job/history retained; work continues/retries after restart, potentially waiting for lease expiration and bounded backoff. Graceful stop can record retry state immediately. No duplicate applied schedule; do not require immediate recovery. |
| RUN-03 | Optional operator crash check: terminate only the identified owned coordinator, observe supervisor, restart launcher. | Supervisor reports child exit and tears down its owned group. Restart recovers durable work subject to lease/retry. Normal stop is not proof of hard-crash fencing. |
| RUN-04 | In a separately supervised setup, restart only API while coordinator keeps working. | API startup does not reset live generation; result/history remains usable. In the standard launcher, killing API tears down the group, so use RUN-02 or mark this separate setup NOT RUN. |
| RUN-05 | Queue work on distinct drafts faster than it finishes, up to configured active limit; attempt another admission. | Default active limit is four (`queued`/`running`/`retry_wait`); next returns 429 `generation_queue_full`. At most one solver executes at a time; other admitted work waits. Use long enough runs to actually reach the limit. |
| RUN-06 | With launcher stopped, let a harmless independently managed process occupy 3000 or 8000; attempt startup. | Clear `port_in_use` failure; foreign process remains alive; partial startup cleans up only its newly owned group. Stop the test listener afterward. |
| RUN-07 | In a separate disposable checkout with isolated configuration/database, test missing frontend dependencies, outdated schema, and missing/invalid mail-key path. Restore configuration. | Startup fails clearly before normal operation; status/logs identify cause. Do not delete actual keys, bypass migration checks, or run a downgrade against retained data. |
| RUN-08 | While API stays live, interrupt isolated DB connectivity if supported by the test setup; restore it. | Health may remain 200, readiness becomes 503 `unavailable`, requests fail safely; after restoration readiness and normal workflow recover. Record NOT RUN if connectivity could not be isolated safely. |
| RUN-09 | In a controlled setup with IO processing held, request local reset mail and verify the mail job is pending before restarting/resuming workers; inspect delivery. Optionally rotate mail key using the documented launcher command while preserving old keys. | Pending encrypted mail remains deliverable; no tokens/bodies in diagnostics; old keys retained for pending messages. Already-delivered mail does not prove persistence; mark that part NOT RUN if no pending job was observed. Repeated `init-mail-key` preserves existing valid key. |

Defaults are a 60-second lease, 10-second heartbeat, three maximum attempts, and retry delays of about 5/20 seconds plus jitter. Solver termination and startup add time; use observed state/deadline rather than an exact stopwatch assertion. No unchanged progress timestamp alone proves a hung solver.

Inspect `.runtime/*.stdout.log`, `.runtime/*.stderr.log`, and `backend/.logs/events.jsonl-<instance_id>` privately. Separate process files and rotation are expected. Keep sensitive runtime artifacts out of Git. For a repeatable lease/fencing/concurrent-claim test, follow the opt-in isolated SQL Server tests in [README](../README.md#verification); this manual restart pass does not establish all concurrency guarantees.

## 16. Languages, mobile layout, and accessibility

Repeat representative positive and negative flows across supported languages and the browsers in your team's acceptance scope. At minimum record one desktop browser, another browser engine when available, and a 390-pixel mobile viewport; label emulation separately from a physical device.

| ID | Steps | Expected result |
| --- | --- | --- |
| UX-01 | Switch RU/HY/EN while signed out and signed in on all six admin pages; repeat login, catalog validation, partial report, note and support dialog. | Navigation, labels, statuses and domain errors translate; date formats and document language/title match. Entered catalog names/content remain unchanged; no raw translation keys. |
| UX-02 | Refresh/reopen same browser after changing language and desktop sidebar collapse state. | Preferences persist; login/session behavior remains correct. No theme switch is required by the current application. |
| UX-03 | At 390px width, use mobile menu, filters, lesson list, note form, catalog editor, Planner move dialog, Support, Diagnostics. | Controls remain reachable, dialogs fit/scroll, no page-wide horizontal overflow. Wide tables may scroll within their container. Mobile menu closes after navigation or Escape. |
| UX-04 | At tablet/intermediate width around 1100px and desktop width, inspect catalog navigation, sidebar and long Armenian/Russian labels. | Navigation adapts without clipped actions; catalog resource selector works at narrower sizes; long strings wrap safely. |
| UX-05 | Use keyboard only: skip link, Tab/Shift+Tab, Enter/Space, Escape; open and close every dialog. | Visible focus; named fields/buttons; dialog focus stays inside while open and returns sensibly on close; background is not operated accidentally. Busy catalog editor prevents unsafe close/double submission. |
| UX-06 | Use 200% zoom, long note/support text, and reduced-motion preference. | Content and actions remain usable; no essential state relies only on color/motion. Read and operate loading/status/error messages with assistive technology where available. |
| UX-07 | Throttle network and try repeated submit clicks on login/save/generate/publish. | Busy feedback appears; actions are disabled appropriately; no duplicate mutation or false success. Capture uncaught console errors, if any. |
| UX-08 | Scroll a long page, use Back to top, switch lists/pages, and open a support conversation. | Scroll/focus lands on useful content; new messages remain reachable; page navigation does not strand keyboard focus. |

## 17. Direct API permission checks

Use Network → Edit and resend, or Copy as fetch, on a request from this isolated application. Preserve the session and a valid CSRF header when testing roles/business rules; otherwise a CSRF failure can hide the behavior being checked. For stale-revision checks, preserve the old revision deliberately. Request/response payloads in API documentation describe exact schemas.

For simple same-origin checks, this optional browser-console helper obtains the CSRF token without printing it. It returns only response status, body, and request ID. Call it only while on the isolated ChronoCampus origin. Inspect results privately; do not share tokens, cookies, account data, or private note/message text.

```javascript
async function qaRequest(path, { method = "GET", body, includeCsrf = true } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET" && includeCsrf) {
    const sessionResponse = await fetch("/api/auth/me", { credentials: "include" });
    if (!sessionResponse.ok) throw new Error("Sign in before this mutation check");
    const session = await sessionResponse.json();
    headers["X-CSRF-Token"] = session.csrf_token;
  }
  const response = await fetch(`/api${path}`, {
    method,
    credentials: "include",
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return {
    status: response.status,
    requestId: response.headers.get("X-Request-ID"),
    data: response.status === 204 ? null : await response.json(),
  };
}
```

Examples: `await qaRequest("/admin/catalog/subjects")` as a student; `await qaRequest("/auth/logout", { method: "POST", includeCsrf: false })` to check CSRF rejection without logging out. Use IDs from your fixture ledger in the following matrix; placeholders are not literal URLs.

| ID | Session and request | Expected result |
| --- | --- | --- |
| API-01 | Anonymous GET `/api/auth/me`, `/api/schedule/facets`, `/api/notes`, `/api/feedback`. | 401; no private data. Public health/readiness/auth entry points are intentionally different. |
| API-02 | Student/lecturer GET `/api/admin/catalog/users`, `/api/admin/schedule/versions`, `/api/admin/diagnostics/system`. Also replay an administrator catalog mutation with the ordinary session's valid CSRF. | 403 `administrator_required`; catalogs/drafts/diagnostics not disclosed and no mutation saved. |
| API-03 | Authenticated POST `/api/auth/logout` without/wrong CSRF; repeat a harmless catalog mutation without CSRF. | 403 `csrf_failed`; session/data unchanged. A valid token lets the separately authorized action proceed. |
| API-04 | Submit an authenticated mutation with an unapproved Origin using a client that can set it, preserving cookie/CSRF privately. | 403 `origin_forbidden`. Browser JavaScript cannot freely override Origin; mark NOT RUN if no suitable client is used. |
| API-05 | Student PUT `/api/notes/{unreadableOccurrenceId}` with `{"content":"QA"}`; DELETE `/api/notes/{otherUsersNoteId}`. | 404, no creation/deletion. IDs serve different purposes for save and delete. |
| API-06 | Student POST `/api/feedback/{otherUsersThreadId}/messages`; PUT own thread `/status`. | Other thread hidden with 404; ordinary status change forbidden with 403. Use valid nonempty reply/status bodies. |
| API-07 | GET `/api/schedule/page?start=2026-09-07&end=2026-10-08` or malformed cursor. Alter filter IDs/cursor from another user's request. | Invalid range/cursor 422, stale/mismatched cursor 409 where applicable; no widening of the account's authorized data. |
| API-08 | Admin POST `/api/admin/schedule/versions/{draftId}/publish` with current revision for incomplete draft; repeat with stale revision on a changed draft. | Incomplete 409 `publication_blocked`; old revision 409 `stale_revision`; no publication change. |
| API-09 | Replay generation POST `/api/admin/schedule/versions/{draftId}/generate` with `revision`, `seed`, `algorithm`, `idempotency_key`. Repeat exact body/key, then change seed with same key. | Same run ID for exact replay; 409 for key conflict. Only one job admitted for original request. |
| API-10 | Admin DELETE `/api/admin/catalog/users/{disposableUserId}`. | 409 `deactivate_account_instead`; user remains. |

Scope these claims to the active/private and administrator endpoints above. The repository also retains the separate prototype `/api/groups` route; it is not evidence that every route requires login.

## 18. Cleanup and sign-off

1. Restore changed capacities, equipment, availability, calendar times/confirmation, permissions and holidays. Compare to the fixture ledger.
2. Cancel leftover active test runs; check terminal state and queue/worker health. Stop the local group if the environment should be left off.
3. Delete unused temporary catalog records in dependency order. Referenced/published history may prevent deletion; keep it in the isolated database. Do not bypass immutability or use the destructive bootstrap for cleanup. Deactivate disposable accounts instead of deleting them.
4. Preserve only redacted evidence. Keep `.env`, `.demo-credentials.json`, `.mail`, `.secrets`, runtime logs/backups and unredacted network captures outside Git/shared reports.
5. Record each failed/blocked/skipped case and any residual fixture changes. A partial run is not full acceptance.

Use this defect format:

```text
Title / severity:
Case ID:
Commit / environment / browser / role:
Preconditions and fixture IDs (no secrets):
Exact steps:
Expected:
Actual:
HTTP status / safe error code / request ID / run ID:
Redacted screenshot or console evidence:
Reproducibility / data impact:
```

Finish the results document with:

```text
Smoke: PASS / FAIL / BLOCKED
Full guide: PASS / FAIL / INCOMPLETE
PASS / FAIL / BLOCKED / NOT RUN / N/A counts:
Case IDs not passed and reasons:
Open defects and accepted limitations:
SQL Server checks actually executed:
Windows / Linux environments actually executed:
RU / HY / EN and browser / viewport coverage:
Recovery / concurrency / SMTP / HTTPS / optional monitoring coverage:
Cleanup complete / residual changes:
Acceptance decision / reviewer / date:
```

Automated checks complement this manual pass. For a release/change validation, use the [README verification commands](../README.md#verification), CI and isolated SQL Server tests as appropriate. Record actual commands/results separately; do not copy historical passing counts from [verification.md](verification.md).

Current boundaries: automatic exam scheduling, Word import, Microsoft SSO, general notifications, automatic alphabetical student allocation, and in-place revision of already materialized workloads are outside this version. The active UI also has no timetable export, attachment upload, theme switch, or drag-and-drop scheduling. University dates/academic units and part-time sessions require confirmation; demo values do not supply it.

Source references for maintaining this guide: [catalog fields](../frontend/src/system/catalogSchema.ts), [active interface](../frontend/src/system/Application.tsx), [academic validation](../backend/app/academics/router.py), [scheduling operations](../backend/app/scheduling/router.py), [schedule reads](../backend/app/scheduling/queries.py), [durable generation](../backend/app/jobs/generation.py), [end-to-end regression tests](../backend/tests/test_workflow.py), [local runtime](local-runtime.md), and [requirements](requirements.md).
