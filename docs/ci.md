# Continuous integration

[ChronoCampus CI](../.github/workflows/ci.yml) runs on every pull request to `main`, on pushes to `main`, and on manual dispatch. Pull requests test GitHub's merge result with the base branch. There are no path filters. Superseded runs are cancelled.

| Check | Environment | Validation |
| --- | --- | --- |
| Backend | Ubuntu 24.04, Python 3.11 | Ruff 0.17.2 correctness rules (`E4,E7,E9,F`), backend pytest suite with isolated SQLite fixtures |
| Frontend | Ubuntu 24.04, Node 24 | `npm ci` from the lockfile, strict TypeScript check, production build |
| CI | Depends on both jobs | Fails unless both jobs succeeded, including when a prerequisite failed, was skipped, or was cancelled |

Actions are pinned to full commit hashes. The workflow receives only repository read permission and does not retain checkout credentials. It uses no application credentials and performs no deployment or database migration.

## Enforce checks before merging

Adding the workflow enables checks; branch protection is a separate repository setting. **At setup time, `main` was unprotected and the available account had write access but no repository administration access. Enforcement could not be enabled by that account.**

An administrator (or a role allowed to edit repository rules) must configure a protection rule for `main` in **Settings → Branches**:

1. Require a pull request before merging.
2. Require status checks to pass before merging; select **CI** from **GitHub Actions** after its first completed run.
3. Require branches to be up to date before merging.
4. Do not allow bypassing these requirements; keep force pushes and deletions disabled.

Select the aggregate `CI` job, not just `Backend` or `Frontend`. An intentional failing PR should then be blocked from merging, and a passing, up-to-date PR should be eligible. Protection for private repositories depends on the owner's GitHub plan. See GitHub's [branch protection documentation](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/managing-a-branch-protection-rule) and [required-check troubleshooting](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks).

## Local checks

Run from the repository root after installing the README prerequisites:

```powershell
uvx --from ruff==0.17.2 ruff check --isolated --select E4,E7,E9,F backend/app backend/tests backend/alembic
backend/.venv/Scripts/python.exe -m pytest backend/tests -q
npm --prefix frontend run typecheck
npm --prefix frontend run build
git diff --check
```

If `uvx` is unavailable, install `ruff==0.17.2` in the backend virtual environment and invoke it as `python -m ruff`. On Linux/macOS use `backend/.venv/bin/python`.

## Coverage limits and release checks

The hosted workflow intentionally has no SQL Server connection. The SQL Server publication-concurrency test is opt-in and will be reported as skipped there. Before integrating API/database changes, run it locally with `CHRONOCAMPUS_TEST_DATABASE` set to an isolated, migrated `ChronoCampus_MigrationTest_YYYYMMDD` database, and perform the live API checks in [verification](verification.md). New migrations also need an empty database and a restored legacy-copy check.

Typecheck/build do not replace browser acceptance, and SQLite does not prove SQL Server behavior. Grafana/Prometheus execution, browser interactions, university SMTP, and deployment are outside this workflow. CD can be added once a hosting target, environment credentials, migration/backup procedure, and rollback procedure are agreed.
