"""Local maintenance commands. Run from backend after applying migrations."""

import argparse
from getpass import getpass
import json
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.accounts.router import EmailInput
from app.core.security import password_hash
from app.db.models import Account
from app.db.session import get_engine, lock_revision


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser(
        "seed-demo",
        help="Populate isolated development DB; write random credentials to ignored local file",
    )
    admin = commands.add_parser(
        "create-admin",
        help="Create a local administrator without changing existing accounts",
    )
    admin.add_argument("email")
    admin.add_argument("--name", required=True)
    args = parser.parse_args()
    if args.command == "seed-demo":
        from app.demo import seed_demo

        print(
            json.dumps(
                seed_demo(
                    Path(__file__).resolve().parents[1] / ".demo-credentials.json"
                )
            )
        )
    else:
        email = EmailInput(email=args.email).email
        password = getpass("Password (12+ characters): ")
        if not 12 <= len(password) <= 256 or getpass("Repeat password: ") != password:
            parser.error("Invalid password length or confirmation")
        with Session(get_engine()) as db:
            lock_revision(db)
            if db.scalar(select(Account.id).where(Account.email == email)):
                parser.error(
                    "Account exists; use the authenticated administrator interface"
                )
            db.add(
                Account(
                    email=email,
                    display_name=args.name,
                    role="admin",
                    password_hash=password_hash(password),
                    must_change_password=True,
                )
            )
            db.commit()
        print("Administrator created; password change required at first login")


if __name__ == "__main__":
    main()
