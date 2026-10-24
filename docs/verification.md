# Verification — 24 October 2026

Environment: native Windows, Python 3.11, Node 24, SQL Server with ODBC Driver 18. Development database restored from the original using a COPY_ONLY/CHECKSUM backup. The original database was not migrated or seeded.

## Local durable runtime

This section supersedes the earlier single-process limitations and schema/test counts. The supported launch is native Windows through `scripts/local.ps1`: one API, one generation coordinator, one mail/maintenance worker, Vite, and at most one temporary solver process. SQL Server stores the queue; Redis, containers and public hosting are not required. Operational instructions are in [local-runtime.md](local-runtime.md).

- Full backend suite with the publication fixture and both isolated queue databases enabled: **159 passed**, one upstream Starlette/httpx deprecation warning, 86.68 seconds. This includes 14 real SQL queue cases across RCSI OFF and ON. Concurrent coordinators cannot claim two generation jobs; owners blocked beyond lease/deadline expiry cannot renew or apply results. Snapshot preparation exceeding a lease stays on its first attempt with independent heartbeats. Hard-killing a coordinator terminates its solver; recovery completes attempt two using the same snapshot hash.
- Process tests exercised malformed/oversized IPC, output backpressure, timeouts, cancellation, memory limits, lease loss and parent death on Windows. Launcher tests cover occupied ports, stale PID identity, partial starts, repeated stop, child/grandchild containment, and supervisor death during native process creation. The latter uses creation-time Windows Job Object membership rather than a later assignment.
- Mail tests cover atomic encrypted enqueue, key errors/rotation, bounded retries, stable message identity, expiry and single-use reset behavior. Expiry during SMTP TLS setup or local file synchronization prevents submission/publication. Maintenance removes bounded expired data while retaining active references. Actual university SMTP delivery was not tested.
- Read-path tests cover bounded SQL queries, pagination, scope-bound cursors, and session/membership changes during reads. Recorded page SELECT count stayed at three for both 7-row and 517-row fixtures; facets used nine. This justified retaining uncached, private reads rather than adding Redis or another cache. It is a query-count check, not a load benchmark.
- Ruff 0.17.2 correctness rules (`E4,E7,E9,F`), frontend TypeScript, production build and whitespace checks passed. Focused frontend logic/render checks cover idempotent launch retries, cancellation, attempt history and safe diagnostics. A final server-rendered check passed 24 component/language states across RU/HY/EN, including retry and cancellation. Server rendering does not verify browser interactions or responsive layout.
- Migration `0004_jobs` passed on empty SQL Server databases and restored legacy/development copies after native COPY_ONLY/CHECKSUM backups and `RESTORE VERIFYONLY`. The development cutover then stopped the old application, verified zero active legacy runs, took and verified a fresh backup, and applied the migration. Counts remained User 22, ScheduleVersion 6, LessonAssignment 3120, GenerationRun 5 and PersonalLessonNote 0. Original database `ChronoCampus` remains unchanged. Backup paths and disposable database identifiers are retained locally outside Git.
- Actual local launcher acceptance passed start/status, repeated start with the same instance, stop, repeated stop, process ownership checks, port release and restart. The restarted group remained ready. Direct API health/readiness, frontend and readiness through the Vite proxy returned HTTP 200. Both workers reported fresh SQL heartbeats. Administrator diagnostics/metrics/history returned 200, student diagnostics returned 403, and anonymous diagnostics returned 401. Bounded reads returned 333 distinct administrator lessons over four pages and 43 student lessons over one page for the tested 31-day interval; filtered and cleared-filter requests returned 200. Existing published data was not edited for these checks.
- Independent code and architecture reviews found lease-lock timing, preparation heartbeat, mail-expiry, empty-filter and launcher-creation issues; repairs and regression checks were completed. Final code recommendation: **APPROVE**; architecture status: **CLEAR**. Native role models were unavailable, so separate local Codex CLI sessions loaded the installed role instructions; the failed native launches are not counted as review evidence. Reviewers inspected source and independently ran static diagnostics; the full SQL/test results above were run by the parent session.
- Fetched `origin/main`, preserved the existing local commits, and integrated feature commit `7ad21e9` into local `main` by fast-forward in a separate worktree. Its tree exactly matched the tested feature tree; there were no conflict resolutions or code differences requiring another test run. The active checkout stayed on `codex/local-runtime`, and the running group stayed ready. No remote branch was pushed.

Remaining verification boundaries: the automatic approval review blocked a standalone Chrome launch without a detailed reason, and the supported in-app browser was unavailable. There is therefore **no fresh browser/visual acceptance** for this update; earlier screenshots do not establish it. Linux process containment, Docker/Prometheus/Grafana rendering, university SMTP and public hosting were not executed. The existing hosted CI startup restriction is unchanged. Per-instance logs rotate, but old instance files and durable job/audit history have no global retention policy. These are explicit limits of the local delivery.

## Draft revision isolation

Draft-only writes previously advanced the shared data revision: completing one queued generation, creating another draft, pinning its lesson, or cancelling its lesson made unrelated queued results stale. These writes now keep the database revision lock without changing shared inputs. The edited draft still advances its own revision; catalog changes and publication still invalidate older snapshots.

- Four regression scenarios failed on the original implementation and passed after the fix. Seven new cases cover independent queued generations, other-draft edits, protection of edits in the same draft, and publication invalidation. All **15 workflow tests passed**.
- Full backend suite with `CHRONOCAMPUS_TEST_DATABASE=ChronoCampus_MigrationTest_20261024`: **54 passed**, including concurrent conflicting publications on SQL Server. One upstream Starlette/httpx deprecation warning remains.
- The seven new scenarios and the existing catalog-staleness scenario also passed through the API using a newly created, Alembic-migrated SQL Server database, `ChronoCampus_RevisionTest_20261024_145812_032cc5`. All eight assertions/report entries passed; these small fixtures do not constitute a performance benchmark.
- Ruff 0.17.2 correctness checks (`E4,E7,E9,F`), Python compilation, frontend TypeScript, production build, and Git whitespace checks passed.
- The local development API was restarted after confirming zero queued/running jobs. API liveness/readiness, the frontend, and readiness through the Vite proxy returned HTTP 200.

No schema migration or dependency was added. This fix retains the single API process and in-process executor; durable jobs, a separate generator process, and multi-process recovery remain future work.

## CI and main integration

The current integration adds CI after PR #16 (manual-correction/room-deletion fixes) and PR #15 (observability) were merged into remote `main`. PR #15's conflict resolution dropped the room-equipment cleanup. This integration restores it after recording the room's audit snapshot; both remain in the same transaction.

- Full local backend suite, including the opt-in SQL Server concurrency test: **47 passed**, one upstream Starlette/httpx deprecation warning.
- Both new repair/deletion regression scenarios also passed through the API against two separately created and migrated SQL Server databases. Invalid manual moves and incomplete publication were rejected; valid individual repairs succeeded. A failed room deletion retained its equipment and wrote no false success audit. A successful deletion removed links, retained the equipment catalog, and audited the original equipment IDs.
- Ruff 0.17.2 correctness rules (`E4,E7,E9,F`), frontend TypeScript, production build, and Git whitespace checks passed.
- [CI](ci.md) now defines hosted backend/frontend checks and the aggregate `CI` result. The hosted SQL Server test is deliberately skipped; its local run above supplies the SQL Server evidence. Branch protection remains an administrator configuration step, separate from installing this workflow.
- Workflow syntax and expressions passed actionlint 1.7.12. Local `main` integration matched the tested feature tree; both repair/deletion tests passed again from that checkout.
- Hosted validation is **blocked**, not passed: [PR #17's first Actions run](https://github.com/qaneee/ChronoCampus/actions/runs/40082282465) ended with `startup_failure` before any jobs or check runs were created. GitHub registered the run under an empty-name `BuildFailed` workflow, exposed no logs, and refused a rerun. The available account cannot read Actions administration settings. The underlying account/service restriction has not been established; billing is not asserted as the cause. PR #17 remains open pending a real successful hosted run.

## Observability update

Implementation and operator instructions: [Диагностика](observability.md). The current schema is **0003_observability**. This section supersedes the earlier schema/test counts below; it does not extend the earlier browser acceptance to the new diagnostics page.

- Backend suite with the isolated SQL Server concurrency test enabled: **45 passed**, one upstream Starlette/httpx deprecation warning. Coverage includes correlated safe errors, administrator-only diagnostics, rollback-consistent audit, persisted progress/history, failed/interrupted runs, rotation, scoped scraper credentials, bounded browser reports, schema readiness, comparison hashes, SQL counters, and failure of the progress/log sinks.
- `uvx ruff check --isolated --select E4,E7,E9,F backend/app backend/tests backend/alembic`: passed. These are the explicitly selected correctness rules; no claim is made that all optional Ruff style/refactoring rules pass. Python compileall passed.
- Frontend typecheck and production build passed. Literal translation-key checks passed. Eighteen server-rendered component/language states passed, covering queued/running/complete/failed/interrupted runs and the diagnostics shell across RU/HY/EN. This is not a visual or browser interaction test.
- Native SQL Server migration: verified COPY_ONLY/CHECKSUM backups, empty database upgrade, restored legacy-copy upgrade, and development upgrade. Legacy counts remained Faculty 2, Major 5, CourseGroup 3, User 4, ScheduleEntry 8. Development counts remained User 22, ScheduleVersion 6, LessonAssignment 3120, GenerationRun 5, PersonalLessonNote 0. New tests ran in separately named isolated databases.
- SQL Server generation acceptance in the isolated empty/migrated database: CP-SAT and greedy/local each produced a complete four-lesson result. Ten and six progress transitions respectively persisted; request IDs matched the initiating requests, comparison hashes matched identical inputs, and five audit events persisted. Both algorithms used seed 7. This small diagnostic check is not a new university-scale performance benchmark.
- Running development API after restart: liveness/readiness 200, schema 0003 available, administrator diagnostics 200, student 403, anonymous 401, five pre-existing runs retained. Windows process-memory readings were available; log-write failures were zero. API login events correlated with transactional audit. Demo passwords were absent from the JSON log. The frontend and its diagnostics module were served successfully on port 3000.
- Official **promtool 3.13.5** validated the scrape configuration and all seven alert rules. The configuration check substituted local paths for Docker mount paths and used a dummy credential file; the scrape target and rule expressions were preserved. Metrics fetched from the running API passed `promtool check metrics`. Grafana dashboard JSON, monitoring YAML and PowerShell setup syntax parsed successfully.

Limits for this update: Docker is not installed, so the Prometheus/Grafana containers, container-to-host connectivity and Grafana rendering were not executed. No browser was connected to the supported UI automation surface, so new diagnostics interactions and responsive layout have no fresh visual acceptance. Native specialist agents were unavailable; implementation/review was performed in the primary session. External alert delivery, Loki and distributed tracing are not configured. Runtime logs, credentials, verified backups and local test artifacts remain outside Git.

## Earlier delivery record — before observability

### Automated checks

- `pytest tests -q` with `CHRONOCAMPUS_TEST_DATABASE=ChronoCampus_MigrationTest_20261024`: **32 passed**. One upstream Starlette/httpx deprecation warning; no failed tests.
- Ruff static checks on backend application, tests, and migrations: passed.
- Frontend `npm run typecheck` and `npm run build`: passed. Active application compiles with strict TypeScript; archived prototype components are outside its import graph.
- Skill validator: `skills/repo-workflow/SKILL.md` valid.
- Migrations 0001/0002 applied successfully to a restored legacy development database and an empty isolated SQL Server test database (33 tables). Legacy catalogs remained intact.

The closing readiness review repeated all 32 tests, Ruff, typecheck, and the production build successfully. Alembic reports `0002_exceptions (head)`. Ordinary tests now explicitly isolate startup database recovery, so running legacy health/API tests cannot interrupt generation jobs in the developer's configured database. A rendered-component check confirms that an empty issue list produces no error banner while a real room-capacity error remains visible and translated. Both local HTTP endpoints returned 200 after the final changes.

The delivered entry point uses the modular API and SQL Server data throughout. It builds on the existing repository and preserved catalogs; the old frontend prototype remains reference code outside the active application. Local diploma functionality is implemented across all three layers. University mail delivery and unconfirmed real-world calendar/workload parameters remain configuration/acceptance items listed below, not claimed as verified production operation.

Coverage includes dynamic fifth/sixth slots, partial first-week parity, forbidden extra slots, closure enforcement, nested student conflicts, capacity/type/equipment, external published occupancy, pins, exact hours, holiday exemptions, emergency makeup, missing teaching periods, partial publication rejection, stale generation results, stable note identity after a move, role/privacy enforcement, temporary passwords, CSRF, one-use reset tokens, and private feedback statuses. A real SQL Server concurrency test sends two conflicting publish requests: one succeeds and the other is rejected with teacher/room conflicts.

### Live API and browser

The final generation pass used the running API and development SQL Server, seed 7, CP-SAT with a 60-second search budget. Previously published occupancy outside the selected cohorts remained active.

| Dataset | Dated occurrences | Result | Total generation time |
| --- | ---: | --- | ---: |
| Four full-time cohorts | 960 | Complete, independently validated, published; FEASIBLE | 64.20 s |
| One part-time cohort | 120 | Complete, independently validated, published; FEASIBLE | 62.31 s |

These totals include preparation. Optimality was not proved; student/teacher windows and other soft costs remain in the reports. This demonstrates feasibility on synthetic diploma-scale data, not a performance guarantee for every university dataset. Re-running a subset considers published schedules outside that subset, so changing external occupancy changes the input problem.

Student login returned 144 relevant lessons, note save/read/delete succeeded, and administrator APIs returned 403 for the student. Browser checks with headless Chrome exercised real administrator/student login, RU/HY/EN switching, saved and reopened a note, created a student request, replied and closed it as administrator. A separate browser pass created, edited, and deleted a temporary subject through the catalog form. No JavaScript runtime exceptions were observed in these passing checks. At a 390-pixel viewport the schedule had no horizontal overflow. Desktop and mobile screenshots were visually inspected. Native dialogs were used for notes and feedback.

Repeated seeding preserved record counts and the password-file hash. Original database counts remained Faculty 2, Major 5, CourseGroup 3, User 4, ScheduleEntry 8. All development writes stayed in the copied database; SQL concurrency fixtures used the separately named test database.

### Explicit limits

- University SMTP delivery, Docker execution, and public HTTPS hosting were not tested. Password recovery was verified with locally captured email files.
- Exact university teaching dates, part-time sessions, academic-hour settings, and English workload details still require confirmation. Demo defaults are labeled separately.
- Automatic exam scheduling, Word import, Microsoft SSO, and general notifications are outside this version.
- This deployment supports one API process. Multi-process jobs and durable SMTP retries require additional infrastructure.
- The planner uses current rules to report conflicts after catalog changes; previously published schedules remain visible until an administrator publishes a replacement.
- Materialized workloads are protected against identity-changing edits; an in-place curriculum revision workflow is not implemented.
- Native specialist review could not run because the installed role models were unavailable. The implementation was reviewed and tested in the primary session; no independent agent approval is claimed.

Run the README acceptance steps after changing domain rules. Credentials, email captures, local execution scripts, and screenshots remain in ignored local files rather than Git.
