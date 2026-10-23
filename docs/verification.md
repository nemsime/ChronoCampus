# Verification — 24 October 2026

Environment: native Windows, Python 3.11, Node 24, SQL Server with ODBC Driver 18. Development database restored from the original using a COPY_ONLY/CHECKSUM backup. The original database was not migrated or seeded.

## Automated checks

- `pytest tests -q` with `CHRONOCAMPUS_TEST_DATABASE=ChronoCampus_MigrationTest_20261024`: **32 passed**. One upstream Starlette/httpx deprecation warning; no failed tests.
- Ruff static checks on backend application, tests, and migrations: passed.
- Frontend `npm run typecheck` and `npm run build`: passed. Active application compiles with strict TypeScript; archived prototype components are outside its import graph.
- Skill validator: `skills/repo-workflow/SKILL.md` valid.
- Migrations 0001/0002 applied successfully to a restored legacy development database and an empty isolated SQL Server test database (33 tables). Legacy catalogs remained intact.

The closing readiness review repeated all 32 tests, Ruff, typecheck, and the production build successfully. Alembic reports `0002_exceptions (head)`. Ordinary tests now explicitly isolate startup database recovery, so running legacy health/API tests cannot interrupt generation jobs in the developer's configured database. A rendered-component check confirms that an empty issue list produces no error banner while a real room-capacity error remains visible and translated. Both local HTTP endpoints returned 200 after the final changes.

The delivered entry point uses the modular API and SQL Server data throughout. It builds on the existing repository and preserved catalogs; the old frontend prototype remains reference code outside the active application. Local diploma functionality is implemented across all three layers. University mail delivery and unconfirmed real-world calendar/workload parameters remain configuration/acceptance items listed below, not claimed as verified production operation.

Coverage includes dynamic fifth/sixth slots, partial first-week parity, forbidden extra slots, closure enforcement, nested student conflicts, capacity/type/equipment, external published occupancy, pins, exact hours, holiday exemptions, emergency makeup, missing teaching periods, partial publication rejection, stale generation results, stable note identity after a move, role/privacy enforcement, temporary passwords, CSRF, one-use reset tokens, and private feedback statuses. A real SQL Server concurrency test sends two conflicting publish requests: one succeeds and the other is rejected with teacher/room conflicts.

## Live API and browser

The final generation pass used the running API and development SQL Server, seed 7, CP-SAT with a 60-second search budget. Previously published occupancy outside the selected cohorts remained active.

| Dataset | Dated occurrences | Result | Total generation time |
| --- | ---: | --- | ---: |
| Four full-time cohorts | 960 | Complete, independently validated, published; FEASIBLE | 64.20 s |
| One part-time cohort | 120 | Complete, independently validated, published; FEASIBLE | 62.31 s |

These totals include preparation. Optimality was not proved; student/teacher windows and other soft costs remain in the reports. This demonstrates feasibility on synthetic diploma-scale data, not a performance guarantee for every university dataset. Re-running a subset considers published schedules outside that subset, so changing external occupancy changes the input problem.

Student login returned 144 relevant lessons, note save/read/delete succeeded, and administrator APIs returned 403 for the student. Browser checks with headless Chrome exercised real administrator/student login, RU/HY/EN switching, saved and reopened a note, created a student request, replied and closed it as administrator. A separate browser pass created, edited, and deleted a temporary subject through the catalog form. No JavaScript runtime exceptions were observed in these passing checks. At a 390-pixel viewport the schedule had no horizontal overflow. Desktop and mobile screenshots were visually inspected. Native dialogs were used for notes and feedback.

Repeated seeding preserved record counts and the password-file hash. Original database counts remained Faculty 2, Major 5, CourseGroup 3, User 4, ScheduleEntry 8. All development writes stayed in the copied database; SQL concurrency fixtures used the separately named test database.

## Explicit limits

- University SMTP delivery, Docker execution, and public HTTPS hosting were not tested. Password recovery was verified with locally captured email files.
- Exact university teaching dates, part-time sessions, academic-hour settings, and English workload details still require confirmation. Demo defaults are labeled separately.
- Automatic exam scheduling, Word import, Microsoft SSO, and general notifications are outside this version.
- This deployment supports one API process. Multi-process jobs and durable SMTP retries require additional infrastructure.
- The planner uses current rules to report conflicts after catalog changes; previously published schedules remain visible until an administrator publishes a replacement.
- Materialized workloads are protected against identity-changing edits; an in-place curriculum revision workflow is not implemented.
- Native specialist review could not run because the installed role models were unavailable. The implementation was reviewed and tested in the primary session; no independent agent approval is claimed.

Run the README acceptance steps after changing domain rules. Credentials, email captures, local execution scripts, and screenshots remain in ignored local files rather than Git.
