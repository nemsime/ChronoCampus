from pydantic import BaseModel


class GroupRead(BaseModel):
    id: int
    code: str
    major_name: str
    admission_year: int
    capacity: int
