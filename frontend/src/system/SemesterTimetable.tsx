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
  const lesson = (row: Row) => <div className="semester-lesson">
    <strong>{row.subject}</strong><span>{t(row.lesson_type)} · {row.teacher}</span>
    <span>{t("room_id")} {row.room} · {row.group}
      {row.small_group && ` · ${t("small_group_id")} ${row.small_group}`}
      {row.lab_group && ` · ${t("lab_group_id")} ${row.lab_group}`}</span>
  </div>;
  return <div className="semester-timetable">
    <p>{t("semesterTemplateHelp")}</p>
    <p className="notice">{t("semesterParityLegend")}</p>
    {!semesters.length && <p>{t("noPublishedHelp")}</p>}
    {semesters.map(semester => {
      const rows: Row[] = semester.template_rows;
      const weekdays = Array.from(new Set<number>([0, 1, 2, 3, 4, ...semester.grid.weekdays, ...rows.map(r => r.weekday)])).sort();
      const slots = Array.from(new Set<number>([1, 2, 3, 4, ...semester.grid.slots.map((s: Row) => s.slot), ...rows.map(r => r.slot)])).sort((a,b) => a-b);
      const changes: Row[] = semester.exceptions;
      const irregular: Row[] = semester.irregular;
      return <section key={`${semester.term_id}-${semester.version_id}`}>
        <h2>{semester.term}</h2>
        <div className="semester-layout"><div className="semester-scroll" tabIndex={0} role="region" aria-label={t("semesterTimetable")}>
          <table className="semester-table"><caption>{t("semesterTimetable")}</caption><thead><tr><th scope="col">{t("pair")}</th>{weekdays.map(day => <th scope="col" key={day}>{new Intl.DateTimeFormat(lang === "hy" ? "hy-AM" : lang, { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 0, 5 + day)))}</th>)}</tr></thead>
          <tbody>{slots.map(slot => <tr key={slot}><th scope="row">{slot * 2 - 1}–{slot * 2}</th>{weekdays.map(day => {
            const cell = rows.filter(row => row.weekday === day && row.slot === slot);
            return <td key={day}>
              {cell.filter(row => row.parity === "every").map((row, i) => <div className="semester-every" key={`every-${i}`}><small>{t("every")}</small>{lesson(row)}</div>)}
              {(cell.some(row => row.parity !== "every") || !cell.length) && (["numerator", "denominator"] as const).map(p => <div className={`semester-half ${p}`} key={p}>
                <small>{t(p)}</small>{cell.filter(row => row.parity === p).map((row, i) => <div key={i}>{lesson(row)}</div>)}
              </div>)}
            </td>;
          })}</tr>)}</tbody></table>
        </div><aside className="semester-changes"><h3>{t("semesterChanges")}</h3>
          {!changes.length && <p>{t("semesterNoChanges")}</p>}
          {Array.from(new Set(changes.map(row => row.day))).sort().map(day => <section key={day}><h4>{dateLabel(day, lang)}</h4>{changes.filter(row => row.day === day).map(row => <div key={row.occurrence_id}>
            <p>{t(`template_${row.reason}`)}{row.inferred && ` · ${t("template_inferred")}`} · {t("pair")} {row.slot * 2 - 1}–{row.slot * 2}</p>{lesson(row)}
            {row.original?.day && <small>{t("template_original")}: {dateLabel(row.original.day, lang)} · {t("pair")} {row.original.slot * 2 - 1}–{row.original.slot * 2}</small>}
          </div>)}</section>)}
        </aside></div>
        <details className="semester-irregular" open={irregular.length > 0}><summary>{t("semesterIrregular")} ({irregular.length})</summary><p>{t("semesterIrregularHelp")}</p>
          {irregular.map(row => <div key={row.occurrence_id}><p>{dateLabel(row.day, lang)} · {t("pair")} {row.slot * 2 - 1}–{row.slot * 2}</p>{lesson(row)}</div>)}
        </details>
      </section>;
    })}
  </div>;
}
