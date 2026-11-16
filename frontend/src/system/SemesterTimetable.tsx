import { Bell, MapPin, UserRound } from "lucide-react";
import { ChangeDrawer } from "./ChangeNotifications";
import { useEffect, useState } from "react";
import { api, Row } from "./api";
import { ErrorBox, dateLabel, LoadingState } from "./common";
import { useLanguage } from "./i18n";

export function SemesterTimetable({ filters, reload, versionId }: { filters: Record<string, string>; reload: number; versionId?: string }) {
  const { t } = useLanguage();
  const [semesters, setSemesters] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setSemesters([]);
    const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => !!value));
    if (versionId) params.set("version_id", versionId);
    void api<{ semesters: Row[] }>(`/schedule/template?${params}`)
      .then(data => { if (active) setSemesters(data.semesters); })
      .catch(failure => { if (active) setError(failure); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filters, reload, versionId]);
  return <>
    <ErrorBox error={error} />
    {loading ? <LoadingState label={t("scheduleLoading")} /> : !error && <SemesterTemplateContent semesters={semesters} />}
  </>;
}

export function SemesterTemplateContent({ semesters }: { semesters: Row[] }) {
  const { t, lang } = useLanguage();
  const [activeChanges, setActiveChanges] = useState<Row[] | null>(null);
  const lesson = (row: Row, showGroup = true) => <div className={`semester-lesson semester-lesson-${row.lesson_type}`}>
    <span className="semester-type">{t(row.lesson_type)}</span>
    <strong>{row.subject}</strong>
    <span className="semester-person"><UserRound size={12} aria-hidden="true" />{row.teacher}</span>
    <span className="semester-room"><MapPin size={12} aria-hidden="true" />{row.room}</span>
    {(showGroup || row.small_group || row.lab_group) && <span className="semester-audience">{[showGroup ? row.group : null, row.small_group ? `${t("small_group_id")} ${row.small_group}` : null, row.lab_group ? `${t("lab_group_id")} ${row.lab_group}` : null].filter(Boolean).join(" · ")}</span>}
  </div>;
  return <div className="semester-timetable">
    <p className="semester-intro">{t("semesterTemplateHelp")}</p>
    <div className="semester-legend"><span><i className="legend-every" />{t("every")}</span><span><i className="legend-numerator" />{t("numerator")}</span><span><i className="legend-denominator" />{t("denominator")}</span><small>{t("semesterParityLegend")}</small></div>
    {!semesters.length && <p>{t("noPublishedHelp")}</p>}
    {semesters.map(semester => {
      const rows: Row[] = semester.template_rows;
      const groups = Array.from(new Set<string>([...rows, ...semester.irregular, ...semester.exceptions].map((row: Row) => row.group).filter(Boolean)));
      const weekdays = Array.from(new Set<number>([0, 1, 2, 3, 4, ...semester.grid.weekdays, ...rows.map(r => r.weekday)])).sort();
      const slots = Array.from(new Set<number>([1, 2, 3, 4, ...semester.grid.slots.map((s: Row) => s.slot), ...rows.map(r => r.slot)])).sort((a,b) => a-b);
      const changes: Row[] = semester.exceptions;
      const irregular: Row[] = semester.irregular;
      return <section key={`${semester.term_id}-${semester.version_id}`}>
        <div className="semester-section-heading"><div><h2>{semester.term}</h2></div><button type="button" className="secondary semester-changes" onClick={() => setActiveChanges(changes.map(row => ({...row, version_id: semester.version_id})))}><Bell size={16} aria-hidden="true"/>{t("semesterChanges")}<span className="semester-change-count">{changes.length}</span></button></div>
        <div className="semester-groups" role="group" aria-label={t("course_group_id")}>{groups.map(group => <span key={group}>{group}</span>)}</div>
        <p className="semester-scroll-hint">{t("semesterScrollHint")}</p>
        <div className="semester-layout"><div className="semester-scroll" tabIndex={0} role="region" aria-label={t("semesterTimetable")}>
          <table className="semester-table"><caption className="sr-only">{t("semesterTimetable")}</caption><thead><tr><th scope="col">{t("pair")}</th>{weekdays.map(day => <th scope="col" key={day}>{t(`semesterWeekday${day}`)}</th>)}</tr></thead>
          <tbody>{slots.map(slot => <tr key={slot}><th scope="row">{slot * 2 - 1}–{slot * 2}</th>{weekdays.map(day => {
            const cell = rows.filter(row => row.weekday === day && row.slot === slot);
            return <td key={day}><div className={`semester-cell${cell.length && cell.every(row => row.parity === "every") ? " only-every" : ""}`}>
              {cell.filter(row => row.parity === "every").map((row, i) => <div className="semester-every" key={`every-${i}`}><small>{t("every")}</small>{lesson(row, groups.length > 1)}</div>)}
              {(cell.some(row => row.parity !== "every") || !cell.length) && (["numerator", "denominator"] as const).map(p => <div className={`semester-half ${p}`} key={p}>
                <small>{t(p)}</small>{cell.filter(row => row.parity === p).map((row, i) => <div key={i}>{lesson(row, groups.length > 1)}</div>)}
              </div>)}
            </div></td>;
          })}</tr>)}</tbody></table>
        </div></div>
        <details className="semester-irregular" ><summary>{t("semesterIrregular")} ({irregular.length})</summary><p>{t("semesterIrregularHelp")}</p>
          {irregular.map(row => <div key={row.occurrence_id}><p>{dateLabel(row.day, lang)} · {t("pair")} {row.slot * 2 - 1}–{row.slot * 2}</p>{lesson(row)}</div>)}
        </details>
      </section>;
    })}
    {activeChanges && <ChangeDrawer rows={activeChanges} onClose={() => setActiveChanges(null)} />}
  </div>;
}
