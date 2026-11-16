"""Read-only reconstruction check over every stored version; no account queries."""
import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import models as m
from app.db.session import get_engine
from app.scheduling.snapshot import record
from app.scheduling.template import derive_template, expand_template


def signature(rows):
    return sorted((r['occurrence_id'], str(r['day']), r['slot'], r['room_id'], r['cancelled']) for r in rows)


def verify(db):
    results = []
    for version in db.scalars(select(m.ScheduleVersion).order_by(m.ScheduleVersion.id)):
        term = db.get(m.Term, version.term_id)
        config = dict((version.configuration or {}).get('calendar') or record(db.get(m.CalendarConfig, term.calendar_id)))
        term_data = (version.configuration or {}).get('term') or record(term)
        config['periods'] = [record(p) for p in db.scalars(select(m.TeachingPeriod).where(m.TeachingPeriod.term_id == term.id))]
        config['disruptions'] = [record(d) for d in db.scalars(select(m.Disruption).where(m.Disruption.version_id == version.id))]
        holidays = [record(h) for h in db.scalars(select(m.Holiday).where(m.Holiday.term_id == term.id))]
        for gid in version.cohort_ids:
            group = db.get(m.CourseGroup, gid)
            rows = []
            for a, w in db.execute(select(m.Assignment, m.Workload).join(m.Occurrence, m.Occurrence.id == m.Assignment.occurrence_id).join(m.Workload, m.Workload.id == m.Occurrence.component_id).where(m.Assignment.version_id == version.id, m.Workload.course_group_id == gid)):
                rows.append({**record(w), **record(a), 'component_id': w.id})
            derived = derive_template(rows, term_data, holidays, config)
            assert signature(expand_template(derived, term_data, holidays, config)) == signature(rows), (version.id, gid)
            results.append(dict(version=version.id, group=group.group_code, assignments=len(rows),
                                template_rows=len(derived['template_rows']), exceptions=len(derived['exceptions']),
                                irregular=len(derived['irregular']), exact_roundtrip=True))
    print(json.dumps(results, indent=2))


if __name__ == '__main__':
    with Session(get_engine()) as session:
        verify(session)
        session.rollback()
