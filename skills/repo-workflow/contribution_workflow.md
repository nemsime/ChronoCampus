---
name: repo-workflow
description: Follow the ChronoCampus contribution workflow when preparing repository changes, verifying them locally, and submitting a pull request.
---

# Repository contribution workflow

All members must follow this workflow for repository changes.

## 1. Work on your own branch

- Start from an up-to-date local `main` and create/work your own branch with (a descriptive name, such as `alice/groups-search`).
- Make and commit your changes on that branch. Do not develop directly on `main` or another member's branch.
- Preserve unrelated local work when switching branches or updating `main`.

## 2. Check everything on your local main

- Fetch the latest remote changes and update local `main` from `origin/main` using a fast-forward update. If it cannot fast-forward, inspect the divergence before proceeding; do not reset away local work.
- Merge your branch into local `main` to check the combined result locally. This local merge is for verification; do not push local `main`.
- Run the relevant automated checks documented in the repository README, and manually verify the affected behavior. For changes affecting both applications, run:

  ```bash
  backend/.venv/bin/python -m pytest backend/tests
  npm --prefix frontend run build
  ```

- For API or database integration changes, also perform the README's live API and UI checks with a configured development database.
- If checks fail or conflicts arise, fix them on your own branch, then repeat verification on local `main`. Ensure any conflict resolution needed for the change is committed on your branch as well.
- If required checks cannot run, report what is missing and stop before publishing. Do not claim verification passed.

## 3. Push your branch and open a PR

- Once all required checks pass, switch back to your own branch and push it to the repository, for example `git push -u origin alice/groups-search`.
- Open a pull request from your branch into remote `main`.
- Describe what changed and record the checks performed and their results in the PR description.
- Keep remote `main` updates within the PR review and merge process. Do not push the local verification merge directly to remote `main`.
- If your branch changes after verification, repeat the relevant checks before updating the PR.

Use this workflow when repository work is authorized. The skill itself does not authorize pushing changes or opening a PR when the user has requested only local work.
