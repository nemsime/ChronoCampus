"""Support independent lab and practical partitions while retaining nested lab rows."""

import sqlalchemy as sa

from alembic import op

revision = "0009_independent_labs"
down_revision = "0008_dated_changes"
branch_labels = None
depends_on = None

# SQLite can reflect unnamed keys. SQL Server assigns constraint names at creation.
NAMES = {
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s",
}


def key_name(keys, field, columns, fallback):
    return next(key["name"] or fallback for key in keys if key[field] == columns)


def upgrade():
    inspector = sa.inspect(op.get_bind())
    keys = (
        inspector.get_indexes("LabGroup")
        if op.get_bind().dialect.name == "mssql"
        else inspector.get_unique_constraints("LabGroup")
    )
    unique = key_name(
        keys, "column_names", ["small_group_id", "label"], "uq_LabGroup_small_group_id"
    )
    foreign = key_name(
        inspector.get_foreign_keys("LabGroup"),
        "constrained_columns",
        ["small_group_id"],
        "fk_LabGroup_small_group_id",
    )
    with op.batch_alter_table("LabGroup", naming_convention=NAMES) as batch:
        batch.drop_constraint(unique, type_="unique")
        batch.drop_constraint(foreign, type_="foreignkey")
        batch.alter_column("small_group_id", existing_type=sa.Integer(), nullable=True)
        batch.add_column(sa.Column("course_group_id", sa.Integer()))
        batch.create_foreign_key(
            "fk_lab_small", "SmallGroup", ["small_group_id"], ["id"]
        )
        batch.create_foreign_key(
            "fk_lab_course", "CourseGroup", ["course_group_id"], ["id"]
        )
        batch.create_check_constraint(
            "ck_lab_parent", "small_group_id IS NOT NULL OR course_group_id IS NOT NULL"
        )
    op.execute(
        sa.text(
            "UPDATE LabGroup SET course_group_id = (SELECT course_group_id FROM SmallGroup WHERE SmallGroup.id = LabGroup.small_group_id)"
        )
    )
    for name, parent, condition in [
        ("uq_lab_nested_label", "small_group_id", "small_group_id IS NOT NULL"),
        ("uq_lab_independent_label", "course_group_id", "small_group_id IS NULL"),
    ]:
        op.create_index(
            name,
            "LabGroup",
            [parent, "label"],
            unique=True,
            sqlite_where=sa.text(condition),
            mssql_where=sa.text(condition),
        )
    op.add_column(
        "CalendarConfig",
        sa.Column(
            "cross_partition_overlap",
            sa.String(24),
            nullable=False,
            server_default="assume_overlap",
        ),
    )


def downgrade():
    if op.get_bind().scalar(
        sa.text("SELECT COUNT(*) FROM LabGroup WHERE small_group_id IS NULL")
    ):
        raise RuntimeError(
            "Assign a legacy parent to each independent lab before downgrading"
        )
    op.drop_index("uq_lab_independent_label", table_name="LabGroup")
    op.drop_index("uq_lab_nested_label", table_name="LabGroup")
    with op.batch_alter_table("LabGroup", naming_convention=NAMES) as batch:
        batch.drop_constraint("ck_lab_parent", type_="check")
        batch.drop_constraint("fk_lab_course", type_="foreignkey")
        batch.drop_constraint("fk_lab_small", type_="foreignkey")
        batch.drop_column("course_group_id")
        batch.alter_column("small_group_id", existing_type=sa.Integer(), nullable=False)
        batch.create_foreign_key(
            "fk_lab_small", "SmallGroup", ["small_group_id"], ["id"]
        )
        batch.create_unique_constraint("uq_lab_label", ["small_group_id", "label"])
    with op.batch_alter_table("CalendarConfig") as batch:
        batch.drop_column("cross_partition_overlap", mssql_drop_default=True)
