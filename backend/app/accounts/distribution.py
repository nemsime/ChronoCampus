import string
import unicodedata
from collections.abc import Sequence
from typing import Protocol, TypeVar


class StudentName(Protocol):
    @property
    def surname(self) -> str: ...

    @property
    def given_name(self) -> str: ...

    @property
    def patronymic(self) -> str | None: ...


Student = TypeVar("Student", bound=StudentName)

# The script order is fixed so the same import yields the same result on any host.
ALPHABETS = (
    tuple(string.ascii_lowercase),
    tuple("абвгдеёжзийклмнопрстуфхцчшщъыьэюя"),
    (*"աբգդեզէըթժիլխծկհձղճմյնշոչպջռսվտրց", "ու", *"փք", "և", *"օֆ"),
)
ORDER = {
    letter: (script, position)
    for script, alphabet in enumerate(ALPHABETS, 1)
    for position, letter in enumerate(alphabet)
}


def normalized_name(value: str | None) -> str:
    return (
        unicodedata.normalize("NFKC", " ".join((value or "").split()))
        .casefold()
        .replace("ё", "е")
    )


def _collation(value: str | None) -> tuple[tuple[int, int], ...]:
    value = unicodedata.normalize("NFC", (value or "").lower().strip())
    letters = iter(range(len(value)))
    result = []
    for index in letters:
        letter = value[index]
        if value[index : index + 2] == "ու":
            letter = "ու"
            next(letters)
        if letter in ORDER:
            result.append(ORDER[letter])
        else:
            base = unicodedata.normalize("NFKD", letter)[0]
            if base in string.ascii_lowercase:
                result.append(ORDER[base])
            else:
                result.append((0 if not base.isalpha() else 4, ord(base)))
    return tuple(result)


def distribute_students(
    students: Sequence[Student], max_size: int
) -> list[list[Student]]:
    if max_size < 1:
        raise ValueError("max_size must be positive")
    if not students:
        return []
    ordered = sorted(
        students,
        key=lambda row: (
            _collation(row.surname),
            _collation(row.given_name),
            _collation(row.patronymic),
        ),
    )
    group_count = (len(students) + max_size - 1) // max_size
    base_size, larger_groups = divmod(len(students), group_count)
    groups = []
    offset = 0
    for index in range(group_count):
        group_size = base_size + (index < larger_groups)
        groups.append(ordered[offset : offset + group_size])
        offset += group_size
    return groups
