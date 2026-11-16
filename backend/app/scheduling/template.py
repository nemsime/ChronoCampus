"""Conservative, lossless semester projection. No ORM, account, or solver dependencies."""
from collections import defaultdict

from app.calendar.rules import as_date, parity, teaching_dates, week_index


def derive_template(assignments, term, holidays, config):
    """Derive exact series, allowing only unambiguous minority dated deviations.

    config carries teaching periods and optional disruption records. Bindings map
    teaching dates to occurrence IDs; they never invent unscheduled occurrences.
    Ambiguous patterns remain dated rather than being silently normalized.
    """
    rows = [dict(a, day=str(a['day'])) for a in assignments]
    holiday_days = {str(h['day'] if isinstance(h, dict) else h) for h in holidays}
    disruptions = {d['occurrence_id']: d for d in config.get('disruptions', [])}
    result = dict(template_rows=[], exceptions=[], irregular=[])
    components = defaultdict(list)
    for row in rows:
        key = tuple(row.get(k) for k in ('version_id', 'course_group_id', 'component_id',
                                         'subject_id', 'lesson_type', 'teacher_id',
                                         'small_group_id', 'lab_group_id'))
        components[key].append(row)
        if row.get('cancelled'):
            result['exceptions'].append(dict(row, reason='holiday_cancelled' if row['day'] in holiday_days else 'cancelled'))
        elif row['occurrence_id'] in disruptions:
            result['exceptions'].append(dict(row, reason='disrupted', original=disruptions[row['occurrence_id']]))
    for component in components.values():
        dates = teaching_dates(dict(term=term, calendar=config, periods=config.get('periods', [])), component[0]['course_group_id'])
        cancelled = {r['day'] for r in component if r.get('cancelled')}
        remaining = [r for r in component if not r.get('cancelled') and r['occurrence_id'] not in disruptions]
        patterns = defaultdict(list)
        for row in remaining:
            patterns[(as_date(row['day']).weekday(), row['slot'], row['room_id'])].append(row)
        for (weekday, slot, room_id), members in sorted(patterns.items(), key=lambda item: -len(item[1])):
            members = [r for r in members if r in remaining]
            if not members:
                continue
            for kind in ('every', 'numerator', 'denominator'):
                expected = {str(d) for d in dates if d.weekday() == weekday
                            and str(d) not in holiday_days | cancelled
                            and (kind == 'every' or parity(term['starts_on'], d) == kind)}
                matching = [r for r in members if r['day'] in expected]
                actual = {r['day'] for r in matching}
                if not expected or len(actual) != len(matching):
                    continue
                missing = expected - actual
                replacements = []
                # Infer a move only when a dominant series has a unique dated
                # counterpart in the same week. Remainders and ties stay irregular.
                if missing and len(matching) >= max(2, len(expected) * .75):
                    for day in sorted(missing):
                        candidates = [r for r in remaining if r not in matching
                                      and week_index(term['starts_on'], r['day']) == week_index(term['starts_on'], day)]
                        if len(candidates) == 1:
                            replacements.append((day, candidates[0]))
                if len(replacements) != len(missing):
                    continue
                base = {k: v for k, v in members[0].items() if k not in
                        ('id', 'occurrence_id', 'day', 'cancelled', 'pinned', 'starts_at', 'ends_at')}
                bindings = [dict(day=r['day'], occurrence_id=r['occurrence_id']) for r in matching]
                for day, row in replacements:
                    bindings.append(dict(day=day, occurrence_id=row['occurrence_id']))
                    reason = 'room_changed' if row['day'] == day and row['slot'] == slot else 'moved'
                    result['exceptions'].append(dict(row, reason=reason, inferred=True,
                                                     original=dict(day=day, slot=slot, room_id=room_id)))
                result['template_rows'].append(dict(base, weekday=weekday, slot=slot,
                                                     room_id=room_id, parity=kind, bindings=bindings))
                consumed = matching + [r for _, r in replacements]
                remaining = [r for r in remaining if r not in consumed]
                members = [r for r in members if r in remaining]
                if not members:
                    break
        result['irregular'].extend(dict(row, reason='irregular') for row in remaining)
    result['exceptions'].sort(key=lambda r: (r['day'], r['occurrence_id']))
    result['irregular'].sort(key=lambda r: (r['day'], r['occurrence_id']))
    return result


def expand_template(derived, term, holidays, config):
    """Expand the projection, preserving exact occurrence/day/slot/room identity."""
    expanded = {}
    holiday_days = {str(h['day'] if isinstance(h, dict) else h) for h in holidays}
    for row in derived['template_rows']:
        bindings = {b['day']: b['occurrence_id'] for b in row['bindings']}
        for day in teaching_dates(dict(term=term, calendar=config, periods=config.get('periods', [])), row['course_group_id']):
            key = str(day)
            if (key not in holiday_days and day.weekday() == row['weekday']
                    and (row['parity'] == 'every' or parity(term['starts_on'], day) == row['parity'])
                    and key in bindings):
                expanded[bindings[key]] = dict(row, occurrence_id=bindings[key], day=key, cancelled=False)
    for row in derived['exceptions'] + derived['irregular']:
        expanded[row['occurrence_id']] = dict(row)
    return list(expanded.values())
