# ChronoCampus local delivery bundle

This archive is a tested source revision and its frontend build, not a self-contained Windows installer. It is produced only after the backend checks on Ubuntu and Windows and the frontend checks pass, on a push to `main` or a manual run on `main`.

Contents:

- `COMMIT.txt`: the source commit tested by this workflow run.
- `source.zip`: files tracked in Git at that commit, including backend code, migrations, scripts and documentation. Local credentials, databases, mail keys, logs and installed dependencies are not included.
- `frontend-build/`: the frontend production output from the same workflow run.
- `SHA256SUMS.txt`: SHA-256 checksums for the source archive and frontend entry point. GitHub also records and verifies artifact digests during transfer.

Download `chronocampus-local-<commit>` from the successful workflow run's **Artifacts** section. Artifacts are retained for seven days; the Git commit remains available after they expire. The intermediate `frontend-<commit>` artifact is build output only; its presence does not mean all CI checks passed.

For a new local installation, extract `source.zip` into a separate directory and follow its `README.md` and `docs/local-runtime.md`. Install Python/Node dependencies, configure your local SQL Server, apply the documented migrations and initialize the mail key before starting the application. The supported development launcher uses Vite; the prebuilt frontend is provided for inspection or later deployment configuration.

For an existing installation, keep configuration and mail keys, stop the local group, verify a database backup and test any new migration on a restored copy before updating retained data. Do not overwrite a running working directory with this archive or replace a mail key with a newly generated one. Restart with `scripts/local.ps1 start` and check `status` and `/api/ready`.

Delivery does not install a runner on your computer, modify your local database, restart your application, or deploy to a server. Server deployment and automated database upgrades remain a separate stage requiring a defined environment, backup and rollback procedure.
