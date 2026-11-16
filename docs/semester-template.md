# Semester timetable projection

Phase 1 adds a read-only projection of saved assignments. It changes no schema,
solver code, accounts, occurrences, assignments, or schedule versions. Inactive
students are intentionally ignored: the pure derivation and inventory use groups,
workloads and assignments without querying account state. Existing authentication
and faculty/group/lecturer authorization still apply at the API boundary.

## Phase 0 inventory

The inventory ran before implementation. Complete series keys and irregular dates
are in [template-phase0.jsonl](template-phase0.jsonl). Counts are series, not lessons.
The calendar and term anchors saved on each version are respected; holidays do
not restart parity. Partial first weeks only contribute dates actually in the
teaching periods. This is an assignment pattern inventory, not curriculum validation.

| Version | Status | Group | Every | Numerator | Denominator | Irregular |
|---|---|---|---:|---:|---:|---:|
| 1 | Draft | DEMO-1-26 | 1 | 5 | 2 | 28 |
| 2 | Published | DEMO-2-26 | 6 | 8 | 4 | 6 |
| 1002 | Published | DEMO-5-26 | 0 | 0 | 6 | 18 |
| 1003 | Published | DEMO-1-26 | 2 | 8 | 11 | 14 |
| 1004 | Draft | DEMO-4-26 | 3 | 8 | 7 | 12 |
| 1005 | Draft | DEMO-5-26 | 0 | 0 | 6 | 18 |
| 2005 | Draft | DEMO-4-26 | 3 | 8 | 7 | 12 |
| 3005 | Draft | DEMO-4-26 | 3 | 8 | 7 | 12 |
| 3006 | Published | DEMO-5-26 | 0 | 0 | 6 | 18 |
| 3007 | Draft | DEMO-4-26 | 3 | 8 | 7 | 12 |

Examples: version 1003, subject 1 practical, subgroup 1, Thursday slot 2
alternates rooms 10 and 9 every four weeks. This cannot be represented as one
weekly or alternating-week room assignment and remains explicitly dated. Version
1 also moves several lessons out of the partial first week into different weekday
series. Group 5's 8-hour components occur every four weeks and remain irregular.

## API and interpretation

`GET /api/schedule/template?group_id=...&version_id=...` returns semesters, each
containing `template_rows`, `exceptions`, `irregular`, and grid configuration.
Existing schedule filter names also work. Dates never truncate classification.
Room/subject/type filters apply after derivation. Explicit versions are restricted
to administrators and deans; student and lecturer reads use current publication
pointers with the existing audience/teacher restrictions. Results are private,
not cached, and authorization is revalidated. Draft revision checks use the
existing review helper. Responses above 20,000 assignments require a narrower
scope instead of silently dropping lessons.

The pure function accepts assignment dictionaries, term, holidays and calendar
configuration including teaching periods and optional disruption records. Exact
weekly and parity series become template rows. Cancelled occurrences and recorded
disruptions are exceptions. A dominant series may infer a move/room change only
when at least 75% of expected dates match, at least two matches exist, and each
missing date has exactly one counterpart in the same academic week. Such changes
are explicitly marked inferred. Ties and ambiguous remainders retain their dates.
An inferred change is not evidence of an actual university email announcement.

Occurrence bindings preserve identity when expanding a template; exceptions
replace the predicted occurrence, including cancellations, and irregular rows
are added unchanged. [template-reconstruction.json](template-reconstruction.json)
records exact reconstruction of every stored group/version (1,974 rows including
historical drafts/publications). This check reads no accounts.

The default student/lecturer schedule and dean review display is Semester
timetable. Numerator is above denominator; every-week lessons occupy a full cell.
The photo itself was not available in this task, so this orientation follows the
explicit assumption in the task text. Configured extra slots/weekend days remain
visible. The weekly/list/overview views still provide dated details, notes and
suggestion actions. All new UI strings have Russian, Armenian and English values.

Run read-only inventories from `backend`:

```sh
python -m scripts.diagnose_template
python -m scripts.verify_template
```

## Phase 2 proposal — no solver changes implemented

Introduce a pattern decision per workload series (and parity when needed):
weekday, slot, and room. Link dated CP-SAT assignment variables to that decision
for all teaching weeks in the series. Use the existing first-partial-week anchor,
unchanged parity function and teaching-period calendars; remove holiday dates
from delivered occurrences while retaining normative cancellation accounting.
Keep remainder hours as explicit dated variables, identified separately from
weekly/parity series. Pins and declared exceptions should override only their
individual dates, with deviations reported rather than silently weakening the
whole series constraint.

Apply existing room capacity/equipment, audience, lecturer and external published
occupancy constraints to every expanded date. If a locked pattern cannot fit,
report infeasibility and the affected series; do not silently scatter lessons.
Retain the independent dated validator and add pattern validation and comparative
fixtures (partial first week, holidays, pins, emergency moves, shared rooms,
remainder volumes). Benchmark this opt-in mode before changing generation defaults.
No migration is proposed for the current read-only feature.

## Validation

- Backend: `python -m pytest tests -q` in the running backend container, using
  the suite's isolated SQLite fixtures; SQL Server opt-in tests skip by default.
- Additional isolated test: `python -m pytest tests/test_dean_review.py::test_semester_template_preserves_faculty_scope_and_account_data -q`.
- Frontend: `npm --prefix frontend run typecheck`, `npm --prefix frontend test`,
  `npm --prefix frontend run build`.
- Ruff on changed backend files and scripts; `git diff --check`.
- Both read-only inventory scripts executed against the existing development DB;
  all 1,974 stored rows reconstructed exactly.
- Finished group DEMO-2-26 read through the new API in an isolated process with a
  synthetic administrator scope and a SQL guard rejecting non-SELECT statements.
  Its actual response rendered with React server rendering: 24 template rows and
  six exceptions. This creates no account/session and does not bypass authentication
  in the running app. Separate SQLite tests exercise real authorization.
- UI rendering tests cover all three languages and numerator/denominator halves,
  full weekly cells, exceptions, irregular dates and default-view selection.
  No browser screenshot or visual acceptance pass was performed.

All source changes are uncommitted on `feat/semester-timetable-template`.

Final results: full backend suite **237 passed, 22 skipped**; additional faculty /
account-preservation test **1 passed**. Frontend tests **4 files passed**, TypeScript
and production build passed. Ruff and Git whitespace checks passed. The running API
returns health 200 and advertises the new route in its OpenAPI schema.
