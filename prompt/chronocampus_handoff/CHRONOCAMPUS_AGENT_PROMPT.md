# ChronoCampus — agent handoff: align the scheduling logic with the real university timetables

You are a coding agent working in the ChronoCampus repository (backend: FastAPI + SQLAlchemy + Alembic + OR-Tools CP-SAT; frontend: React/TypeScript). The repo owner reverse-engineered how their university (NPUA, Yerevan) really builds timetables from the original Word files and measured them. Your job is to make the application's scheduling logic and demo data match that reality **without breaking anything that already works**.

Read this whole file before touching code. Do not rely on any other conversation; everything you need is here.

---

## 0. Ground rules

1. **Evidence tags.** Every fact below is tagged:
   - `[CONFIRMED]` — stated by the project owner. Treat as a rule.
   - `[MEASURED]` — computed by script from the real Word timetables (147 group blocks across 4 full-time files). Treat as a strong estimate, not an exact figure.
   - `[OPEN]` — unknown. **Do not guess. Do not invent a default and present it as truth.** Implement it as a configurable setting, and list it in your final report.
2. **Authorization.** `DESIGN.md` says "do not change scheduling rules" — that applied to an earlier UI-only task. **This task explicitly authorizes changing the scheduling rules listed in section 4, and only those.**
3. **Decision already made by the owner: cohorts stay separate.** A lesson belongs to exactly one cohort (`CourseGroup`). **Do not implement shared/stream/combined classes across cohorts**, even though the real timetables contain them. Keep `docs/requirements.md` wording on this unchanged.
4. **Never destroy data.** Migrations are additive with working `downgrade()`. Existing rows must stay valid. Follow the existing Alembic style (`0008_dated_changes.py`; next revision is `0009_...`, `down_revision = "0008_dated_changes"`).
5. **Tests first, then change.** Run the backend suite before you start and record the baseline (docs claim 237 passed, 22 skipped; verify, don't trust). Re-run after every work package.
6. **Small steps.** One work package = one commit (or one small series). Branch from the current state, e.g. `feat/real-structure-alignment`.
7. **Never** edit the legacy `.doc` files in `docs/`, print credentials, or touch `backend/.demo-credentials.json`. Seeding stays restricted to the `ChronoCampus_Development` database as the existing seed enforces.
8. New user-visible strings need RU / HY / EN values (existing i18n). Requirements docs are in Russian — update `docs/requirements.md` in Russian.
9. If something here contradicts the code, **stop and report the contradiction** instead of picking a side silently.

---

## 1. What the real university timetable is

### 1.1 Time grid
- `[CONFIRMED]` Days Monday–Friday. The unit of time is a **pair** (two academic lessons). Word headers label pairs `1-2, 3-4, 5-6, 7-8` (full-time), `9-10` (extra for part-time), `11-12` (only in a temporary supplement). Mapping to slot numbers: `1-2`→slot 1 … `11-12`→slot 6.
- `[CONFIRMED]` Clock times (from the existing calendar rules): start 09:30, pair = 80 min, break 10 min, 30 min after pair 2. So: slot 1 09:30–10:50, slot 2 11:00–12:20, slot 3 12:50–14:10, slot 4 14:20–15:40, slot 5 15:50–17:10, slot 6 17:20–18:40. All values stay editable in `CalendarConfig`; times come from the shared server function.
- `[CONFIRMED]` Ordinary limit: 4 pairs/day full-time, 5 part-time (`ordinary_slots`). Extra pairs only by explicit `ExtraLessonPermission`.

### 1.2 Weeks
- `[CONFIRMED]` Weeks alternate **numerator → denominator** all semester; the first week (even if partial) is numerator. In the Word tables each group has two stacked rows: **top = numerator, bottom = denominator**; a vertically merged cell = the lesson happens every week. Holidays do **not** shift the alternation.
- `[CONFIRMED]` Holiday classes are **not** made up. If a teacher requests a day off, that lesson is moved to another day (use the existing dated-changes / disruption mechanism).
- `[CONFIRMED]` **The supplementary PDF** (weeks 05.10–09.10 labelled "հայտ", 12.10–16.10 labelled "համ", 2026): the city was closed for a special event and the university chose not to go online, so it added **temporary extra pairs (`9-10`, `11-12`) after the regular classes** on each day for two weeks to make up the lost teaching. It is an exception layer on top of the base timetable, not part of normal rules. This is already what `ExtraLessonPermission` models; do not turn it into a regular rule.

### 1.3 Cell format and class types
- Every cell entry reads `Subject / Type / Teacher(s) / Room`. Types: `Դաս` lecture, `Գործ` practical, `Լաբ` lab. A digit after the type (`Լաբ3`) is the subgroup number.
- `[MEASURED]` Class-type mix across cells: practical 941, lecture 735, lab 604 (≈ 42% / 33% / 27%).
- Two special entries have **no teacher and/or no room**: `Ֆիզկուլտուրա` (PE: no teacher, no room) and `Կուրսային աշխատանք` (course work: supervisors listed, "room" is the department, `Ամբիոն`). The current schema cannot store these (see WP-4).
- Several entries can share one slot cell: parallel subgroups in different rooms. Foreign-language practicals even run two subgroups with two teachers and two rooms in one cell.

### 1.4 Groups and subgroups
- `[CONFIRMED]` Group code = `[faculty letters][admission-year digit][2-digit specialty]`. Example `ՏՏ319` = Information Technologies faculty, admitted 2023 (digit 3; 419 = 2024), specialty 19 = software engineering (21 = computer engineering, 55 = cyber security). The project's `CourseGroup` (= specialty + admission year) already matches.
- `[CONFIRMED]` Subgroup sizes: lab subgroups ≈ 13–16 students, practical subgroups ≈ 19–23, depending on the cohort size.
- `[MEASURED]` Splitting by cohort size (lab / practical subgroup counts; noisy because some subjects have no labs or practicals): ≤ ~17 students → no split; ~18–33 → 2; ~36–48 → 3; ~50–66 → 4 labs / 3 practicals; ~69–76 → 5 labs / 3–4 practicals.
- `[MEASURED]` **Practical and lab subgroups are two independent partitions of the same cohort, not a nested tree.** Example ՏՏ419 (71 students) has 5 lab subgroups and 3 practical subgroups. Of 36 groups that have both numbered labs and numbered practicals, 20 have a lab count that is not a multiple of the practical count, so labs cannot be nested inside practical subgroups.
- `[MEASURED]` Lab rotation: several lab subjects run in the same slot in different rooms and lab subgroups swap subjects in adjacent slots, so each lab subgroup attends each subject once and one room holds one subgroup at a time. The lab partition (Լաբ1…Լաբն) is the **same** partition across all lab subjects of the cohort.
- `[CONFIRMED by dean's roster, Oct 2026]` Full code grammar: `[Հ = part-time][Մ = master][faculty letters][admission-year digit][2-digit specialty]`. Examples: `ՏՏ619` bachelor full-time, `ՄՏՏ619` master full-time, `ՀՏՏ620` bachelor part-time, `ՀՄՏՏ424` master part-time. The year digit is the admission year (6 = 2026 = year I, 5 = II, 4 = III, 3 = IV; part-time bachelor has five years, digits 6…2). Note the prefix `Մ` is ambiguous: it is a faculty code in `Մ626` but the master marker in `ՄՏՏ…`; resolve by the full roster, never by regex on one letter.
- `[OPEN]` Suffix `-1/-2` (e.g. `ԻՏ607-1`, `Ք54-2`) appears as a separate occupant in room tables, so it behaves like a subgroup of a group; the exact meaning is unconfirmed. Suffix `Ս` in the roster (`ՏՏ419Ս`, `ՏՏ319Ս`, `ՏՏ418Ս`, `ՏՏ318Ս`, only years III–IV, mostly paid) appears as lowercase `ա` in room tables (`ՏՏ419ա`): treated as separate groups with their own students and rooms. Do not model either suffix beyond storing it in the group code.
- `[OPEN]` Heraka (part-time) groups: Word labels like `ՀՏՏ320(1,2)` and `(3)`, a third unexplained row per group; part-time students attend about 2–3 days a week (owner is "not sure"). Do not change part-time behavior beyond what exists.

### 1.5 Rooms
- `[CONFIRMED]` Room code = building + floor + room number: `51109` = building 5, floor 11, room 09; `12304` = building 12, floor 3, room 04. (The model already has `building_number`, `floor_number`, `room_on_floor`, `room_number` as string — Armenian suffixes like `51204բ`, `9907ա` exist.)
- `[OPEN]` Codes `ԻՔ` and `ՕԼ` appear as rooms in some departmental timetables. Treat as unknown free-text rooms; do not interpret.
- `[CONFIRMED]` Labs must use lab rooms with the right equipment; capacity and equipment are hard constraints.

### 1.6 Load and constraints
- `[CONFIRMED]` Pairs per week depend on credits: roughly 1–3, a high-credit subject is more frequent. Existing conversion stays: `pairs = semester_hours / academic_hours_per_pair`; 16 weeks × 2 h → 32 h = weekly pair, 16 h = alternating-week pair. Do not change it.
- `[CONFIRMED]` The dean's office follows: "most optimal timetable", **no windows between lessons**, a maximum number of pairs per day, labs in lab rooms only, teacher day-off requests.
- `[MEASURED]` Real timetables are extremely compact: only **1%** of 677 group-days contain a window (counting the union of all subgroup and week rows, which is the conservative count). **84%** of group-days start at pair 1. Pairs per group-day: 3 → 49%, 4 → 28%, 2 → 21%, 1 → 2%. Use by pair 1/2/3/4: 717 / 808 / 712 / 284 — pair 4 is the least used. By weekday Mon…Fri: 512 / 544 / 519 / 501 / 445 — Friday lightest.

### 1.7 The dean's data (October 2026) — the authoritative source for sizes and rooms
The dean supplied three files: an Excel roster (`THTE_hamakazm_10_2026.xlsx`, institute ՏՀՏԷ) and two Word room-occupancy tables (`LAB1.14.docx`, `5.doc`). All numbers below were parsed by script.

**Roster (4 programs).** Bachelor full-time (`ՏՏ`), master full-time (`ՄՏՏ`), bachelor part-time (`ՀՏՏ`, years I–V), master part-time (`ՀՄՏՏ`). Columns: total students; free vs paid; special categories; academic leave. Do **not** model the category columns.
- Bachelor full-time: 69 groups, 65 non-empty. Students per year: I = 553, II = 385, III = 388, IV = 436.
- Cohort size bins (non-empty full-time bachelor groups): 1–5: 7, 6–10: 12, 11–15: 6, 16–20: 5, 21–30: 8, 31–45: 12, 46–60: 11, 61–80: 4. Median 24; largest 76, 69, 66, 66, 59, 56, 53, 51.
- **Attrition** (same specialty across years, year I → II → III → IV): `19`: 76 → 51 → 49 → 59; `55`: 66 → 51 → 42 → 49; `20`: 53 → 36 → 39 → 49; `21`: 66 → 31 → 36 → 36; `24`: 69 → 50 → 44 → 56. Roughly a 25–50% drop after year I, then flat (year IV can rise because of `Ս` groups).
- 14 groups have **zero students** (`ՏՏ669`, `ՏՏ607`, `ՏՏ569`, `ՏՏ507`, six first-year `ՀՏՏ6xx`, …). Six first-year part-time groups with 0 students still occupy room slots in the room tables. `[OPEN]` whether that is stale data or normal pre-enrolment planning: make "ignore cohorts with 0 students" a setting, default **warn, don't schedule**.

**Rooms (123 parsed; 97 with capacity).** Row = room, then capacity, then 20 slot cells (Mon–Fri × 4 pairs). Capacity histogram: ≤ 12 seats: 11 rooms; 14–18: 20; 20–26: 26; 28–35: 18; 40–50: 13; 55–80: 9 (max 80). Small rooms (8–18 seats) are computer/lab rooms; 50–80 seats are lecture halls.
- Rooms are **shared with other institutes**: besides ՏՏ-family codes (112), the tables contain `Ք…` (54 codes), `Մ…`, `Լ…`, `ԻՏ…`, `ԷԷ…`. Treat those slots as externally blocked, not as ChronoCampus cohorts (use the existing availability/blocked-resource mechanism; verify its name in `models.py`).
- **Two rows per room = the two week types** (96 rooms have 2 rows). Of 219 room-slots filled in both weeks, 136 are identical and **83 hold different groups in numerator vs denominator weeks**: rooms are genuinely shared by alternating weeks.
- `[MEASURED]` **Subgroup sessions are capacity-driven.** In 817 single-group cells with known group size, 416 (51%) are in a room smaller than the whole group, implying a subgroup session. Implied subgroup counts `ceil(size / capacity)`: 2: 237, 3: 96, 4: 48, 5: 19, 6: 13, 7+: 3. So **subgroup size must never exceed the assigned room's capacity**; verify `placement_errors` enforces this per audience size.
- **Streams exist but are a minority:** 118 of 1,931 occupied cells (6%) hold 2+ groups (74 with 2, 19 with 3, 11 with 4, 9 with 5, 3 with 6, 2 with 10). The owner decided to keep cohorts separate; this section is context only, **do not implement streams**.
- The marker `ԿԱ` appears in room cells (rooms of 16 seats). `[OPEN]` likely course work (`Կուրսային աշխատանք`) occupying a room, which means a course-work lesson **may** have a room: in WP-4 make the room **optional**, never forbidden.

---

## 2. Repository map (verified)

| Concern | Where |
|---|---|
| ORM models | `backend/app/db/models.py` (`CourseGroup`, `SmallGroup`, `LabGroup`, `Workload`=`CurriculumComponent`, `Occurrence`, `Assignment`=`LessonAssignment`, `CalendarConfig`, `Term`, `ExtraPermission`, `Availability`, …) |
| Migrations | `backend/alembic/versions/0001…0008`; new work = `0009_…` |
| Solver | `backend/app/scheduling/solver.py` — `candidates_for`, `series_weeks`, `constraint_search` (CP-SAT), `greedy_search`, `metrics`, `generate` |
| Validation | `backend/app/scheduling/validation.py` — `validation_context`, `placement_errors`, `validate` (independent validator; keep it independent) |
| Audience / overlap rules | `backend/app/calendar/rules.py` — `audience_leaves`, `audience_size`, `audiences_overlap`, `required_pairs` |
| Snapshot | `backend/app/scheduling/snapshot.py` |
| Template reconstruction (read-only) | `backend/app/scheduling/template.py`, `scripts/diagnose_template.py`, `scripts/verify_template.py` |
| Demo seed | `backend/app/demo.py`, `python -m app.manage …` |
| Tests | `backend/tests/` (SQLite fixtures; SQL Server tests opt-in and skipped) |
| Docs | `docs/requirements.md` (RU), `docs/semester-template.md`, `docs/demo-data.md`, `docs/architecture.md` |

Verified facts about current behavior you must know:
- `candidates_for` builds, for each lesson occurrence, candidates over every weekday × allowed slot × every room, filtered by `placement_errors`. Each candidate carries `series` (`"{component_id}:{series_index}"`) and `pattern = (option_index, weekday, slot)`. In `constraint_search`, a boolean per `(series, pattern)` is created and at most one pattern per series is allowed. **So weekday and slot are locked per series, but the room is not.**
- Resources occupied per candidate: `teacher:{id}`, `room:{id}`, and one `student:{leaf}` per leaf from `audience_leaves`.
- `audience_leaves` builds **disjoint leaves from a strict tree**: `CourseGroup` → `SmallGroup` → `LabGroup` (`LabGroup.small_group_id`). `audiences_overlap` has the same tree assumption.
- Student windows are a soft penalty (priority 2 after "all mandatory lessons placed"), per student leaf. Teacher gaps and daily balance are further soft terms.
- `Workload.teacher_id` is NOT NULL and `Assignment.room_id` is NOT NULL.
- `demo.py`: 5 cohorts `DEMO-n-26`, all with capacity 40, exactly 2 small groups of 20 and 4 labs of 10 nested; every subject is either practical or lab, never both.

---

## 3. Work packages (do them in this order)

### WP-0 — Baseline and measurement harness (no behavior change)
- Run the full backend suite; record pass/skip/fail counts.
- Add a small script `backend/scripts/timetable_metrics.py` that, for a saved `ScheduleVersion`, prints per-cohort: pairs per day histogram, first-pair-of-day histogram, windows (count and % of cohort-days, using the **union of all subgroup occupancy** per day), weekday load, and the number of series whose room or weekday/slot varies between weeks. This is your before/after instrument and is reused by WP-5.
- Acceptance: script runs on the existing demo versions; output recorded in your report.

### WP-1 — Make the room part of the series pattern
- **Problem.** Weekday+slot are locked per series but the room is not, so a weekly series can switch rooms (`docs/semester-template.md` documents a series alternating rooms 10/9). A real timetable has one room per series.
- **Change.** Include `room_id` in the series pattern (extend the pattern key, or add a per-series room variable linked to the candidates). Add a generation option `room_stability` (default **on**). When no single room can serve all dates of a locked series, report a diagnostic (e.g. `room_pattern_unsatisfiable` with the affected series) — **do not silently scatter** lessons (this is the principle already written in `docs/semester-template.md`, "Phase 2 proposal").
- Pins, dated exceptions, disruptions/make-ups and holiday cancellations still override only their own dates.
- Watch candidate explosion (weekday × slot × room × series). Benchmark on the demo data against the 60 s default limit and report timings before/after. If needed, prune rooms by capacity/type/equipment before pattern variables are created.
- Update `docs/semester-template.md` (its "Phase 2 — no solver changes" statement becomes partly outdated) and the affected tests/fixtures (`test_template.py`, `test_jobs_generation.py`, `test_scheduling.py`).
- **Acceptance:** on freshly generated demo drafts, every weekly or parity series has one weekday, one slot and one room across all its dates (except pins/exceptions); the independent validator reports no conflicts; `verify_template` still round-trips exactly.

### WP-2 — Compactness: windows and day start
- **Problem.** Real timetables have almost no windows (1% of group-days) and start at pair 1 (84%). The solver treats windows as one soft term among several.
- **Change (keep the documented priority order).** (a) Verify by test that the student-window term truly dominates the lower-priority terms (weights/lexicographic or scaled), and fix the weights if it does not. (b) Add a soft term that penalizes late starts of a cohort's day (first occupied slot index − 1), below windows in priority. (c) Define cohort-level windows as the union of occupied slots across all subgroups of the cohort on that day, and report this metric in the generation report. (d) Keep the ordinary-slot limit as a **hard** constraint, unchanged. (e) Add the new weight to `CalendarConfig.quality_weights` with a default; do not change existing keys.
- **Acceptance:** on the demo cohorts generation yields 0 cohort-level windows wherever the instance is feasible; if not feasible, windows are minimized and reported, and publication rules are unchanged. Show before/after from `timetable_metrics.py`.

### WP-3 — Independent practical and lab partitions (schema + overlap logic)
- **Problem.** Section 1.4 `[MEASURED]`: the tree `CourseGroup → SmallGroup → LabGroup` cannot represent 5 lab subgroups alongside 3 practical subgroups.
- **Target model.** Per cohort there are three audience kinds: the whole cohort (lectures), a **practical partition** `P1…Pm` and a **lab partition** `L1…Ln`, with `m` and `n` independent. The lab partition is shared by all lab subjects of the cohort.
- **Overlap contract (implement exactly; write these as tests):**

| Class A | Class B (same time, same cohort) | Allowed in parallel? |
|---|---|---|
| lecture (whole cohort) | anything | No |
| Pi | Pj, i ≠ j | Yes |
| Pi | Pi | No |
| Lj | Lk, j ≠ k | Yes |
| Lj | Lj | No |
| Pi | Lj | **No by default** (conservative: membership unknown). Add a setting `cross_partition_overlap` (`assume_overlap` default; leave room for a future exact student-membership mode) |
| any, cohort X | any, cohort Y ≠ X | Yes (resources still apply) |

- **Gap/window accounting** uses the cohort-level union (WP-2 (c)). Capacity checks use the subgroup's own size; lab equipment/room-type checks are unchanged.
- **Backward compatibility is mandatory.** Existing nested data must keep working unchanged. Suggested path: add `LabGroup.course_group_id` (backfilled from the parent small group), keep `small_group_id` nullable, and keep nested rows valid. Rewrite `audience_leaves` / `audiences_overlap` / `audience_size` behind the contract above. Do not change existing API response shapes without a compatibility field; if you must, list it in the report.
- Migration `0009_…` with `upgrade()` and `downgrade()`; update `backend/db/ChronoCampus.sql` only if the repo keeps it in sync (check first; do not break it).
- **Acceptance:** the contract table passes as unit tests; a cohort with 3 practical and 5 lab subgroups can be created, scheduled and validated; all pre-existing tests still pass.

### WP-4 — Lessons without a teacher or room (PE, course work)
- **Problem.** `Workload.teacher_id` and `Assignment.room_id` are NOT NULL, so `Ֆիզկուլտուրա` and `Կուրսային աշխատանք` cannot be stored.
- **Change.** Add lesson types `pe` and `coursework` (names are yours to choose; keep the existing `lecture` / `practical` / `lab` values untouched). Make `teacher_id` / `room_id` nullable **only** for these types, enforced by a CHECK constraint or validator (normal types must still require both). Course work may **optionally** carry a room (section 1.7, `ԿԱ`); PE has neither. Placement rules for them: no `room:` resource and no `teacher:` resource when null; they still occupy the cohort's slot for conflict and window accounting. Course work may carry supervisors (optional teacher). Update serializers, queries (`scheduling/queries.py`), template/export code, and the frontend types so a null room renders as "—" or "Department".
- **Acceptance:** such a lesson can be created, generated, validated, published and displayed; the existing validators still reject a normal lesson with no room or teacher.

### WP-5 — Realistic seed data (loader first, generator second)
**Source of truth: `chronocampus_seed_dataset.zip` (README inside).** It holds the official 130 groups with real sizes, 123 rooms with real capacities, other institutes' blocked room slots, curriculum templates with pseudonymous teachers, a roster-group → real-timetable mapping, and the real lessons as gold data. Step 1: write a loader (`python -m app.manage seed-from-dataset <dir>`) that imports it into the dev database following the README's load order, mapping each lesson type to the workload model, subgroup counts to the partitions from WP-3, and blocked slots to availability rules. Step 2: only for programs/years with no template (master's, year-V part-time, three specialties), fall back to the generator described below. Use the README's "Verified properties" as acceptance tests (subgroup parts ≈ `ceil(n/16)` for labs and `ceil(n/23)` for practicals, ~13 occupied pairs per group per week, 4 ordinary pairs full-time).
Replace the "five identical 40-student cohorts" with a generator that reproduces the real structure. Cohorts stay separate (no streams).
- New deterministic generator: `python -m app.manage seed-realistic --seed N [--cohorts K]` (or a module `app/demo_realistic.py` called from `manage.py`). Idempotent, restricted to `ChronoCampus_Development`, reuses the `ensure(...)` helper, random passwords written only to the ignored credentials file, **all names fictional** (no real people from the Word files).
- **Cohort codes:** `[faculty letters][admission digit][specialty 2 digits]`, e.g. `ՏՏ319`. Faculty letter weights from the data (group blocks per prefix): ՏՏ 58, Մ 38, ԷԷ ≈ 21, ԻՏ ≈ 14, Լ 11, Մթ ≈ 5. **Normalize the source's variants — do not reproduce typos** (`էԷ`→`ԷԷ`, `ՄԹ`→`Մթ`, `ԻՏՏՏ/ԻՏԲ/ԻՏԷԷ`→`ԻՏ`). Admission digits 1–4 (full-time, 4 years), roughly equal counts. Use realistic specialty numbers per faculty (e.g. ՏՏ: 09, 16, 18, 19, 20, 21, 22, 24, 38, 50, 55, 58, 60, 61, 68, 69).
- **Cohort size distribution (use the dean's 2026 roster, section 1.7, not the older estimate).** Sample non-empty cohort sizes from the roster bins and apply the attrition curve across years (year I is largest; year II ≈ 50–75% of year I; years III–IV roughly flat). Include a few empty cohorts so the "0 students" setting is exercised. Many small cohorts is real (19 of 65 non-empty full-time groups have ≤ 15 students). Generate all four programs (`ՏՏ`, `ՄՏՏ`, `ՀՏՏ`, `ՀՄՏՏ`), with part-time bachelor having five years.
- **Subgroups:** cohort ≤ ~17 → no split. Lab partition: `n_lab = round(size / 14.5)` (parts of 13–16). Practical partition: between `ceil(size / 23)` and `ceil(size / 16)` parts (parts of ~13–23). Sizes must sum to the cohort size. Partitions are independent (WP-3).
- **Subjects per cohort:** median 7, max 12. Each subject has a lecture; many also have a practical **or** a lab, some both. Class-type mix ≈ 42% practical / 33% lecture / 27% lab.
- **Hours:** lecture 16 or 32 h/semester (alternating vs weekly), a few 64 h for high-credit subjects; practical/lab 16 or 32 h. Use the existing hours→pairs rule; no fractional pairs.
- **Teachers:** fictional, each teaching several subjects/cohorts, sized so teacher load is feasible. Fixed per workload (existing rule). **Rooms:** codes `building+floor+room`, ~120 rooms with the real capacity histogram from section 1.7 (small lab rooms 8–18 seats, classrooms 20–35, halls 50–80), and equipment. Add some rooms/slots as **externally blocked** (other institutes) and let rooms alternate between groups in numerator and denominator weeks. Subgroup counts follow `ceil(size / room capacity)` for the rooms used, so lab partitions come out at 2–6 parts.
- Include a small number of PE and course-work workloads (WP-4). Include the existing demo accounts/deans behavior unchanged.
- **Verification (script + test):** generate drafts for all synthetic cohorts and assert: 0 unplaced mandatory lessons, 0 teacher/room/student conflicts per the independent validator, cohort windows ≈ 0, and that the synthetic cohort-size histogram and pairs-per-day histogram fall within ±10 percentage points of the `[MEASURED]` numbers above. Document the generator in `docs/demo-data.md` (parameters, distributions, what is fictional).

---

## 4. Out of scope — do not do
- Cohort merging / streams / shared lectures (owner decision, section 0.3).
- Automatic exam scheduling, Word import, Microsoft SSO, email notifications (already deferred).
- Redesigning the UI, changing auth, or changing unrelated API contracts.
- Interpreting the `[OPEN]` items in section 1 as rules.
- Connecting to the university's real database (its structure is unknown). If a task seems to need it, stop and ask.

## 5. Commands
From `backend/`: `python -m pytest tests -q`; ruff on changed files; `python -m scripts.verify_template`; `python -m scripts.diagnose_template`; `alembic upgrade head` against the dev DB only. If you touch the frontend: `npm --prefix frontend run typecheck`, `npm --prefix frontend test`, `npm --prefix frontend run build`.

## 6. Final report format (required)
1. Baseline vs final test counts.
2. Per work package: what changed, files touched, migration id, and the before/after output of `timetable_metrics.py`.
3. Solver timing before/after (demo data, default 60 s limit).
4. Any place where code and this document disagreed, and what you did.
5. Every `[OPEN]` item you had to leave configurable, with the setting name (including: empty cohorts, `Ս`/`ա` and `-1/-2` suffixes, `ԿԱ` rooms).
6. Anything you did **not** do and why.
