from alembic import context
from sqlalchemy import create_engine, pool

from app.db.models import Base
from app.db.session import database_url

config = context.config

if context.is_offline_mode():
    raise RuntimeError(
        "Migrations inspect the existing schema. Use an online development database."
    )
else:
    connection = config.attributes.get("connection")
    if connection is not None:
        context.configure(connection=connection, target_metadata=Base.metadata)
        with context.begin_transaction():
            context.run_migrations()
    else:
        engine = create_engine(
            database_url(), poolclass=pool.NullPool, hide_parameters=True
        )
        with engine.connect() as connection:
            context.configure(connection=connection, target_metadata=Base.metadata)
            with context.begin_transaction():
                context.run_migrations()
