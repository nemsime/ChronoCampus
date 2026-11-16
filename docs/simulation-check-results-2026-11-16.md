# Simulation checking results — 16 November 2026

Commit: `37075a023ec8122fdf169f42070993a2498ad2a0`. Environment: Linux, Python 3.12.3, Node 22.23.4, npm 10.9.9. User timezone: Asia/Yerevan.

Backend: **227 passed, 0 failed, 22 skipped**. Frontend: **26 passed, 0 failed**. TypeScript, production build, Python Ruff and whitespace checks passed.

These are fresh automated results, not full manual acceptance. A passing test establishes only its assertions. The guide's six-occurrence fixture was not manually built; automated fixtures have their own expected counts. Existing development configuration/database was not modified.

## Commands and execution

| Check | Command | Method/result |
|---|---|---|
| Backend | `backend/.venv/bin/python -m pytest backend/tests -q -ra --junitxml=/tmp/chronocampus-pytest.xml` (300-second outer timeout) | Full suite, disposable SQLite fixtures and temporary files/processes; SQL tests opt in separately. See per-test results below. |
| Frontend | `npm --prefix frontend test` | 26 Node assertions over bundled application functions and React static markup; browser storage/media preferences and API failures are mocked. |
| Types | `npm --prefix frontend run typecheck` | TypeScript compiler, no emit; passed. |
| Build | `npm --prefix frontend run build` | Vite production build; 1,628 modules, passed. |
| Python correctness | `backend/.venv/bin/python -m ruff check backend/app backend/tests backend/alembic` | Static lint/import/correctness checks; passed. |
| Whitespace | `git diff --check` | Passed; rerun after writing this report. |

The sandbox caused even an empty FastAPI TestClient to hang entering its cross-thread portal. A minimal empty-app probe timed out inside the sandbox (20 seconds) and passed outside it. Hung diagnostic retries were interrupted. The full backend and frontend suites were therefore executed outside the sandbox. The first sandbox Node result listed only three files; the authoritative outside-sandbox result lists all 26 individual assertions. A separate sandbox core run also finished with 39 passed and 8 Windows skips; those overlap the full suite and are not added to its totals.

## Guide coverage and limits

| Guide area | Execution and remaining gap |
|---|---|
| Revised admin flow | Function/markup tests cover navigation, catalog reachability, semester scoping, compatible groups/hour totals, lost-generation-response retry, uncertain draft creation, languages and partial-result wording. Real tab keys, wizard clicks, layout and focus were not exercised. |
| ENV / preparation / smoke | In-process health/schema readiness, migration preservation, demo fixture behavior and an API generation→publication→personal schedule→note/support workflow. No live installation, CLI administrator creation or full launched SQL Server runtime. |
| AUTH / RESET / API | Server authorization, token/session/password/reset and request validation assertions. No real browser history/password visibility interaction or university mail delivery. Individual tests below define the actual negative cases exercised; the entire guide matrix is not claimed passed. |
| CAT / RULE | API persistence/validation and synthetic calendar/solver checks, including deletion rollback and curriculum immutability. No live editor/search/pagination interaction. |
| GEN / MOVE / HOL / PUB | Actual solver plus API/validator regression tests, simulated queues/revisions/leases. SQL transaction races and complete live worker restart/publication remain blocked without isolated SQL Server. |
| VIEW / NOTE / SUP | API scoping, filters/cursors, note retention/privacy and support lifecycle; grid/list markup assertions. No real polling/network UI, markup execution, dialogs or pagination clicks. |
| DIAG / RUN | API logging/audit/metrics/history and job recovery simulations; actual Linux helper-process cleanup/crash tests. No full launched application crash/restart, database outage or external monitoring acceptance. |
| UX / languages / accessibility | RU/HY/EN strings/markup, table semantics, media-preference and date helpers. No browser executable/automation package or desktop tool available; real layout at 360/390/1100px, keyboard focus, zoom, reduced motion, screen reader, landscape printing and physical devices remain BLOCKED. Native-language quality requires human review. |
| Dean appendix | Scope/privacy/read-only/version-diff and suggestion lifecycle/concurrency assertions; translated component markup. Browser interaction and printing remain unexecuted. |
| Cleanup/sign-off | Fixtures use temporary databases/files and owned helper processes. No live catalog/database changes to restore. Full guide acceptance remains INCOMPLETE. |

## Observations

- The 22 skips comprise 9 Windows-only cases and 13 cases requiring configured isolated SQL Server databases.
- Backend emitted one Starlette TestClient/httpx deprecation warning; it did not fail the tests.

- The guide says the desktop timetable opens as Grid; the current frontend test explicitly expects List on desktop and mobile. This is a documentation/expected-behavior mismatch, not a failing assertion.
- The guide includes old navigation names and an initial migration-head claim of `0004_jobs`, while its later dean appendix references `0007_dean_suggestions`. Verify actual migration head for deployment; this run does not certify a live SQL Server schema.
- SQL Server test database environment variables were unset: `CHRONOCAMPUS_TEST_DATABASE`, `CHRONOCAMPUS_RESET_TEST_DATABASE`, `CHRONOCAMPUS_QUEUE_TEST_DATABASES`. No retained database was substituted.

## How each backend group was executed

| Test module | Pass / fail / skip | Method |
|---|---|---|
| `tests.test_accounts` | 5 / 0 / 0 | AUTH / RESET / API: HTTP requests with test cookies/CSRF; verify stored token hashes, required password change, session revocation, uniform login errors and expired/single-use reset links. |
| `tests.test_api` | 6 / 0 / 0 | ENV / API: in-process health and missing-configuration requests; stub database cursor errors and check sanitization/closure. |
| `tests.test_catalogs` | 5 / 0 / 0 | CAT / AUTH: authenticated create/update/read/delete requests, reference validation, unknown fields, self-disable protection and unconfirmed academic units. |
| `tests.test_curriculum_integrity` | 10 / 0 / 0 | RULE / CAT / PUB: mutate academic settings and references around materialized workloads; independently validate and recheck publication. |
| `tests.test_dean` | 13 / 0 / 0 | Dean / API: parameterized role requests to administrator endpoints, dean creation/scope changes, bounded reads, private notes restriction, demo scope and migration DDL checks. |
| `tests.test_dean_review` | 24 / 0 / 0 | Dean: scoped version/diff reads, cursors, mixed-faculty fixtures, suggestion create/check/comment/withdraw/decision requests, stale decisions and audit checks. |
| `tests.test_demo` | 4 / 0 / 0 | Preparation: fixture-based demo account rotation, idempotency, scope additions and rejection of unintended database targets. |
| `tests.test_jobs_generation` | 11 / 0 / 0 | GEN / RUN / API: enqueue/replay/cancel jobs, advance simulated lease/time/state, change revisions/catalogs, block fake solver, and verify fencing, rollback and history. |
| `tests.test_jobs_process` | 12 / 0 / 1 | RUN: spawn real disposable helper subprocesses; inject malformed/oversized frames, crashes, deadlines, cancellation, blocked progress and memory exhaustion; verify child cleanup. |
| `tests.test_jobs_queue` | 5 / 0 / 0 | GEN / RUN: isolated SQLite transactions simulate claims, lease expiry, retry exhaustion, cancellation, owner fencing and independent queue slots. |
| `tests.test_local_runtime` | 0 / 0 / 7 | RUN: native Windows launcher/process-tree acceptance. Skipped on this Linux host. |
| `tests.test_local_runtime_linux` | 7 / 0 / 0 | RUN: real temporary Linux child/grandchild processes, group cleanup, supervisor death and stubborn children; isolated launcher state tests for locks/rollback. |
| `tests.test_mail_jobs` | 26 / 0 / 0 | RESET / RUN: temporary encrypted outbox, captured/stub SMTP and local files; tamper/key rotation/retry/expiry/crash/ownership/heartbeat tests, including disk-database restart. |
| `tests.test_observability` | 13 / 0 / 0 | DIAG / ENV: issue instrumented API calls; inspect safe events/audit/history/metrics/readiness, simulate logging/progress failures and compare input hashes. |
| `tests.test_password_recovery` | 12 / 0 / 0 | RESET / AUTH: issue reset requests, consume captured test emails, test expiry/rate limits/session invalidation; fake SMTP transports and delivery failure. |
| `tests.test_registration` | 5 / 0 / 0 | AUTH / RESET: fictional account registration/verification/resend/reset requests with captured mail, expired links, role/domain/origin/rate-limit validation. |
| `tests.test_registration_migration` | 1 / 0 / 0 | ENV: create a disposable legacy SQLite database, apply migration and verify existing accounts/reset links survive. |
| `tests.test_runtime_diagnostics` | 1 / 0 / 0 | DIAG: request durable job diagnostics with test roles and verify privacy, bounded output and absence of payloads. |
| `tests.test_schedule_queries` | 29 / 0 / 0 | VIEW / API: query published fixture lessons as different roles; test audience scope, filters, cursor/date validation, concurrent-change injection and constant query counts. |
| `tests.test_scheduling` | 9 / 0 / 0 | RULE / GEN / MOVE / HOL: feed synthetic snapshots to the actual CP-SAT and greedy/local solvers and independent validator; assert reproducibility, exact hours, pins, occupancy, holidays, availability and room/audience rules. |
| `tests.test_sqlserver_jobs` | 0 / 0 / 7 | RUN: real SQL Server concurrent claims, fencing, lock waits, heartbeat and restart checks. Require explicitly named disposable SQL Server databases. |
| `tests.test_sqlserver_password_recovery` | 0 / 0 / 6 | RESET: real SQL Server reset concurrency, database clock and limits. Requires an explicitly named disposable SQL Server database. |
| `tests.test_sqlserver_publication` | 0 / 0 / 1 | PUB-08: concurrent conflicting publications against isolated SQL Server. Requires an explicitly named disposable SQL Server database. |
| `tests.test_utc` | 5 / 0 / 0 | RULE / DIAG: parameterized timestamp conversion/round-trip and timezone-aware UTC clock assertions. |
| `tests.test_workflow` | 15 / 0 / 0 | GEN / MOVE / HOL / PUB / VIEW / NOTE / SUP / CAT: build disposable campus through APIs; generate/publish/replace schedules, move a noted occurrence, verify note privacy/retention, feedback lifecycle, stale inputs, emergency makeup, individual repairs and room-delete rollback. |
| `tests.test_workspace` | 9 / 0 / 0 | VIEW / API: personal/admin overview requests across roles; check date bounds, scoped counts, no private bodies, bounded queries and in-flight session changes. |

## Every backend test result

Parameterized variants are separate executed cases. Skipped checks were collected but not executed.

### tests.test_accounts

| Test | Result | Reason if skipped/failed |
|---|---|---|
| `test_server_role_and_cookie_and_csrf` | PASS |  |
| `test_invalid_login_is_uniform` | PASS |  |
| `test_temporary_password_is_restricted_until_changed` | PASS |  |
| `test_reset_only_post_changes_password_and_token_is_single_use` | PASS |  |
| `test_expired_reset_token_and_foreign_origin` | PASS |  |

### tests.test_api

| Test | Result | Reason if skipped/failed |
|---|---|---|
| `test_health_without_database` | PASS |  |
| `test_health_starts_when_database_is_not_configured` | PASS |  |
| `test_groups_maps_database_columns_and_closes_cursor` | PASS |  |
| `test_missing_database_configuration` | PASS |  |
| `test_database_error_is_sanitized_and_connection_closed` | PASS |  |
| `test_empty_database_returns_empty_list` | PASS |  |

### tests.test_catalogs

| Test | Result | Reason if skipped/failed |
|---|---|---|
| `test_catalog_requires_authentication` | PASS |  |
| `test_catalog_persistence_validation_and_references` | PASS |  |
| `test_unknown_fields_are_rejected_without_echoing_password` | PASS |  |
| `test_cannot_disable_current_admin` | PASS |  |
| `test_unconfirmed_calendar_can_store_unknown_units` | PASS |  |

### tests.test_curriculum_integrity

| Test | Result | Reason if skipped/failed |
|---|---|---|
| `test_validator_never_completes_with_an_unplaced_emergency` | PASS |  |
| `test_validator_rejects_incompatible_study_form` | PASS |  |
| `test_publication_rechecks_teaching_week_count` | PASS |  |
| `test_calendar_units_cannot_change_materialized_workload[None]` | PASS |  |
| `test_calendar_units_cannot_change_materialized_workload[1]` | PASS |  |
| `test_calendar_units_cannot_change_materialized_workload[4]` | PASS |  |
| `test_term_calendar_reassignment_preserves_materialized_units` | PASS |  |
| `test_calendar_and_term_edits_cannot_cross_study_forms` | PASS |  |
| `test_units_must_divide_existing_unmaterialized_workloads` | PASS |  |
| `test_equipment_referenced_only_by_workload_cannot_be_deleted` | PASS |  |

### tests.test_dean

| Test | Result | Reason if skipped/failed |
|---|---|---|
| `test_every_administrator_route_rejects_nonadministrators[dean]` | PASS |  |
| `test_every_administrator_route_rejects_nonadministrators[student]` | PASS |  |
| `test_every_administrator_route_rejects_nonadministrators[teacher]` | PASS |  |
| `test_create_dean_login_password_change_scope_and_role_cleanup` | PASS |  |
| `test_account_scope_validation[changes0-faculty_dean_only]` | PASS |  |
| `test_account_scope_validation[changes1-student_membership_only]` | PASS |  |
| `test_account_scope_validation[changes2-invalid_reference]` | PASS |  |
| `test_university_dean_and_registration_cannot_choose_role` | PASS |  |
| `test_note_authorization_is_bounded_and_dean_has_no_personal_notes` | PASS |  |
| `test_dean_overview_has_real_scoped_counts_and_no_admin_fields` | PASS |  |
| `test_probe_and_error_allowlist` | PASS |  |
| `test_migration_is_frozen_additive_sql_server_ddl` | PASS |  |
| `test_demo_deans_have_scopes_and_seed_remains_idempotent` | PASS |  |

### tests.test_dean_review

| Test | Result | Reason if skipped/failed |
|---|---|---|
| `test_version_reads_scoping_and_draft_privacy` | PASS |  |
| `test_version_cursors_include_version_and_draft_revision` | PASS |  |
| `test_review_revalidates_faculty_changes_during_read` | PASS |  |
| `test_mixed_faculty_versions_hide_foreign_lessons_and_summary` | PASS |  |
| `test_diff_changes_counts_pagination_and_scope` | PASS |  |
| `test_suggestions_create_without_schedule_writes_and_private_audit[move]` | PASS |  |
| `test_suggestions_create_without_schedule_writes_and_private_audit[room]` | PASS |  |
| `test_suggestions_create_without_schedule_writes_and_private_audit[cancel]` | PASS |  |
| `test_suggestions_create_without_schedule_writes_and_private_audit[other]` | PASS |  |
| `test_invalid_move_combinations[overrides0]` | PASS |  |
| `test_invalid_move_combinations[overrides1]` | PASS |  |
| `test_invalid_move_combinations[overrides2]` | PASS |  |
| `test_invalid_move_combinations[overrides3]` | PASS |  |
| `test_invalid_move_combinations[overrides4]` | PASS |  |
| `test_invalid_move_combinations[overrides5]` | PASS |  |
| `test_invalid_move_combinations[overrides6]` | PASS |  |
| `test_invalid_move_combinations[overrides7]` | PASS |  |
| `test_invalid_move_combinations[overrides8]` | PASS |  |
| `test_scope_ownership_validation_and_suggestion_quota` | PASS |  |
| `test_suggestion_lifecycle_comments_concurrency_and_audit` | PASS |  |
| `test_withdraw_reject_and_closed_comment_rules` | PASS |  |
| `test_check_reuses_move_validation_and_never_writes` | PASS |  |
| `test_outdated_only_after_anchored_lesson_changes` | PASS |  |
| `test_suggestion_csrf_origin_and_no_student_access` | PASS |  |

### tests.test_demo

| Test | Result | Reason if skipped/failed |
|---|---|---|
| `test_seed_account_rotates_existing_demo_credentials` | PASS |  |
| `test_seed_account_does_not_reset_an_unexpected_role` | PASS |  |
| `test_add_demo_deans_preserves_existing_accounts_credentials_and_timetables` | PASS |  |
| `test_add_demo_deans_rejects_other_databases` | PASS |  |

### tests.test_jobs_generation

| Test | Result | Reason if skipped/failed |
|---|---|---|
| `test_admission_replay_before_quota_and_revision` | PASS |  |
| `test_queued_cancel_releases_guard_and_history` | PASS |  |
| `test_running_cancel_keeps_guard_until_stopped` | PASS |  |
| `test_retry_snapshot_reused_and_revision_change_terminal` | PASS |  |
| `test_expired_cancel_recovery_and_stale_apply_rejected` | PASS |  |
| `test_catalog_change_after_claim_rejects_result` | PASS |  |
| `test_heartbeat_independent_of_blocked_solver` | PASS |  |
| `test_final_fence_failure_rolls_back_assignments_and_version` | PASS |  |
| `test_retry_exhaustion_finalizes_run_attempt_and_guard` | PASS |  |
| `test_api_restart_preserves_live_job` | PASS |  |
| `test_expired_exhausted_attempt_releases_guard_atomically` | PASS |  |

### tests.test_jobs_process

| Test | Result | Reason if skipped/failed |
|---|---|---|
| `test_frames_check_prefix_before_reading_and_environment` | PASS |  |
| `test_child_crash_malformed_oversized_and_blocked_input[import sys; sys.exit(7)]` | PASS |  |
| `test_child_crash_malformed_oversized_and_blocked_input[import sys,struct; sys.stdout.buffer.write(struct.pack('!I', 999999999)); sys.stdout.buffer.flush()]` | PASS |  |
| `test_child_crash_malformed_oversized_and_blocked_input[import sys,struct; sys.stdout.buffer.write(struct.pack('!I', 5)+b'nope!'); sys.stdout.buffer.flush()]` | PASS |  |
| `test_child_crash_malformed_oversized_and_blocked_input[body3]` | PASS |  |
| `test_input_size_rejected_before_spawn` | PASS |  |
| `test_cancel_and_deadline_reap_child[cancel]` | PASS |  |
| `test_cancel_and_deadline_reap_child[deadline]` | PASS |  |
| `test_containment_failure_sends_no_input_and_reaps` | SKIPPED | Windows containment API |
| `test_parent_hard_death_kills_cpu_child` | PASS |  |
| `test_blocked_progress_cannot_block_deadline_or_reaping` | PASS |  |
| `test_oversized_progress_rejected_from_prefix` | PASS |  |
| `test_os_memory_limit_is_enforced` | PASS |  |

### tests.test_jobs_queue

| Test | Result | Reason if skipped/failed |
|---|---|---|
| `test_claim_fencing_attempts_and_deadline` | PASS |  |
| `test_retry_recovery_exhaustion_and_stale_owner` | PASS |  |
| `test_generation_global_slot_independent_mail_and_cancel_lease` | PASS |  |
| `test_deadline_cannot_be_extended_by_heartbeat` | PASS |  |
| `test_lock_owned_rechecks_time_after_lock_wait` | PASS |  |

### tests.test_local_runtime

| Test | Result | Reason if skipped/failed |
|---|---|---|
| `test_reused_pid_does_not_authorize_stop` | SKIPPED | Native Windows launcher acceptance |
| `test_foreign_port_owner_is_preserved` | SKIPPED | Native Windows launcher acceptance |
| `test_exclusive_start_and_idempotent_stopped_state` | SKIPPED | Native Windows launcher acceptance |
| `test_closing_job_terminates_child_and_grandchild` | SKIPPED | Native Windows launcher acceptance |
| `test_parent_hard_death_terminates_owned_tree` | SKIPPED | Native Windows launcher acceptance |
| `test_partial_start_rolls_back_only_owned_children` | SKIPPED | Native Windows launcher acceptance |
| `test_parent_death_before_create_returns_cannot_orphan_suspended_child` | SKIPPED | Native Windows launcher acceptance |

### tests.test_local_runtime_linux

| Test | Result | Reason if skipped/failed |
|---|---|---|
| `test_linux_process_identity_and_process_group_cleanup` | PASS |  |
| `test_linux_stop_event_uses_launch_specific_file` | PASS |  |
| `test_linux_cleanup_kills_stubborn_descendants_after_leader_exit[False]` | PASS |  |
| `test_linux_cleanup_kills_stubborn_descendants_after_leader_exit[True]` | PASS |  |
| `test_linux_runtime_lock_rejects_a_second_owner` | PASS |  |
| `test_linux_child_exits_when_supervisor_dies` | PASS |  |
| `test_linux_partial_start_rolls_back_owned_children` | PASS |  |

### tests.test_mail_jobs

| Test | Result | Reason if skipped/failed |
|---|---|---|
| `test_atomic_rollback` | PASS |  |
| `test_known_unknown_and_missing_key_uniform` | PASS |  |
| `test_encryption_and_delivery_persist` | PASS |  |
| `test_invalid_reset_never_delivered[expired]` | PASS |  |
| `test_invalid_reset_never_delivered[used]` | PASS |  |
| `test_invalid_reset_never_delivered[inactive]` | PASS |  |
| `test_invalid_reset_never_delivered[changed_email]` | PASS |  |
| `test_tamper_rejected` | PASS |  |
| `test_key_rotation_preserves_pending_and_never_overwrites` | PASS |  |
| `test_missing_old_key_retries_then_erases` | PASS |  |
| `test_retry_and_redaction` | PASS |  |
| `test_restart_with_disk_database` | PASS |  |
| `test_file_replay_uses_one_stable_name` | PASS |  |
| `test_maintenance_is_bounded_and_preserves_active_references` | PASS |  |
| `test_crash_after_file_write_replays_without_duplicate` | PASS |  |
| `test_lost_owner_cannot_finalize_or_erase_payload` | PASS |  |
| `test_independent_heartbeat_during_blocked_delivery` | PASS |  |
| `test_exhausted_crash_recovery_erases_ciphertext_immediately` | PASS |  |
| `test_reset_delivery_is_independent_of_outbox_keys` | PASS |  |
| `test_malformed_existing_key_is_never_replaced` | PASS |  |
| `test_smtp_timeout_and_message_identity` | PASS |  |
| `test_main_honors_local_shutdown` | PASS |  |
| `test_mail_expires_during_smtp_setup` | PASS |  |
| `test_mail_expires_before_atomic_file_publication` | PASS |  |
| `test_mail_claim_preserves_token_expiry` | PASS |  |
| `test_expired_queued_mail_never_waits_for_backoff` | PASS |  |

### tests.test_observability

| Test | Result | Reason if skipped/failed |
|---|---|---|
| `test_unhandled_exception_is_correlated_and_secret_free` | PASS |  |
| `test_diagnostics_role_boundaries_and_limits` | PASS |  |
| `test_audit_is_atomic_and_excludes_personal_fields` | PASS |  |
| `test_run_history_progress_correlation_and_failed_run` | PASS |  |
| `test_worker_recovery_leaves_queued_runs_intact` | PASS |  |
| `test_logging_failure_does_not_fail_request` | PASS |  |
| `test_metrics_token_is_scoped_and_histograms_valid` | PASS |  |
| `test_frontend_report_is_bounded_and_payload_free` | PASS |  |
| `test_readiness_checks_schema_not_only_connection` | PASS |  |
| `test_progress_storage_failure_preserves_solver_result` | PASS |  |
| `test_comparison_hash_distinguishes_rules_from_bookkeeping` | PASS |  |
| `test_file_rotation_is_bounded_and_valid_json` | PASS |  |
| `test_database_query_instrumentation_counts_failures` | PASS |  |

### tests.test_password_recovery

| Test | Result | Reason if skipped/failed |
|---|---|---|
| `test_reset_hash_only_and_password_and_sessions` | PASS |  |
| `test_generic_failures[expired]` | PASS |  |
| `test_generic_failures[used]` | PASS |  |
| `test_generic_failures[inactive]` | PASS |  |
| `test_generic_failures[verification]` | PASS |  |
| `test_rate_limit_and_invalidation` | PASS |  |
| `test_mail_failure_never_changes_response_or_leaks_secrets` | PASS |  |
| `test_smtp_transports_and_empty_credentials[465-True-False]` | PASS |  |
| `test_smtp_transports_and_empty_credentials[587-False-True]` | PASS |  |
| `test_smtp_transports_and_empty_credentials[1025-False-False]` | PASS |  |
| `test_ip_limit_preserves_generic_response` | PASS |  |
| `test_maintenance_retains_rate_limit_history` | PASS |  |

### tests.test_registration

| Test | Result | Reason if skipped/failed |
|---|---|---|
| `test_registration_verification_and_forgot_password` | PASS |  |
| `test_existing_account_is_not_overwritten` | PASS |  |
| `test_resend_does_not_grant_privileges_and_old_links_are_consumed` | PASS |  |
| `test_expired_disabled_and_short_password_verification` | PASS |  |
| `test_registration_domain_validation_origin_throttle_and_configuration` | PASS |  |

### tests.test_registration_migration

| Test | Result | Reason if skipped/failed |
|---|---|---|
| `test_registration_migration_preserves_existing_accounts_and_reset_links` | PASS |  |

### tests.test_runtime_diagnostics

| Test | Result | Reason if skipped/failed |
|---|---|---|
| `test_durable_jobs_view_is_private_bounded_and_has_no_payload` | PASS |  |

### tests.test_schedule_queries

| Test | Result | Reason if skipped/failed |
|---|---|---|
| `test_matches_domain_rules_and_lesson_fields[None-None]` | PASS |  |
| `test_matches_domain_rules_and_lesson_fields[0-None]` | PASS |  |
| `test_matches_domain_rules_and_lesson_fields[0-0]` | PASS |  |
| `test_matches_domain_rules_and_lesson_fields[0-1]` | PASS |  |
| `test_matches_domain_rules_and_lesson_fields[1-None]` | PASS |  |
| `test_keyset_scope_filters_revision_bounds_and_facets` | PASS |  |
| `test_malformed_cursors[None]` | PASS |  |
| `test_malformed_cursors[payload1]` | PASS |  |
| `test_malformed_cursors[payload2]` | PASS |  |
| `test_malformed_cursors[payload3]` | PASS |  |
| `test_malformed_cursors[payload4]` | PASS |  |
| `test_malformed_cursors[payload5]` | PASS |  |
| `test_malformed_cursors[payload6]` | PASS |  |
| `test_malformed_cursors[payload7]` | PASS |  |
| `test_nonstudent_roles[teacher-7]` | PASS |  |
| `test_nonstudent_roles[admin-7]` | PASS |  |
| `test_lecturer_defaults_to_own_lessons_and_cannot_select_another_lecturer` | PASS |  |
| `test_inflight_changes[revoked-page]` | PASS |  |
| `test_inflight_changes[revoked-facets]` | PASS |  |
| `test_inflight_changes[inactive-page]` | PASS |  |
| `test_inflight_changes[inactive-facets]` | PASS |  |
| `test_inflight_changes[membership-page]` | PASS |  |
| `test_inflight_changes[membership-facets]` | PASS |  |
| `test_inflight_changes[role-page]` | PASS |  |
| `test_inflight_changes[role-facets]` | PASS |  |
| `test_inflight_changes[revision-page]` | PASS |  |
| `test_inflight_changes[revision-facets]` | PASS |  |
| `test_repeated_changes_return_conflict` | PASS |  |
| `test_constant_query_count_and_legacy_cap` | PASS |  |

### tests.test_scheduling

| Test | Result | Reason if skipped/failed |
|---|---|---|
| `test_dynamic_clock_and_partial_week_parity` | PASS |  |
| `test_complete_valid_generation_and_reproducibility[cp_sat]` | PASS |  |
| `test_complete_valid_generation_and_reproducibility[greedy_local]` | PASS |  |
| `test_no_laboratory_produces_partial_report_without_dropping_load` | PASS |  |
| `test_pin_and_external_occupancy_are_preserved` | PASS |  |
| `test_holiday_is_cancelled_without_makeup_and_counts_separately` | PASS |  |
| `test_manual_validation_catches_room_capacity_and_subgroup_overlap` | PASS |  |
| `test_extra_permission_does_not_override_room_closure` | PASS |  |
| `test_missing_teaching_period_cannot_schedule_exams` | PASS |  |

### tests.test_sqlserver_jobs

| Test | Result | Reason if skipped/failed |
|---|---|---|
| `test_single_generation_claim_and_stale_owner_fence[None]` | SKIPPED | Set CHRONOCAMPUS_QUEUE_TEST_DATABASES to isolated migrated RCSI OFF/ON databases |
| `test_expired_mail_owner_cannot_finish_and_retry_is_bounded[None]` | SKIPPED | Set CHRONOCAMPUS_QUEUE_TEST_DATABASES to isolated migrated RCSI OFF/ON databases |
| `test_sql_generation_survives_api_restart_and_publishes_bounded_reads[None]` | SKIPPED | Set CHRONOCAMPUS_QUEUE_TEST_DATABASES to isolated migrated RCSI OFF/ON databases |
| `test_renewal_cannot_resurrect_ownership_after_sql_lock_wait[None-lease_until]` | SKIPPED | Set CHRONOCAMPUS_QUEUE_TEST_DATABASES to isolated migrated RCSI OFF/ON databases |
| `test_renewal_cannot_resurrect_ownership_after_sql_lock_wait[None-deadline_at]` | SKIPPED | Set CHRONOCAMPUS_QUEUE_TEST_DATABASES to isolated migrated RCSI OFF/ON databases |
| `test_snapshot_preparation_renews_lease_without_locking_heartbeat[None]` | SKIPPED | Set CHRONOCAMPUS_QUEUE_TEST_DATABASES to isolated migrated RCSI OFF/ON databases |
| `test_coordinator_hard_death_reaps_solver_and_next_process_recovers[None]` | SKIPPED | Windows coordinator hard-death acceptance |

### tests.test_sqlserver_password_recovery

| Test | Result | Reason if skipped/failed |
|---|---|---|
| `test_sql_same_token_has_exactly_one_success` | SKIPPED | Set CHRONOCAMPUS_RESET_TEST_DATABASE to an isolated migrated database |
| `test_sql_rejects_bad_links_and_preserves_password[expired]` | SKIPPED | Set CHRONOCAMPUS_RESET_TEST_DATABASE to an isolated migrated database |
| `test_sql_rejects_bad_links_and_preserves_password[used]` | SKIPPED | Set CHRONOCAMPUS_RESET_TEST_DATABASE to an isolated migrated database |
| `test_sql_rejects_bad_links_and_preserves_password[inactive]` | SKIPPED | Set CHRONOCAMPUS_RESET_TEST_DATABASE to an isolated migrated database |
| `test_sql_rejects_bad_links_and_preserves_password[verification]` | SKIPPED | Set CHRONOCAMPUS_RESET_TEST_DATABASE to an isolated migrated database |
| `test_sql_request_uses_db_clock_and_silent_hourly_limit` | SKIPPED | Set CHRONOCAMPUS_RESET_TEST_DATABASE to an isolated migrated database |

### tests.test_sqlserver_publication

| Test | Result | Reason if skipped/failed |
|---|---|---|
| `test_concurrent_publications_serialize_conflicts` | SKIPPED | Set CHRONOCAMPUS_TEST_DATABASE to an isolated migrated SQL Server database |

### tests.test_utc

| Test | Result | Reason if skipped/failed |
|---|---|---|
| `test_timestamp_round_trip[value0]` | PASS |  |
| `test_timestamp_round_trip[value1]` | PASS |  |
| `test_timestamp_round_trip[value2]` | PASS |  |
| `test_timestamp_round_trip[None]` | PASS |  |
| `test_clock_is_aware_utc` | PASS |  |

### tests.test_workflow

| Test | Result | Reason if skipped/failed |
|---|---|---|
| `test_generation_publication_note_survives_move_and_privacy` | PASS |  |
| `test_catalog_edits_before_claim_are_included_in_snapshot` | PASS |  |
| `test_queued_generations_for_different_drafts_both_apply` | PASS |  |
| `test_other_draft_changes_preserve_queued_generation[create]` | PASS |  |
| `test_other_draft_changes_preserve_queued_generation[pin]` | PASS |  |
| `test_other_draft_changes_preserve_queued_generation[emergency]` | PASS |  |
| `test_own_draft_changes_reject_queued_generation[pin]` | PASS |  |
| `test_own_draft_changes_reject_queued_generation[emergency]` | PASS |  |
| `test_publication_before_claim_is_included_in_snapshot` | PASS |  |
| `test_emergency_requires_explicit_extra_permission` | PASS |  |
| `test_feedback_private_status_and_closed_reply` | PASS |  |
| `test_lab_hierarchy_capacity_and_missing_period` | PASS |  |
| `test_manual_move_cannot_manufacture_holiday_credit` | PASS |  |
| `test_manual_repairs_allow_unrelated_conflicts_but_block_edited_conflicts` | PASS |  |
| `test_room_deletion_cleans_equipment_and_rolls_back_if_scheduled` | PASS |  |

### tests.test_workspace

| Test | Result | Reason if skipped/failed |
|---|---|---|
| `test_overview_main_route_requires_a_session` | PASS |  |
| `test_overview_is_personal_and_never_returns_private_bodies` | PASS |  |
| `test_overview_scope_and_admin_projection[teacher-6]` | PASS |  |
| `test_overview_scope_and_admin_projection[other-1]` | PASS |  |
| `test_overview_scope_and_admin_projection[admin-6]` | PASS |  |
| `test_overview_authentication_date_validation_and_empty_week` | PASS |  |
| `test_overview_counts_a_cohort_published_in_two_terms_once` | PASS |  |
| `test_overview_is_bounded_and_has_constant_query_count` | PASS |  |
| `test_overview_revalidates_session_after_aggregating` | PASS |  |

## Every frontend test result

All use Node assertions; rendering uses React renderToStaticMarkup, not a browser layout engine.

| Test | Result |
|---|---|
| admin navigation separates management and setup while preserving role guards and old links | PASS |
| every catalog resource remains reachable in exactly one clearly defined area | PASS |
| semester-specific rows cannot mix terms; shared calendars and overlapping availability stay explicit | PASS |
| draft review uses compatible groups and the selected term workload only | PASS |
| lost generation response retries the same saved draft and idempotency key without publishing | PASS |
| uncertain draft creation blocks blind retries while definite validation failures remain correctable | PASS |
| malformed creation response cannot be treated as a saved draft or enqueue generation | PASS |
| management areas and guided draft labels render in RU, HY and EN | PASS |
| a finished generation is not labelled as a complete timetable when lessons remain unplaced | PASS |
| dean navigation has review and suggestions without administrator pages or personal notes | PASS |
| unknown and unauthorized pages resolve to Overview for every role | PASS |
| lecturers open their timetable by default and have no lecturer picker | PASS |
| personal lecturer timetable explains its scope in all three languages | PASS |
| dean timetable labels and read-only notice render in RU, HY and EN | PASS |
| lesson proposal uses server calendar slots, term boundaries and bounded free text | PASS |
| general suggestions have no lesson move fields and status badges contain readable text | PASS |
| dean account scope is a conditional faculty field; every new translation has three texts | PASS |
| dean review has no planner mutation paths and only uses the read-only version API | PASS |
| timeline defaults on desktop and mobile while remembering an explicit grid choice | PASS |
| server-page timelines order lessons by day and time without mutating their input | PASS |
| local day at 01:00 in Yerevan uses the current date | PASS |
| grid has table semantics, server slot times and only configured or occupied days | PASS |
| occupied extra slots and weekend lessons are retained; other weeks are excluded | PASS |
| stacked subgroup lessons, cancellation, decorations and parity remain textual | PASS |
| grid labels render in all supported languages | PASS |
| long Armenian lesson details and badges stay available in the grid | PASS |

## Raw evidence

- Full backend JUnit: `/tmp/chronocampus-pytest.xml`
- Full backend log: `/tmp/chronocampus-pytest.log`
- Core subprocess/solver subset: `/tmp/chronocampus-core.xml` and `/tmp/chronocampus-core.log` (overlaps full suite)
- Frontend test log: `/tmp/chronocampus-frontend-tests.log`
- TypeScript output: `/tmp/chronocampus-typecheck.log`
- Build output: `/tmp/chronocampus-build.log`

Temporary evidence under `/tmp` may be removed by the environment. This checked-in-format report preserves the individual statuses and methods; it has not been committed.
