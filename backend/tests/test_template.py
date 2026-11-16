from datetime import date, timedelta

import pytest

from app.scheduling.template import derive_template, expand_template

TERM = dict(starts_on='2026-09-01', ends_on='2026-10-26')
CONFIG = dict(weekdays=[0, 1, 2, 3, 4], periods=[dict(course_group_id=None, starts_on='2026-09-01', ends_on='2026-10-26')])


def lesson(day, identifier, **extra):
    return dict(occurrence_id=identifier, course_group_id=1, component_id=1,
                subject_id=1, teacher_id=1, small_group_id=None, lab_group_id=None,
                lesson_type='lecture', day=str(day), slot=1, room_id=1, cancelled=False, **extra)


def identity(rows):
    return sorted((r['occurrence_id'], str(r['day']), r['slot'], r['room_id'], r.get('cancelled', False)) for r in rows)


def assert_roundtrip(rows, holidays=(), config=CONFIG):
    derived = derive_template(rows, TERM, holidays, config)
    assert identity(expand_template(derived, TERM, holidays, config)) == identity(rows)
    return derived


@pytest.mark.parametrize('kind,indices', [('every', range(8)), ('numerator', range(0, 8, 2)), ('denominator', range(1, 8, 2))])
def test_exact_parity_partial_first_week(kind, indices):
    rows = [lesson(date(2026, 9, 1) + timedelta(weeks=i), i) for i in indices]
    derived = assert_roundtrip(rows)
    assert [r['parity'] for r in derived['template_rows']] == [kind]
    assert not derived['irregular']


def test_holiday_does_not_shift_parity_and_cancellation_is_exception():
    rows = [lesson(date(2026, 9, 1) + timedelta(weeks=i), i) for i in range(0, 8, 2)]
    rows[1]['cancelled'] = True
    derived = assert_roundtrip(rows, [dict(day=rows[1]['day'])])
    assert derived['template_rows'][0]['parity'] == 'numerator'
    assert derived['exceptions'][0]['reason'] == 'holiday_cancelled'
    assert not derived['irregular']
    # Holiday cancellation can also be absent from an imported assignment set.
    derived = assert_roundtrip([r for r in rows if not r['cancelled']], [dict(day=rows[1]['day'])])
    assert derived['template_rows'][0]['parity'] == 'numerator'


@pytest.mark.parametrize('change,reason', [('room', 'room_changed'), ('move', 'moved')])
def test_unambiguous_minor_deviation(change, reason):
    rows = [lesson(date(2026, 9, 1) + timedelta(weeks=i), i) for i in range(8)]
    if change == 'room':
        rows[3]['room_id'] = 2
    else:
        rows[3]['day'] = str(date.fromisoformat(rows[3]['day']) + timedelta(days=1))
        rows[3]['slot'] = 2
    derived = assert_roundtrip(rows)
    assert derived['template_rows'][0]['parity'] == 'every'
    assert derived['exceptions'][0]['reason'] == reason
    assert derived['exceptions'][0]['inferred']


def test_irregular_four_week_room_rotation_not_hidden():
    rows = [lesson(date(2026, 9, 1) + timedelta(weeks=i), i) for i in range(0, 8, 2)]
    for r in rows[1::2]:
        r['room_id'] = 2
    derived = assert_roundtrip(rows)
    assert not derived['template_rows']
    assert len(derived['irregular']) == 4


def test_recorded_disruption_is_exception_and_inputs_are_unchanged():
    rows = [lesson('2026-09-03', 1)]
    config = dict(CONFIG, disruptions=[dict(occurrence_id=1, original_day='2026-09-01', original_slot=1)])
    original = [dict(r) for r in rows]
    derived = assert_roundtrip(rows, config=config)
    assert derived['exceptions'][0]['reason'] == 'disrupted'
    assert rows == original
