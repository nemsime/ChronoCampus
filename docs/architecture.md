# Architecture and operational boundaries

A modular monolith: one FastAPI process, one solver worker, one SQL Server database, and a React client. Domain rules are separated from HTTP and presentation.

## Generation

1. A draft selects a term and cohorts. Workload components materialize stable occurrence IDs, independent of date, room, and version.
2. The server captures inputs, hash, global data revision, draft revision, algorithm, and seed, including published occupancy outside the selection.
3. Candidate construction applies shared calendar and hard constraints. Weekly and alternating patterns link dates; pins and emergency exceptions retain their own placements.
4. A constrained-first greedy pass and bounded local improvements construct an incumbent. CP-SAT searches candidate choices with room, lecturer, and student-segment exclusivity. Objective phases preserve the best achieved higher-priority value. A feasible time-limited result is not advertised as globally optimal.
5. An independent validator checks the result and exact hours. A job writes only if input and draft revisions still match; otherwise it becomes stale and preserves newer work.
6. Publication validates again under the database revision lock, then atomically updates cohort publication pointers. Concurrent conflicting publication is rejected.

CP-SAT keeps intersecting resource and subgroup constraints explicit. Greedy/local search provides a fast incumbent and comparison baseline, but cannot reliably recover from difficult global choices. Both use the same candidates and validator. OR-Tools solves our university model rather than defining its rules.

The stored seed, snapshot, dependency versions, single solver worker, and hash support replay. Exact optimization results under a wall-clock cutoff may vary with machine load. Search budget excludes candidate preparation; both durations are reported. A complete solution may still violate soft preferences.

## Persistence

SQLAlchemy maps retained legacy catalogs and new tables. Alembic 0001 is additive with frozen table definitions; 0002 adds emergency disruptions and quality settings and removes the legacy fixed degree-duration constraint. Migrations were exercised against a restored legacy database and an empty SQL Server database. Destructive downgrade is refused; restore a backup instead.

Catalog writes and publication share a revision row lock. Authentication, notes, and feedback do not invalidate generation inputs. Draft revisions prevent lost updates. Published assignments are immutable; corrections require a new draft.

Workload changes are rejected once occurrences exist, preserving note and historical identity. Editing an already materialized curriculum requires a future revision/mapping workflow; the current version supports new semesters and their workloads. Catalog availability changes can expose conflicts in an existing publication: the administrator must create a corrected draft. The old publication stays visible until replacement, and the planner reports validity against current rules.

## Accounts and operations

Roles and student/lecturer membership are enforced server-side. Passwords use salted PBKDF2-SHA256; session and reset secrets are stored hashed. Cookies are HttpOnly and SameSite=Lax; authenticated writes require a CSRF token and allowed origin. Password changes/reset revoke sessions. Temporary credentials restrict access until changed.

Reset requests return the same response for known and unknown addresses. Tokens expire and are consumed only on successful password submission. SMTP runs as a background task; durable mail retries/outbox are not implemented. Local file-mail tests do not verify university SMTP delivery.

One API process is supported. Restart recovery marks queued/running generation interrupted. Multi-process hosting needs a distributed queue and ownership-aware recovery first.

## Interface

Active entry path: `main.tsx → App.tsx → system/Application.tsx`. Catalog schemas describe forms; server validation is authoritative. Personal schedules are filterable dated lesson lists with notes in native dialogs. Localization covers interface controls and rule messages; entered subject/faculty names remain as entered.

Prototype components outside the active import graph are retained for reference. The running application obtains account and timetable data from the API. Database credentials and demo password files stay out of the frontend bundle.
