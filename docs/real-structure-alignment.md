# Timetable alignment verification

## WP-0 baseline

Application source revision `f2c77e2` ran 246 passing and 22 skipped backend tests in the Linux backend container. WP-0 added two metrics tests, yielding 248 passing and 22 skipped. The development database had no saved schedules or workloads. The legacy seed and draft snapshot builder ran inside a rolled-back development database transaction. The archived inputs contain scheduling data for the five synthetic cohorts. The two live administrators retain their accounts and sessions.

Each benchmark generates one unpublished draft per cohort and seed. Seeds 1, 2 and 3 run concurrently in separate processes, each with a 60-second search budget and one CP-SAT worker. Wall time includes candidate preparation. Each run reopens its draft archive for measurement, independently validates assignments and checks template expansion. A cohort-day is a civil date with at least one delivered lesson. Parallel subgroups count as one occupied pair. Series boundaries use workload occurrence ordinals and the saved calendar's teaching-week count.

The fifteen baseline drafts placed all 3,240 occurrences, had zero validator issues, zero cohort windows and zero varying series. All 1,017 occupied cohort-days started at pair one. Median wall time was 61.555 seconds, ranging from 54.047 to 62.412 seconds. The regression case for rotating rooms therefore requires a fixture with alternating room availability.

[Full per-cohort metrics and input digest](baseline-metrics.json) · [Frozen demo inputs](benchmarks/legacy-demo-inputs.json.gz)

From `backend/`, run each of the following three commands in its own terminal, changing the output directory for each code revision.

```sh
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python -m scripts.benchmark_timetable ../docs/benchmarks/legacy-demo-inputs.json.gz .logs/benchmark --seed 1
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python -m scripts.benchmark_timetable ../docs/benchmarks/legacy-demo-inputs.json.gz .logs/benchmark --seed 2
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python -m scripts.benchmark_timetable ../docs/benchmarks/legacy-demo-inputs.json.gz .logs/benchmark --seed 3
```

Use `python -m scripts.timetable_metrics VERSION_ID` for a saved database version or `python -m scripts.timetable_metrics --draft .logs/benchmark/DEMO-1-26-seed-1.json` for an archived benchmark draft.

## WP-1 recurring room

The solver locks a room per series by default. When the constructive schedule places everything, CP-SAT shares one decision variable across the regular dates of each common pattern. A partial solution retains per-date decisions. The API and both Planner forms expose the option. Queue requests persist it through retries and check it for idempotency. Pins and emergency makeups bypass the series pattern on their date. The application already prevents regeneration of versions with manual dated changes.

The 15 demo runs again placed 3,240 occurrences, with 15 exact roundtrips and zero conflicts, windows or varying series. Median wall time fell from 61.555 to 42.764 seconds (range 37.199–45.150). Alternating room closures in isolated tests produce the series diagnostic in both solvers. Full backend suite 252 passed, 22 skipped. Frontend types, all four test files and production build passed. No migration.

[WP-1 per-cohort results](benchmarks/wp-1-metrics.json)

## WP-2 compactness

Both solver objectives use the union of delivered subgroup slots on a cohort-date. The independent validator recomputes this metric from dated assignments. The generation report includes window slots, affected days, percentage and total skipped slots before the first lesson. The final preferences phase includes the editable calendar weight `late_start`, default 1, preserving coverage, windows and balance as higher priorities. Calendar reads and writes supply that default for older weight dictionaries. The previous weighted subgroup metric remains available as `student_leaf_gaps`. Publication eligibility and hard slot limits retain their prior rules.

All 15 legacy drafts matched baseline coverage, compactness, stability and reconstruction. Median wall time was 60.358 seconds (58.422–63.793). The 60-second setting governs search time. Candidate preparation is additional. Full backend suite 255 passed, 22 skipped. Frontend types, all four test files and production build passed. No migration.

[WP-2 per-cohort results](benchmarks/wp-2-metrics.json)
