import pyodbc

from app.schemas.groups import GroupRead


def list_groups(connection: pyodbc.Connection) -> list[GroupRead]:
    cursor = connection.cursor()
    try:
        cursor.execute("""
            SELECT g.id, g.group_code, m.name, g.admission_year, g.capacity
            FROM dbo.CourseGroup AS g
            JOIN dbo.Major AS m ON m.id = g.major_id
            ORDER BY g.group_code, g.id
        """)
        return [
            GroupRead(id=row[0], code=row[1], major_name=row[2],
                      admission_year=row[3], capacity=row[4])
            for row in cursor.fetchall()
        ]
    finally:
        cursor.close()
