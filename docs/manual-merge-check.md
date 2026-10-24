# Manual checks before merging

Use this checklist on `fix/manual-corrections-and-room-deletion`. Record the date,
commit, browser, database name, and pass/fail for each section. Run on an isolated
development database, not the university's original database. The steps below
include deliberate catalog changes and publication of test schedules.

## 1. Start the application

Follow the [README setup](../README.md#run-locally-on-windows). Install backend
and frontend dependencies, configure `backend/.env`, and run `alembic upgrade head`.
These fixes do not add a migration. Run one API process and the frontend in separate
terminals. Open http://localhost:3000 using that hostname consistently.

For demo data, use the `ChronoCampus_Development` database and run
`python -m app.manage seed-demo` from `backend`. Local credentials are in
`backend/.demo-credentials.json`. Alternatively create your own administrator with
`python -m app.manage create-admin EMAIL --name Administrator`.

Expected: the login screen loads; `/api/health` returns `{"status":"ok"}`;
administrator login opens the application. Complete any required password change.
Open browser developer tools and keep Console and Network visible during testing.

## 2. Room deletion regression

- [ ] As administrator, open **Data & rules**. Create a temporary equipment item
  called `Merge check projector`.
- [ ] Create a temporary room with a unique room number in an existing building.
  Select the projector as its equipment. Do not use this room in a schedule.
- [ ] Delete the room and confirm. Expected: deletion succeeds (HTTP 204), the room
  disappears, and it remains absent after refresh. The projector still exists.
- [ ] On a room already used by a draft or published schedule, select that projector
  as equipment and save. Attempt to delete that room. Expected: HTTP 409, the room
  remains, and reopening it still shows the projector. No equipment associations
  should be lost by the failed deletion.
- [ ] Remove the temporary equipment selection from the scheduled room, then delete
  the temporary projector. Expected: normal catalog operations still work.

If generation is used to create the scheduled room case, use its actual assigned
room from Planner; merely creating a room does not prove it has assignments.

## 3. Repair multiple invalid lessons manually

This is the primary regression check. Use a disposable cohort and room, or record
original capacities so you can restore them. Choose a cohort with at least two
lecture lessons in a generated draft, assigned to a room whose capacity can be
reduced below the cohort's size. Have a second classroom with sufficient capacity.
Use whole-cohort lessons so the required audience size is clear.

- [ ] In **Planner**, create a draft for a configured term/cohort and generate it.
  Expected: complete report with zero remaining hours. Record the draft name and
  two lecture dates/slots/rooms. Publish a baseline if none exists, then create a
  fresh draft to perform the edits.
- [ ] In **Data & rules → Rooms**, reduce the original lecture room's capacity below
  the cohort's size. Return to Planner, select the draft, and press **Refresh**.
  Expected: at least two lessons have room-capacity errors; publication is disabled.
- [ ] Edit one affected lecture, keep its date/slot, and select a sufficiently large
  compatible room that is free at that time. Save.
  Expected: HTTP 200, that lesson changes rooms, other capacity errors remain,
  the draft remains incomplete, and publication remains disabled.
- [ ] Refresh or reopen the draft. Expected: the saved correction persists.
- [ ] Try changing a lesson to the same date/slot as another lesson of the same
  teacher or cohort. Expected: HTTP 409 with a conflict message; reopening the
  draft shows the last successfully saved assignment. A pre-existing unrelated
  error must never allow a new conflict involving the lesson being edited.
- [ ] Try assigning an affected lesson to another undersized room. Expected:
  HTTP 409 with a capacity error, and no saved change.
- [ ] Repair the remaining affected lessons individually, choosing free, compatible,
  sufficiently large rooms. Expected: each valid correction saves. Once all issues
  are resolved, the report is complete, all remaining hours are zero, and publication
  is enabled.
- [ ] Publish. Expected: publication succeeds; the version becomes immutable.
  Student/lecturer schedules show the replacement after refresh.

Changing bell times can also invalidate several lessons. The same incremental
repair behavior applies, but the edited lesson must not overlap another lesson's
stored interval. Use a free date/slot when checking that case.

## 4. End-to-end acceptance

| Check | Action | Expected result |
| --- | --- | --- |
| Catalogs | Create, edit, refresh, and delete a temporary subject | Changes persist; unrelated records remain intact |
| Validation | Try a missing required field, invalid subgroup relationship, and excessive subgroup capacity | Clear error; invalid data is not saved |
| Generation | Generate a new draft with a recorded seed | Job progresses to a terminal status; report, hours, and unresolved lessons agree |
| Pins | Pin a valid lesson, then regenerate | Pinned date, slot, and room remain unchanged |
| Hard constraints | Try an unavailable room/teacher, wrong room type, and extra slot without permission | Each invalid edit is rejected |
| Calendars | Inspect full-time/part-time slots, teaching periods, and week parity | Dates and bell times match the configured calendar; exam-only dates are unavailable |
| Holidays | Generate across a configured holiday with exempt policy | Cancelled hours are reported separately; manually moving a normal lesson to a holiday to gain credit is rejected |
| Emergency | Cancel an unpinned lesson using the emergency action; generate before and after permitting a free extra slot on its original date | Initially unresolved and unpublishable; with permission, replacement stays on the original date in an extra slot |
| Stale jobs | Start generation and immediately change a catalog record before it finishes | Run becomes stale; its result does not overwrite the draft; regeneration uses the new inputs |
| Partial schedule | Use workload with no suitable room; generate | Report is incomplete; publication is blocked |
| Publication isolation | Edit an unpublished replacement draft | Personal schedules continue showing the previous publication until the replacement is published |
| Notes | As student, save a note; move the lesson in a replacement draft and publish; refresh as student | The note follows the same lesson; edit/delete still work |
| Roles | Sign in as student and lecturer | Each sees the relevant schedule; admin catalog requests return 403 |
| Privacy | Create a note and feedback thread, then sign in as another ordinary user | The other user's notes and feedback are absent |
| Feedback | Submit a request; reply and close as administrator | Author sees reply/status; replying to closed request is rejected |
| Passwords | Issue a temporary password and log in | Password change is required; after changing it, old sessions no longer work |
| Recovery | With local file mail configured and an allowed email domain, request and use a reset link | Local capture contains the link; it works once; reused/expired tokens fail |
| Languages | Switch Russian, Armenian, and English on touched screens | Labels/errors translate; entered catalog names remain unchanged |
| Mobile | Repeat schedule, note, and planner dialogs at 390px width | Controls remain reachable; no page-wide horizontal overflow |
| Session | Log out, then request a protected endpoint | Login is required; no private data is returned |

For negative API checks, use the browser Network panel's “Edit and resend”/“Copy
as fetch” facility where available, retaining the session and CSRF header. Do not
paste credentials or session tokens into shared screenshots or reports.

## 5. Automated checks and merge decision

From `backend` (Windows: substitute `.venv/Scripts/python.exe`):

```bash
.venv/bin/python -m pytest tests -q
```

From the repository root:

```bash
npm --prefix frontend run typecheck
npm --prefix frontend run build
git diff --check
```

Default tests use SQLite. Repeat the room deletion cases above against SQL Server.
For publication concurrency, follow the README's opt-in isolated SQL Server test
instructions. See [verification.md](verification.md) for the earlier system-wide
acceptance evidence and its limits; it does not certify this branch.

Merge when the automated checks pass and the manual cases above pass in your
SQL Server environment. Record any skipped cases and why. Restore temporary room
capacities and remove disposable catalog records where possible; keep published
test history in the isolated database. A failed check should include reproduction
steps, expected/actual results, and the HTTP response or console error.
