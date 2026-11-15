"""Hash-only reset schema and atomic SQL Server password reset.

Existing token/outbox deletion requires explicit operator approval via
alembic -x purge_reset_tokens=yes upgrade head. Stop API/workers first.
"""

from alembic import context, op
import sqlalchemy as sa

revision = "0006_smtp_password_reset"
down_revision = "0005_email_registration"
branch_labels = None
depends_on = None

RESET_PROCEDURE = """
CREATE OR ALTER PROCEDURE dbo.usp_ResetPassword
    @token_hash CHAR(64), @new_password_hash NVARCHAR(255)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    DECLARE @uid INT = NULL;
    BEGIN TRY
        BEGIN TRANSACTION;
        UPDATE dbo.PasswordResetToken
        SET used = 1, @uid = user_id
        WHERE token_hash = @token_hash AND used = 0
          AND purpose = 'reset' AND expires_at > SYSUTCDATETIME();
        IF @uid IS NULL
        BEGIN
            ROLLBACK TRANSACTION;
            SELECT CAST(0 AS INT) AS success;
            RETURN;
        END;
        UPDATE dbo.[User]
        SET password_hash = @new_password_hash, must_change_password = 0
        WHERE id = @uid AND is_active = 1 AND email_verified = 1;
        IF @@ROWCOUNT = 0
        BEGIN
            ROLLBACK TRANSACTION;
            SELECT CAST(0 AS INT) AS success;
            RETURN;
        END;
        UPDATE dbo.PasswordResetToken SET used = 1 WHERE user_id = @uid AND used = 0;
        UPDATE dbo.UserSession SET is_revoked = 1 WHERE user_id = @uid AND is_revoked = 0;
        COMMIT TRANSACTION;
        SELECT CAST(1 AS INT) AS success;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
"""


def upgrade():
    bind = op.get_bind()
    if bind.dialect.name != "mssql":
        raise RuntimeError("0006_requires_sql_server")
    count = bind.scalar(sa.text("SELECT COUNT(*) FROM dbo.PasswordResetToken"))
    approved = (
        context.get_x_argument(as_dictionary=True).get("purge_reset_tokens") == "yes"
    )
    approved = approved or context.config.attributes.get("allow_token_purge", False)
    if count and not approved:
        raise RuntimeError(
            "Existing verification/reset tokens will be deleted. Back up and obtain approval, then use -x purge_reset_tokens=yes."
        )
    if count:
        bind.execute(
            sa.text("""UPDATE dbo.BackgroundJob SET state='cancelled',
            finished_at=SYSUTCDATETIME(), owner_id=NULL, lease_until=NULL
            WHERE id IN (SELECT job_id FROM dbo.MailOutbox)
            AND state NOT IN ('succeeded','failed','cancelled')""")
        )
        bind.execute(sa.text("DELETE FROM dbo.MailOutbox"))
        bind.execute(sa.text("DELETE FROM dbo.PasswordResetToken"))
    inspector = sa.inspect(bind)
    # SQLAlchemy's SQL Server dialect does not implement get_unique_constraints.
    constraints = bind.scalars(sa.text("""
        SELECT DISTINCT kc.name FROM sys.key_constraints AS kc
        JOIN sys.index_columns AS ic ON ic.object_id=kc.parent_object_id AND ic.index_id=kc.unique_index_id
        JOIN sys.columns AS c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
        WHERE kc.parent_object_id=OBJECT_ID(:table_name) AND kc.type='UQ' AND c.name=:column_name
    """), {"table_name": "dbo.PasswordResetToken", "column_name": "token"})
    for name in constraints:
        op.drop_constraint(name, "PasswordResetToken", type_="unique")
    for foreign in inspector.get_foreign_keys("PasswordResetToken"):
        if foreign["constrained_columns"] == ["user_id"]:
            op.drop_constraint(
                foreign["name"], "PasswordResetToken", type_="foreignkey"
            )
    op.alter_column(
        "PasswordResetToken",
        "token",
        new_column_name="token_hash",
        existing_type=sa.Unicode(255),
        existing_nullable=False,
    )
    op.alter_column(
        "PasswordResetToken",
        "token_hash",
        type_=sa.CHAR(64),
        nullable=False,
        existing_type=sa.Unicode(255),
    )
    op.create_unique_constraint(
        "uq_prt_token_hash", "PasswordResetToken", ["token_hash"]
    )
    op.create_foreign_key(
        "fk_prt_user",
        "PasswordResetToken",
        "User",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_prt_user_id", "PasswordResetToken", ["user_id", "used"])
    op.execute(RESET_PROCEDURE)


def downgrade():
    op.execute("DROP PROCEDURE IF EXISTS dbo.usp_ResetPassword")
    op.drop_index("ix_prt_user_id", table_name="PasswordResetToken")
    op.drop_constraint("fk_prt_user", "PasswordResetToken", type_="foreignkey")
    op.create_foreign_key(
        "fk_prt_user", "PasswordResetToken", "User", ["user_id"], ["id"]
    )
    op.drop_constraint("uq_prt_token_hash", "PasswordResetToken", type_="unique")
    op.alter_column(
        "PasswordResetToken",
        "token_hash",
        type_=sa.Unicode(255),
        existing_type=sa.CHAR(64),
    )
    op.alter_column(
        "PasswordResetToken",
        "token_hash",
        new_column_name="token",
        existing_type=sa.Unicode(255),
    )
    op.create_unique_constraint("uq_prt_token", "PasswordResetToken", ["token"])
