# One-time moves and temporary closures

Agreed on 16 November 2026:

- Makeup lessons may happen before or after a closure, within the same semester.
- Lecturers submit requests; administrators approve and publish the changes.
- All work stays on `feat/semester-timetable-template`.
- Account data, including intentionally inactive students, remains unchanged.

## Lecturer workflow

A lecturer selects one of their own published lesson occurrences, provides a reason
and proposes a new teaching date/slot/room. Reuse the suggestion storage and
administrator triage where possible, adding a lecturer-specific authorization
path without broadening dean draft access. Only the lecturer's own published
occurrences can be requested. A pending/accepted request changes no student view.
If the occurrence changes after submission, flag the request as stale and require
rechecking. Approval means authorization to apply; implementation is complete only
after a validated replacement is published. Rejection records an explanation.

## Closure workflow

An administrator chooses a date range, reason and affected course groups. A whole
university closure expands to the relevant groups, independently of student
account state. The closure blocks lessons on those dates but does not waive any
hours. Each affected occurrence has one replacement, before or after the closure,
within the same semester's permitted teaching dates and slots. Additional slots
still require explicit permission. Validate lecturer/audience/room conflicts,
room type/capacity/equipment, availability and other published occupancy.

Do not use the existing holiday exemption or the same-day emergency operation for
this workflow. Keep both existing behaviors unchanged for backward compatibility.

## Additive schema (approved for implementation and isolated tests)

Two new tables; no changes to existing rows:

- `ScheduleChangeEvent`: version ID, kind (`one_time_move` / `closure`), inclusive
  dates, reason, affected course group IDs, optional source request ID.
- `LessonOverride`: version ID, event ID, occurrence ID, original date, slot, room,
  start/end times and cancellation flag. Unique on (version ID, occurrence ID).
  The replacement remains the same occurrence in the new draft's assignments;
  lack of a replacement means unresolved, not cancelled or completed.

Both tables reference existing records without changing accounts. Author/approver
references are audit metadata and do not modify account records. Copy exception
metadata when an administrator creates a subsequent draft, preserving the first
original placement across repeated edits. Do not change old publications or
existing development drafts during implementation or validation.

## Template and publication

Derive the base template using saved original placements for overrides; show
actual replacement dates as explicit exceptions. This avoids guessing a
cross-week move from a frequency heuristic. Irregular original lessons retain
explicit dates. Show original and replacement dates, reason and closure in Changes.
A moved occurrence retains its identity, workload hours and personal notes.

Preview the full change set in a new draft. Publication requires every owed
occurrence to have a valid replacement and no lesson in the affected closure
window. Publishing replaces only the selected groups' publication pointers via
the existing workflow. Until then students keep the current publication.

## Tests and rollout

Use isolated SQLite tests: request ownership, stale requests, approval permissions,
one-time moves before/after the original date, moves across parity/week boundaries,
closure scope and date overlap, unresolved replacements, conflicts, hours, stable
occurrence identity, exact template reconstruction and unchanged account records.
Test additive migration upgrades on an isolated DB. No development data reseeding,
no automatic generation/publication, and no solver changes. General email
notifications are outside this first implementation; requests and decisions are
shown in the application.

The user approved implementation and isolated migration testing. Migration
`0008_dated_changes` creates only the two new tables and their indexes. It was initially
not applied to the retained database; see the completed rollout record below. Existing endpoints keep
working on schema 0007; the feature capability endpoint returns false and new
mutation endpoints return 503 until the additive migration is applied.

`LessonOverride.original` is a frozen JSON snapshot of the original assignment
(date, slot, room, times and occurrence identity), rather than separate columns.
Explicit overrides are also included in solver input snapshots for validation
and stale-input detection; solver implementation code is unchanged.

## Using the feature after rollout

1. A lecturer opens the weekly timetable, selects a lesson and expands **Request
   a one-time move**. The reason, proposed date and slot are submitted to the
   administrator. The request list shows decisions and administrator comments.
2. In **Suggestions**, an administrator checks the request, accepts it, selects
   a draft of the same semester/groups, and uses **Apply request to selected
   draft**. This validates the proposed placement. Publish from Planner when the
   draft is complete; only then does the request become implemented.
3. For a closure, create a fresh draft from the publication. In Planner's
   **One-time changes and closures**, expand **Add a teaching closure**, select
   the affected groups and inclusive dates, and enter the reason. If all groups
   are affected, include all relevant groups in the draft and select them all.
4. Each removed lesson appears as an unresolved replacement. Use **Place
   replacement lesson** for a valid date before/after the closure within the
   same semester. A replacement cannot be put on any closed date for its group.
   Pinned lessons must be unpinned first. Overlapping group closures are rejected.
5. Publish only after all owed hours have valid placements. Students retain the
   previous publication until then. Templates use recorded originals; Changes
   show the replacement and reason, even across week/parity boundaries.
6. Administrators can also select **Record as a one-time move** when editing a
   lesson directly. Repeated moves retain the earliest original placement.

Requests become stale if the publication pointer changes or the lesson no
longer belongs to the author. A requested placement changed after application
must be restored to the accepted proposal before completing that request through
publication. Rejecting an applied request blocks publication of that draft;
create a fresh draft to abandon that application. General dean suggestions keep
their existing non-binding workflow.

## Rollout boundary

No retained accounts, assignments, occurrences, schedule versions or publication
pointers were changed during implementation or the additive rollout. Inactive student accounts are
untouched. Apply the migration only after explicit rollout approval and a verified
backup according to the repository's existing migration instructions. Do not run
`seed-demo`. Before rollout, all new flows were exercised only in isolated SQLite
fixtures; SQL Server DDL is compiled offline. A live SQL Server migration and a
browser interaction pass remain rollout checks, not claimed results.

## Validation record (16 November 2026)

- Complete backend suite: **245 passed, 22 skipped** (isolated SQLite fixtures).
- Final focused changes/template suite: **16 passed**, including SQL Server
  migration DDL compiled offline and SQLite upgrade preserving all retained fixture
  accounts and timetables. No live SQL Server upgrade was executed.
- Frontend TypeScript, production build and all four Node test files passed;
  rendering assertions include explicit one-time moves, closure reasons, pending
  replacements and all three interface languages.
- Ruff and `git diff --check` passed.
- Read-only rollout checks: retained DB migration remains `0007_dean_suggestions`,
  `ScheduleChangeEvent` does not exist, API `/health` and `/ready` both returned 200.
- Existing account snapshots are unchanged by requests, approvals, application,
  closure handling and publication in isolated tests. Login tracking is captured
  before the comparisons; existing authentication behavior was not changed.

Commands: `python -m pytest tests -q`,
`python -m pytest tests/test_dated_changes.py tests/test_template.py -q`,
`npm --prefix frontend run typecheck`, `npm --prefix frontend test`,
`npm --prefix frontend run build`, and Ruff on changed Python files.

## Approved rollout completed — 16 November 2026

The user subsequently approved applying migration 0008. The rollout is complete:

- Checked for zero queued/running/retry jobs, then paused only the ChronoCampus
  API, generation coordinator and I/O worker containers.
- Created native copy-only backup with checksum:
  `/var/opt/mssql/data/ChronoCampus_Development_before_0008_20261116_fe6d8022.bak`.
  SQL Server `RESTORE VERIFYONLY ... WITH CHECKSUM` confirmed it was valid.
- Restored it into disposable database
  `ChronoCampus_MigrationTest_20261116_0008_fe6d8022`, applied migration 0008 there,
  and compared retained-data hashes before/after.
- Applied the same additive migration to `ChronoCampus_Development` only after
  the rehearsal passed. All retained hashes matched: 22 accounts, 1,974 lesson
  assignments, 1,088 occurrences, 10 schedule versions, 3 publication pointers,
  169 workload components and the application revision row.
- Restarted the API/coordinator/I/O containers; health/readiness both returned
  200. Both new tables exist and the Alembic revision is `0008_dated_changes`.
- Removed only the newly created disposable rehearsal database. Retained the
  verified backup, with an additional local copy in ignored `.runtime/backups/`.

The application SQL user could create the backup but lacked restore/verify
permissions. Verification and restoring/removing the disposable copy used the
SQL Server container's existing administrator credentials, never printed or
changed. Migration DDL ran through the configured application connection. No
account activation, reseeding, lesson generation or publication was performed.

## Timetable notifications and layout

The main header now has a notification bell for authorized published timetable
exceptions. It refreshes every 30 seconds and on window focus, clears content on
fetch/authentication failure, and opens a drawer with lesson details, original
placement, replacement and reason. Read markers are stored on this browser per
account ID; no notification tables, account updates, emails or push messages are
introduced. Irregular dated lessons remain separate from change notifications.

The semester board uses the full content width. Changes open the same drawer
instead of a narrow permanent side column. Weekday names have explicit Armenian,
Russian and English translations. Numerator/denominator halves, every-week cards,
room/teacher metadata, and a mobile horizontal-scroll hint are retained.

Validation: TypeScript, all four frontend test files, production build and Git
whitespace checks passed. Isolated headless Chrome fixtures used stored group 2
data with a student subgroup/lab scope, without logging in or changing data.
Assertions covered all five weekdays visible at desktop width, no page overflow,
opening notifications, opening the selected lesson, clearing the unread badge,
and a true emulated 390px mobile viewport with a fully contained drawer. The
mobile timetable scrolls horizontally within its region. Screenshots are ignored
under `.runtime/notification-qa/`; browser fixtures do not replace live role
permission tests, which were covered by the backend suite before rollout.

The university reference was clarified: numerator is the upper half, denominator
the lower half, and every-week lessons span both. The latest approved layout now
copies the photo structure: weekday bands across the top, lesson-pair subcolumns
beneath each weekday, and one row per authorized course group down the left.
The whole week is the default. Weekday buttons provide a larger focused view;
the full sheet scrolls horizontally inside its region with a sticky group column.
Configured additional slots and weekend days remain visible when present.
Notifications and explicitly dated irregular lessons remain available unchanged.

Frontend structure tests check five weekday bands with four pair columns each,
two group rows with forty cells, upper/lower parity order, and unsplit weekly
lessons. TypeScript, all four frontend test files and production build passed.
Headless browser checks used existing timetable data in an isolated fixture:
full-width sheet (five days/twenty pairs), weekday selection (one day/four pairs),
and contained scrolling at desktop and an emulated 390px mobile viewport.
No database or account data changes were made for this layout update.

## Compact sheet labels

Grid labels now use display-only abbreviations (for example `Soft. Eng.`, `QA`,
`OOP`, `Math. An.`), lecturer initials (`L. Davtyan`) and short lesson types with
local audience numbers (`Lab. 1`, rather than a database ID). Catalog names and
account data are unchanged. Full names remain in accessible labels and hover
text, and clicking a compact lesson opens its complete details.

The latest cell proportions are approximately 60px per lesson-pair column and
90px per parity half, with a 64px group column. The complete five-day/four-pair
sheet minimum width is 1,264px instead of the earlier 2,668px. Every-week lesson
blocks are centered vertically across the unsplit cell; parity-only blocks stay
in their upper/lower halves. Group labels, day focus and notifications remain.

Tests cover known abbreviations, Unicode initials, local lab numbers, full
accessible labels and the existing sheet structure. A browser fixture at
1100×900 showed the one-group sheet without page overflow or vertical scrolling;
the grid measured about 236px high and weekly block centers matched cell centers
exactly. A separate click check opened full subject/teacher details. Larger group
lists naturally occupy more rows; no lessons are omitted to force a height limit.
