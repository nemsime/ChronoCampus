# ChronoCampus seed dataset (built from the dean's files + the real Word timetables)

Everything here was extracted by script from: the dean's roster (`THTE_hamakazm_10_2026.xlsx`), the two room-occupancy tables
(`LAB1.14.docx`, `5.doc`) and the nine real timetables (`B1..B4kurs1*.doc`, `heraka-1..4-kurs.doc`).
Encoding: UTF-8 with BOM (opens correctly in Excel). All teacher names are replaced by pseudonymous IDs (`T001`…); the
mapping name→ID is deliberately NOT included (re-run the scripts locally on the Word files if you ever need it).

## Load order
1. `calendar_config.json`, `pair_times.csv`  — calendar rules and the 6 pair slots
2. `groups.csv`                              — 130 official groups (4 programs) with real 2026 sizes
3. `rooms.csv`                               — 123 rooms with real capacities (97 known)
4. `external_room_blocks.csv`                — room slots used by OTHER institutes (block these)
5. `curriculum_templates.csv` + `template_groups.csv` — what each real group studies and how often
6. `group_template_map.csv`                  — which real template each 2026 group should copy
7. `teachers_pseudonymized.csv`, `subjects.csv` — catalogs
8. `lessons_real_timetables.csv`             — gold data: every real lesson, for validating a solver
9. `room_occupancy.csv`                      — every room slot with week parity (reference)

## Files and columns
**groups.csv** — `group_code, program_level (bachelor|master), study_form (full_time|part_time), faculty_code (ՏՏ), admission_digit, admission_year, year_of_study (autumn 2026), specialty_code, suffix, students, is_empty, lab_parts_default (=ceil(n/16), 1 if n≤16), practical_parts_default (=ceil(n/23), 1 if n≤23), source_sheet`.
Code grammar: `[Հ part-time][Մ master][ՏՏ][admission digit][2-digit specialty][suffix]`; digit 6 = admitted 2026.

**rooms.csv** — `room_code, building, floor, room_on_floor, suffix, capacity, room_type_guess, week_rows, source_file, parse_note`.
`room_type_guess` is ONLY a capacity heuristic (≤18 small_or_lab, ≤45 classroom, else lecture_hall); the sources contain no room type.
5-digit codes starting with 1x are parsed as a 2-digit building (e.g. 17105) — see `parse_note`.

**room_occupancy.csv / external_room_blocks.csv** — `room_code, weekday, pair (1-4), parity (numerator|denominator|both), raw, group_codes, n_groups, is_tt_family, source_file`.
Parity: single-row room = both weeks; two rows = top numerator / bottom denominator; vertically merged cell = both.
`is_tt_family=0` rows are other institutes' groups (Ք…, Մ…, Լ…, ԻՏ…, ԷԷ…) → externally blocked slots. The tables cover only buildings 5 and 9 (partial).

**lessons_real_timetables.csv** — `source_file, study_form, year_of_study, group_code_original, faculty_letters, admission_digit, specialty_code, students, row_index, parity, weekday, pair, subject, lesson_type (lecture|practical|lab|pe|coursework), subgroup_no, teacher_ids, rooms`.
Full-time: parity from the stacked rows. **Part-time (heraka): parity is `unknown_rowN`** (the row meaning in those tables is not confirmed). Pairs 1–4 full-time, 1–5 part-time.

**template_groups.csv** — one row per real IT-institute group timetable: `template_id (file|group), study_form, year_of_study, specialty_code, students, lessons, distinct_subjects, observed_lab_parts, observed_practical_parts, days_used, max_pairs_in_a_day, weekly_pair_load`.

**curriculum_templates.csv** — per template × subject × type: `subgroup_count, pairs_per_week_per_subgroup, implied_semester_hours (=pairs/week × 32), teacher_ids, rooms_seen`.
Weekly lesson = 1.0, alternating-week lesson = 0.5 (full-time only).

**group_template_map.csv** — for each roster group: `match_level` = exact (same form + year of study + specialty) | nearest_year_same_specialty | other_year_same_specialty | none | not_applicable (master or empty group), and the `template_ids` to copy.
Result: 72 exact, 10 nearest-year, 1 other-year, 3 none (specialty 66 full-time, specialty 61 part-time), 44 not applicable.

## Verified properties (use as acceptance tests)
* Observed lab parts are within ±1 of `ceil(students/16)` in 49 of 49 groups with numbered labs; practical parts within ±1 of `ceil(students/23)` in 39 of 41.
* A full-time group occupies a median of 13 pairs per week (min 2.5, max 19.5) at group level.
* Pairs are 1–4 for full-time and 1–5 for part-time; extra pairs 5–6 exist only as temporary permissions.
* 6% of occupied room-slots hold two or more groups (shared lectures). The project owner decided to keep cohorts separate, so these are context only.

## Known limitations (do not treat as exact)
* Parse coverage for IT-institute groups: 2,351 lesson entries over 93 real group timetables; 5% lack a subject, 8% a teacher, 11% a room.
* About 6% of cells in other institutes' formats could not be parsed; they are not IT-institute groups.
* Real timetables are from several past years (2021–2025 admissions); the 2026 roster groups are matched to them by form + year of study + specialty, not copied one-to-one.
* Part-time (heraka) parity is unknown; year-V part-time and all master's programs have no timetable template.
* The roster lists 14 empty groups; six first-year part-time empty groups still hold room slots in the room tables (stale or pre-enrolment, unconfirmed).
* Suffixes `Ս`/`ա` and `-1/-2`, and the room marker `ԿԱ`, are stored as-is and not interpreted.
