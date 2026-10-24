---
name: repo-workflow
description: Prepare and verify ChronoCampus changes on a personal branch, check integration with local main, and submit that branch when remote publication is authorized.
---

# ChronoCampus contribution workflow

Work on your own descriptive branch from updated `main`. Preserve unrelated local work; do not develop on another contributor's branch. Commit only task files, excluding credentials, backups, mail captures, and runtime artifacts.

Before delivery, fetch and update local `main` by fast-forward from `origin/main`. Inspect divergence rather than resetting it. Merge the feature branch into **local** `main` for integration verification; never push that verification merge directly to remote `main`. Use a temporary worktree if switching the active checkout would disturb development services. Include necessary conflict resolutions on the feature branch as well.

Follow the repository [README](../../README.md). For changes spanning both applications, Windows PowerShell checks are:

```powershell
backend/.venv/Scripts/python.exe -m pytest backend/tests -q
npm --prefix frontend run typecheck
npm --prefix frontend run build
git diff --check
```

On Linux/macOS substitute `backend/.venv/bin/python`. API/database changes also need live checks on an isolated development database. Use Alembic, never the archived destructive bootstrap on retained data. Verify schema compatibility against an empty database and restored legacy copy when changing migrations. Record the actual environment, results, and missing checks.

Fix failures on the feature branch and repeat affected checks. Return to the feature branch after local-main verification. Do not claim success for tests that could not run.

When the user authorizes remote publication, push the feature branch and open a PR targeting remote `main`. Describe the concrete problem, resulting behavior, and validation evidence. Use a structured tool argument or file for multiline descriptions. Repeat affected checks after further changes.

This skill describes workflow; it does not itself authorize a remote push or PR. For local-only work, finish implementation and verification and report the branch and remaining publication step without an unnecessary permission handoff.
