from datetime import date

from scripts.timetable_metrics import cohort_metrics


def test_union_of_subgroups_and_independent_series_within_workload():
    monday = date(2026, 9, 7)
    next_monday = date(2026, 9, 14)
    rows = [
        (monday, 1, 10, 1, 0),
        (monday, 1, 20, 2, 0),
        (monday, 3, 10, 1, 2),
        (next_monday, 2, 11, 1, 1),
        (next_monday, 3, 10, 1, 3),
    ]
    result = cohort_metrics(rows, monday, 2, range(5))
    assert result["pairs_per_day"] == {2: 2}
    assert result["first_pair_of_day"] == {1: 1, 2: 1}
    assert result["weekday_load"] == {0: 4, 1: 0, 2: 0, 3: 0, 4: 0}
    assert result["window_slots"] == result["days_with_windows"] == 1
    assert result["percent_days_with_windows"] == 50
    assert result["series_with_any_changes"] == 1
    assert (
        result["series_with_room_changes"]
        == result["series_with_weekday_or_slot_changes"]
        == 1
    )
