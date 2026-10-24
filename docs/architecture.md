# Architecture and operational boundaries

A modular monolith with separate execution processes: one FastAPI API, one generation coordinator, one mail/maintenance worker, one SQL Server database, and a React client. The coordinator starts at most one temporary CPU solver process. A durable SQL queue connects the API and workers. Native Windows launch is the current target; Redis and cloud deployment are not required. See [local operation](local-runtime.md).

## Generation

1. A draft selects a term and cohorts. Workload components materialize stable occurrence IDs, independent of date, room, and version.
2. The API atomically enqueues intent, draft revision, algorithm, seed and an idempotency key. The worker captures the immutable snapshot on the first claim, including published occupancy outside the selection. A queued request therefore uses the data available when execution starts; retries reuse the first snapshot while its revisions remain valid.
3. Candidate construction applies shared calendar and hard constraints. Weekly and alternating patterns link dates; pins and emergency exceptions retain their own placements.
4. A constrained-first greedy pass and bounded local improvements construct an incumbent. CP-SAT searches candidate choices with room, lecturer, and student-segment exclusivity. Objective phases preserve the best achieved higher-priority value. A feasible time-limited result is not advertised as globally optimal.
5. An independent validator checks the result and exact hours. A job writes only if input and draft revisions still match; otherwise it becomes stale and preserves newer work.
6. Publication validates again under the database revision lock, then atomically updates cohort publication pointers. Concurrent conflicting publication is rejected.

CP-SAT keeps intersecting resource and subgroup constraints explicit. Greedy/local search provides a fast incumbent and comparison baseline, but cannot reliably recover from difficult global choices. Both use the same candidates and validator. OR-Tools solves our university model rather than defining its rules.

The stored seed, snapshot, dependency versions, single solver worker, and hash support replay. Exact optimization results under a wall-clock cutoff may vary with machine load. Search budget excludes candidate preparation; both durations are reported. A complete solution may still violate soft preferences.

## Persistence

SQLAlchemy maps retained legacy catalogs and new tables. Alembic 0001 is additive with frozen table definitions; 0002 adds emergency disruptions and quality settings and removes the legacy fixed degree-duration constraint. Migrations were exercised against a restored legacy database and an empty SQL Server database. Destructive downgrade is refused; restore a backup instead.

Catalog writes, publication, and draft writes share a revision row lock. Catalog changes and publication advance the global data revision and invalidate older generation snapshots. Creating a draft, applying a generation result, moving/pinning a lesson, and recording an emergency cancellation do not advance that global revision: unpublished drafts do not change other drafts' constraints. Updates to an existing draft advance its own revision, preventing an older generation from overwriting manual edits. Authentication, notes, and feedback do not invalidate generation inputs. Published assignments are immutable; corrections require a new draft.

Workload changes are rejected once occurrences exist, preserving note and historical identity. Editing an already materialized curriculum requires a future revision/mapping workflow; the current version supports new semesters and their workloads. Catalog availability changes can expose conflicts in an existing publication: the administrator must create a corrected draft. The old publication stays visible until replacement, and the planner reports validity against current rules.

## Accounts and operations

Roles and student/lecturer membership are enforced server-side. Passwords use salted PBKDF2-SHA256; session and reset secrets are stored hashed. Cookies are HttpOnly and SameSite=Lax; authenticated writes require a CSRF token and allowed origin. Password changes/reset revoke sessions. Temporary credentials restrict access until changed.

Reset requests return the same response for known and unknown addresses. Tokens expire and are consumed only on successful password submission. Token creation and an encrypted mail outbox entry commit together. A separate I/O worker delivers mail with bounded retries, expiry/account checks and a stable Message-ID; ciphertext is removed after delivery or terminal failure. Fernet keys live outside Git and SQL. A crash after SMTP acceptance can cause a duplicate message containing the same single-use link. Local file-mail tests do not verify university SMTP delivery.

API restarts do not interrupt worker ownership. Claims have database-time leases, attempt numbers and increasing fencing tokens; expired owners cannot apply a result. Recovery schedules bounded retries or releases the draft guard atomically with a terminal state. Cancellation retains that guard until the solver stops or its ownership expires. Final result application, validation, draft revision, run status and guard release share one transaction. Admission is limited to four active generation jobs by default; a SQL gate enforces one running generation even if two coordinators are accidentally started.

The CPU child receives bounded JSON frames and a minimal environment without database/mail credentials. Windows Job Objects stop it on coordinator death; Linux has a parent-death hook, but local acceptance is on Windows. Each solver attempt has a memory cap and hard deadline. A process that cannot reap its child must stop instead of claiming more work. Lease fencing protects database state; it does not promise exactly-once SMTP delivery or zero delay after a computer crash.

## Interface

Active entry path: `main.tsx → App.tsx → system/Application.tsx`. Catalog schemas describe forms; server validation is authoritative. Personal schedules use SQL authorization predicates, date windows of at most 31 days and keyset pages of at most 500 lessons. Facets cover the authorized publication independently of the current page. Session, account membership and content revision are checked again after materialization; stale cursors are rejected. Private responses use no-store. No application cache is added: bounded joined queries remove the former per-lesson read overhead without introducing cache invalidation risks. Notes remain in native dialogs. Localization covers interface controls and rule messages; entered subject/faculty names remain as entered.

Prototype components outside the active import graph are retained for reference. The running application obtains account and timetable data from the API. Database credentials and demo password files stay out of the frontend bundle.
