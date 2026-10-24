# Continuous integration

[ChronoCampus CI](../.github/workflows/ci.yml) runs on every pull request to `main`, on pushes to `main`, and on manual dispatch. Pull requests test GitHub's merge result with the base branch. There are no path filters. Superseded runs are cancelled.

| Check | Environment | Validation |
| --- | --- | --- |
| Backend (ubuntu-24.04) | Ubuntu 24.04, Python 3.11 | Ruff 0.17.2 correctness rules (`E4,E7,E9,F`), backend pytest suite with isolated SQLite fixtures and Linux solver-process checks |
| Backend (windows-2022) | Windows Server 2022, Python 3.11 | The same suite, including native Windows process ownership and parent-death tests |
| Frontend | Ubuntu 24.04, Node 24 | `npm ci` from the lockfile, strict TypeScript check, production build |
| CI | Depends on the backend matrix and frontend | Fails unless all three prerequisite jobs succeeded, including when a prerequisite failed, was skipped, or was cancelled |
| Local delivery bundle | After successful CI, on `main` push/manual run | Packages the exact tested source commit and the frontend artifact from the same run; no deployment |

Actions are pinned to full commit hashes. The workflow receives only repository read permission and does not retain checkout credentials. It uses no application credentials and performs no deployment or database migration. Windows and Linux jobs run independently (`fail-fast: false`). JUnit reports and frontend output are retained as run artifacts for seven days. An uploaded frontend artifact alone is not a passing CI result.

## Delivery while development stays local

The `Local delivery bundle` job runs only after the aggregate `CI` job succeeds, on a push to `main` or a manual run on `main`. It downloads only this run's named frontend artifact, rejects a digest mismatch, and creates `chronocampus-local-<commit>` containing tracked source, frontend output and a commit identifier. It cannot run from a pull request or after failed tests. See [bundle contents and local installation](delivery.md).

This implements delivery of verified build artifacts. Automatic installation on a developer's computer and deployment to a server are not configured. No persistent self-hosted runner is installed and CI cannot reach the local development database.

## Repository migration and original startup blocker

The active repository is now [nemsime/ChronoCampus](https://github.com/nemsime/ChronoCampus). The team selected a new repository while the previous owner's billing fix was unavailable. Original Git history and remote branches were copied without force-pushing or deleting the old repository. Old PRs/discussions remain at `qaneee/ChronoCampus`; they are not recreated by a Git push. The new repository starts from the old remote `main`, with the accumulated changes proposed through a new PR rather than pushing the locally verified feature directly to `main`.

On 24 October 2026, [run 40082491033](https://github.com/qaneee/ChronoCampus/actions/runs/40082491033) exposed an annotation identifying an account billing restriction: recent payment failures or a spending limit that needs adjustment. The run has `startup_failure`, zero jobs and zero check runs. This is not a failed application test or a successful CI run. The annotation establishes the billing category, but does not distinguish which billing condition applies.

The authenticated collaborator cannot administer the old owner's Actions/billing or branch protection. The new repository is owned by the authenticated account, so its Actions and protection settings can be configured. Updating workflow YAML does not remove the old account's billing restriction. Run CI on the latest PR commit in the new repository and merge only after `CI` succeeds; then verify the `main` run and delivery artifact. Earlier local results do not substitute for those hosted runs.

## Protected main

Adding the workflow enables checks; branch protection is a separate repository setting. In the old repository, `main` was unprotected and the available account lacked administration access. Protection on `nemsime/ChronoCampus` was configured and read back through the GitHub API on 24 October 2026, before the first PR merge:

1. A pull request and resolved review conversations are required.
2. The aggregate **CI** check must pass and must come from **GitHub Actions** (app ID `15368`).
3. The branch must be up to date with `main`.
4. These requirements also apply to administrators. Force pushes and branch deletion are disabled.

The first PR was observed as `BLOCKED` while its required check was pending. The rule does not require a minimum number of approving teammate reviews; this allows the authorized maintainer to merge after validation. Team access invitations were issued separately and require each recipient to accept.

If recreating the repository, configure the same rule in **Settings → Branches**, selecting the aggregate `CI` job rather than only `Backend` or `Frontend`. Protection for private repositories depends on the owner's GitHub plan. See GitHub's [branch protection documentation](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/managing-a-branch-protection-rule) and [required-check troubleshooting](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks).

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

The hosted workflow intentionally has no SQL Server connection. SQL Server publication and queue tests are opt-in and will be reported as skipped there. Before integrating API/database changes, run the publication test locally with `CHRONOCAMPUS_TEST_DATABASE` set to an isolated, migrated `ChronoCampus_MigrationTest_YYYYMMDD` database. Queue tests additionally require the isolated RCSI OFF/ON databases described in the README and `CHRONOCAMPUS_QUEUE_TEST_DATABASES`. Perform the live API checks in [verification](verification.md). New migrations also need an empty database and a restored legacy-copy check. Windows Job Object launcher tests run on Windows; the Linux process-group launcher acceptance tests run on Ubuntu.

Typecheck/build do not replace browser acceptance, and SQLite does not prove SQL Server behavior. Grafana/Prometheus execution, browser interactions, university SMTP, and deployment are outside this workflow. Server deployment can be added once a hosting target, environment credentials, migration/backup procedure, and rollback procedure are agreed.
