"""Read-only timetable pattern inventory. Run from backend: python -m scripts.diagnose_template."""
import json
from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.calendar.rules import teaching_dates, week_index
from app.db import models as m
from app.db.session import get_engine
from app.scheduling.snapshot import record


def diagnose(db):
    for version in db.scalars(select(m.ScheduleVersion).order_by(m.ScheduleVersion.id)):
        term = db.get(m.Term, version.term_id)
        config = (version.configuration or {}).get('calendar') or record(db.get(m.CalendarConfig, term.calendar_id))
        term_data = (version.configuration or {}).get('term') or record(term)
        periods = [record(p) for p in db.scalars(select(m.TeachingPeriod).where(m.TeachingPeriod.term_id == term.id))]
        holidays = {h.day for h in db.scalars(select(m.Holiday).where(m.Holiday.term_id == term.id))}
        for group_id in version.cohort_ids:
            group = db.get(m.CourseGroup, group_id)
            series = defaultdict(list)
            for a, w in db.execute(select(m.Assignment, m.Workload).join(m.Occurrence, m.Occurrence.id == m.Assignment.occurrence_id).join(m.Workload, m.Workload.id == m.Occurrence.component_id).where(m.Assignment.version_id == version.id, m.Workload.course_group_id == group_id)):
                if not a.cancelled:
                    key = (w.subject_id, w.lesson_type, w.teacher_id, w.small_group_id, w.lab_group_id, a.day.weekday(), a.slot, a.room_id)
                    series[key].append(a.day)
            dates = teaching_dates(dict(term=term_data, calendar=config, periods=periods), group_id)
            counts = dict(EVERY=0, NUMERATOR=0, DENOMINATOR=0, IRREGULAR=0)
            irregular = []
            for key, days in series.items():
                expected = {week_index(term_data['starts_on'], d) for d in dates if d.weekday() == key[5] and d not in holidays}
                actual = {week_index(term_data['starts_on'], d) for d in days}
                kind = 'IRREGULAR'
                for label, weeks in [('EVERY', expected), ('NUMERATOR', {w for w in expected if w % 2 == 0}), ('DENOMINATOR', {w for w in expected if w % 2 == 1})]:
                    if weeks and actual == weeks and len(days) == len(actual):
                        kind = label
                        break
                counts[kind] += 1
                if kind == 'IRREGULAR':
                    irregular.append(dict(series=key, dates=[str(d) for d in sorted(days)]))
            print(json.dumps(dict(version=version.id, status=version.status, group=group.group_code, counts=counts, irregular=irregular)), flush=True)


if __name__ == '__main__':
    with Session(get_engine()) as session:
        diagnose(session)
        session.rollback()
