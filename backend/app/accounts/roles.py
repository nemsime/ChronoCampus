"""Role names and shared capability policy for authentication and authorization."""

from typing import Literal, get_args

Role = Literal["admin", "lecturer", "student", "dean"]
ADMIN, LECTURER, STUDENT, DEAN = get_args(Role)
ROLES = get_args(Role)
SCHEDULE_VIEW_ALL = frozenset({ADMIN, DEAN})
