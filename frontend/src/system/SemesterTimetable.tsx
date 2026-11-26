import { Bell, MapPin, UserRound } from "lucide-react";
import { ChangeDrawer } from "./ChangeNotifications";
import { useEffect, useId, useState } from "react";
import { api, Row } from "./api";
import { shortLecturer, shortSubject } from "./timetableLabels";
import { Dialog, ErrorBox, dateLabel, LoadingState } from "./common";
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

const compactKinds: Record<string, string> = {
  lecture: "compactLecture",
  practical: "compactPractical",
  lab: "compactLab",
  pe: "compact_pe",
};

export function SemesterTemplateContent({ semesters }: { semesters: Row[] }) {
  const { t, lang } = useLanguage();
  const tableId = useId();
  const [focusedDay, setFocusedDay] = useState<number | null>(null);
  const [selectedLesson, setSelectedLesson] = useState<Row | null>(null);
  const [activeChanges, setActiveChanges] = useState<Row[] | null>(null);
  const compactLesson = (row: Row) => {
    const kind = t(compactKinds[row.lesson_type] ?? row.lesson_type);
    const audience = row.lesson_type === "lab" ? row.lab_group : row.small_group;
    const full = [row.subject, t(row.lesson_type), row.teacher, row.room && `${t("room_id")} ${row.room}`, row.group, row.small_group ? `${t("small_group_id")} ${row.small_group}` : "", row.lab_group ? `${t("lab_group_id")} ${row.lab_group}` : ""].filter(Boolean).join(" · ");
    return <button type="button" className={`semester-compact-lesson semester-lesson-${row.lesson_type}`} aria-label={full} onClick={() => setSelectedLesson(row)}>
      <strong>{shortSubject(row.subject || "")}</strong>
      <span className="compact-kind">{kind}{audience ? ` ${audience}` : ""}</span>
      {row.teacher && <span className="compact-teacher">{shortLecturer(row.teacher)}</span>}
      {row.room && <span className="compact-room">{row.room}{row.lesson_type === "lab" && row.small_group ? ` · ${t("compactGroup")}${row.small_group}` : ""}</span>}
    </button>;
  };
  const lesson = (row: Row, showGroup = true) => <div className={`semester-lesson semester-lesson-${row.lesson_type}`}>
    <span className="semester-type">{t(row.lesson_type)}</span>
    <strong>{row.subject}</strong>
    {row.teacher && <span className="semester-person"><UserRound size={12} aria-hidden="true" />{row.teacher}</span>}
    {row.room && <span className="semester-room"><MapPin size={12} aria-hidden="true" />{row.room}</span>}
    {(showGroup || row.small_group || row.lab_group) && <span className="semester-audience">{[showGroup ? row.group : null, row.small_group ? `${t("small_group_id")} ${row.small_group}` : null, row.lab_group ? `${t("lab_group_id")} ${row.lab_group}` : null].filter(Boolean).join(" · ")}</span>}
  </div>;
  return <div className="semester-timetable">
    <p className="semester-intro sr-only">{t("semesterTemplateHelp")}</p>
    <div className="semester-legend"><span><i className="legend-every" />{t("every")}</span><span><i className="legend-numerator" />{t("numerator")}</span><span><i className="legend-denominator" />{t("denominator")}</span><small className="sr-only">{t("semesterParityLegend")}</small></div>
    {!semesters.length && <p>{t("noPublishedHelp")}</p>}
    {semesters.map(semester => {
      const rows: Row[] = semester.template_rows;
      const groups = Array.from(new Set<string>([...rows, ...semester.irregular, ...semester.exceptions].map((row: Row) => row.group).filter(Boolean)));
      const weekdays = Array.from(new Set<number>([0, 1, 2, 3, 4, ...semester.grid.weekdays, ...rows.map(r => r.weekday)])).sort();
      const slots = Array.from(new Set<number>([1, 2, 3, 4, ...semester.grid.slots.map((s: Row) => s.slot), ...rows.map(r => r.slot)])).sort((a,b) => a-b);
      const activeDay = focusedDay !== null && weekdays.includes(focusedDay) ? focusedDay : null;
      const visibleDays = activeDay === null ? weekdays : [activeDay];
      const headerId = `${tableId}-${semester.term_id}-${semester.version_id}`;
      const changes: Row[] = semester.exceptions;
      const irregular: Row[] = semester.irregular;
      return <section key={`${semester.term_id}-${semester.version_id}`}>
        <div className="semester-section-heading"><div><h2>{semester.term}</h2></div><button type="button" className="secondary semester-changes" onClick={() => setActiveChanges(changes.map(row => ({...row, version_id: semester.version_id})))}><Bell size={16} aria-hidden="true"/>{t("semesterChanges")}<span className="semester-change-count">{changes.length}</span></button></div>
        <div className="semester-groups" role="group" aria-label={t("course_group_id")}>{groups.map(group => <span key={group}>{group}</span>)}</div>
        <div className="semester-day-filter" role="group" aria-label={t("semesterDayFilter")}>
          <button type="button" className="secondary" aria-pressed={activeDay === null} onClick={() => setFocusedDay(null)}>{t("semesterWholeWeek")}</button>
          {weekdays.map(day => <button type="button" className="secondary" aria-pressed={activeDay === day} key={day} onClick={() => setFocusedDay(day)}>{t(`semesterWeekday${day}`)}</button>)}
        </div>
        <p className="semester-sheet-hint">{t("semesterSheetHelp")}</p>
        <div className="semester-layout"><div className="semester-scroll" tabIndex={0} role="region" aria-label={t("semesterTimetable")}>
          <table className="semester-table semester-sheet-table" style={{ minWidth: `${64 + visibleDays.length * slots.length * 60}px` }}>
            <caption className="sr-only">{t("semesterTimetable")}</caption>
            <colgroup><col className="semester-sheet-group-column" />{visibleDays.flatMap(day => slots.map(slot => <col key={`${day}-${slot}`} className="semester-sheet-pair-column" />))}</colgroup>
            <thead>
              <tr><th className="semester-sheet-corner" scope="col" rowSpan={2}>{t("course_group_id")}</th>{visibleDays.map(day => <th id={`${headerId}-day-${day}`} scope="colgroup" colSpan={slots.length} key={day}>{t(`semesterWeekday${day}`)}</th>)}</tr>
              <tr>{visibleDays.flatMap(day => slots.map(slot => <th id={`${headerId}-pair-${day}-${slot}`} scope="col" key={`${day}-${slot}`}>{slot * 2 - 1}–{slot * 2}</th>))}</tr>
            </thead>
            <tbody>{groups.map((group, groupIndex) => <tr key={group} data-course-group={group}>
              <th className="semester-sheet-group" id={`${headerId}-group-${groupIndex}`} scope="row">{group}</th>
              {visibleDays.flatMap(day => slots.map(slot => {
                const cell = rows.filter(row => row.group === group && row.weekday === day && row.slot === slot);
                return <td key={`${day}-${slot}`} data-weekday={day} data-slot={slot} headers={`${headerId}-group-${groupIndex} ${headerId}-day-${day} ${headerId}-pair-${day}-${slot}`}><div className={`semester-cell${cell.length && cell.every(row => row.parity === "every") ? " only-every" : ""}`}>
                  {cell.filter(row => row.parity === "every").map((row, i) => <div className="semester-every" key={`every-${i}`}><small className="sr-only">{t("every")}</small>{compactLesson(row)}</div>)}
                  {(cell.some(row => row.parity !== "every") || !cell.length) && (["numerator", "denominator"] as const).map(parity => <div className={`semester-half ${parity}`} key={parity} role="group" aria-label={t(parity)}>
                    <small>{t(parity)}</small>{cell.filter(row => row.parity === parity).map((row, i) => <div key={i}>{compactLesson(row)}</div>)}
                  </div>)}
                </div></td>;
              }))}
            </tr>)}</tbody>
          </table>
        </div></div>
        <details className="semester-irregular" ><summary>{t("semesterIrregular")} ({irregular.length})</summary><p>{t("semesterIrregularHelp")}</p>
          {irregular.map(row => <div key={row.occurrence_id}><p>{dateLabel(row.day, lang)} · {t("pair")} {row.slot * 2 - 1}–{row.slot * 2}</p>{lesson(row)}</div>)}
        </details>
      </section>;
    })}
    {selectedLesson && <Dialog labelledBy={`${tableId}-lesson`} onClose={() => setSelectedLesson(null)}>
      <h2 id={`${tableId}-lesson`}>{selectedLesson.subject}</h2>
      <p>{t(selectedLesson.lesson_type)}{selectedLesson.teacher && ` · ${selectedLesson.teacher}`}</p>
      <p>{t(`semesterWeekday${selectedLesson.weekday}`)} · {t("pair")} {selectedLesson.slot * 2 - 1}–{selectedLesson.slot * 2} · {t(selectedLesson.parity)}</p>
      <p>{selectedLesson.room && `${t("room_id")} ${selectedLesson.room} · `}{selectedLesson.group}</p>
      {selectedLesson.small_group && <p>{t("small_group_id")} {selectedLesson.small_group}</p>}
      {selectedLesson.lab_group && <p>{t("lab_group_id")} {selectedLesson.lab_group}</p>}
    </Dialog>}
    {activeChanges && <ChangeDrawer rows={activeChanges} onClose={() => setActiveChanges(null)} />}
  </div>;
}
