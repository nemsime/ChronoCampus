import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, CalendarDays, MapPin, RefreshCw, SlidersHorizontal, StickyNote, UserRound, Users } from "lucide-react";
import { Account, api, ApiError, Row } from "./api";
import { addDays, dateLabel, Dialog, EmptyState, ErrorBox, ListPagination, LoadingState, localDay, useAction, weekStart } from "./common";
import { useLanguage } from "./i18n";
import { StudentGroupingStatus } from "./StudentGrouping";
import { LecturerRequestForm, LecturerRequests } from "./DatedChanges";
import { SemesterTimetable } from "./SemesterTimetable";
import { GridConfiguration, ScheduleViewToggle, useScheduleView, WeekGrid, WeekSelector } from "./WeekGrid";
export function LessonList({
  rows,
  action,
  serverPage = false,
}: {
  rows: Row[];
  action?: (row: Row) => React.ReactNode;
  serverPage?: boolean;
}) {
  const { t, lang } = useLanguage();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const fields = [
    "term_id",
    "course_group_id",
    "teacher_id",
    "room_id",
    "subject_id",
    "lesson_type",
  ];
  const labels: Record<string, string> = {
    term_id: "term",
    course_group_id: "group",
    teacher_id: "teacher",
    room_id: "room",
    subject_id: "subject",
  };
  const visible = useMemo(
    () =>
      (serverPage ? rows : rows
        .filter((row) =>
          Object.entries(filters).every(
            ([key, value]) =>
              !value ||
              (key === "start"
                ? row.day >= value
                : key === "end"
                  ? row.day <= value
                  : String(row[key]) === value),
          ),
        ))
        .slice()
        .sort((a, b) => a.day.localeCompare(b.day) || a.slot - b.slot),
    [rows, filters, serverPage],
  );
  const [page, setPage] = useState(0);
  const results = useRef<HTMLDivElement>(null);
  const pageSize = 25;
  const lastPage = Math.max(0, Math.ceil(visible.length / pageSize) - 1);
  const currentPage = Math.min(page, lastPage);
  useEffect(() => setPage(0), [filters]);
  useEffect(() => setPage((value) => Math.min(value, lastPage)), [lastPage]);
  const pagination = !serverPage && <ListPagination page={currentPage} pageSize={pageSize} total={visible.length} onChange={(next) => {
    setPage(next);
    results.current?.focus({ preventScroll: true });
    results.current?.scrollIntoView({ block: "start" });
  }} />;
  const pageRows = serverPage ? visible : visible.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const days = Array.from(pageRows.reduce<Map<string, Row[]>>((groups, row) => {
    const lessons = groups.get(row.day) || [];
    lessons.push(row);
    groups.set(row.day, lessons);
    return groups;
  }, new Map<string, Row[]>()));
  return (
    <>
      {!serverPage && <details className="timeline-filter-details">
      <summary>{t("filtersHeading")}{Object.values(filters).some(Boolean) && <span className="badge">{Object.values(filters).filter(Boolean).length}</span>}</summary>
        {Object.values(filters).some(Boolean) && <button className="link" onClick={() => setFilters({})}>{t("clearFilters")}</button>}
      <div className="filters">
        <label>
          {t("starts_on")}
          <input
            type="date"
            value={filters.start || ""}
            onChange={(e) => setFilters({ ...filters, start: e.target.value })}
          />
        </label>
        <label>
          {t("ends_on")}
          <input
            type="date"
            value={filters.end || ""}
            onChange={(e) => setFilters({ ...filters, end: e.target.value })}
          />
        </label>
        {fields.map((key) => (
          <label key={key}>
            {t(key)}
            <select
              value={filters[key] || ""}
              onChange={(e) =>
                setFilters({ ...filters, [key]: e.target.value })
              }
            >
              <option value="">{t("all")}</option>
              {Array.from(
                new Map(
                  rows.filter((row) => row[key] != null).map((row) => [
                    String(row[key]),
                    labels[key] ? row[labels[key]] : t(String(row[key])),
                  ]),
                ).entries(),
              ).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div></details>}
      <div className="results-anchor" ref={results} tabIndex={-1} aria-label={t("schedule")}>
      {pagination}
      <div className="lesson-list lesson-list-grouped">
        {days.map(([day, lessons]) => <section className="lesson-date-group" key={day}>
          <div className="lesson-date-heading">
            <h3><CalendarDays size={17} aria-hidden="true" /><time dateTime={day}>{dateLabel(day, lang)}</time></h3>
            <span className="lesson-date-count">{lessons.length} · {t("lessonsLabel")}</span>
          </div>
          {lessons.map((row) => (
          <article
            className={`lesson ${row.cancelled ? "cancelled" : ""}`}
            key={row.occurrence_id}
          >
            <span className="timeline-dot" aria-hidden="true" />
            <div className="lesson-time">
              <strong>
                {String(row.starts_at).slice(0, 5)}–
                {String(row.ends_at).slice(0, 5)}
              </strong>
              <small>
                {t("slot")} {row.slot} · {t(row.parity)}
              </small>
            </div>
            <div className="lesson-main">
              <div className="inline">
                <span className={`badge ${row.lesson_type}`}>
                  {t(row.lesson_type)}
                </span>
                {row.pinned && <span className="badge">{t("pinned")}</span>}
                {row.cancelled && (
                  <span className="badge warn">{t("cancelled")}</span>
                )}
              </div>
              <h4>{row.subject}</h4>
              {(row.teacher || row.room) && <div className="lesson-details">
                {row.teacher && <span><UserRound size={14} aria-hidden="true" />{row.teacher}</span>}
                {row.room && <span><MapPin size={14} aria-hidden="true" />{t("room_id")} {row.room}</span>}
              </div>}
              <small className="lesson-audience"><Users size={13} aria-hidden="true" />
                {row.group}
                {row.small_group_id
                  ? ` · ${t("small_group_id")} ${row.small_group}`
                  : ""}
                {row.lab_group_id
                  ? ` · ${t("lab_group_id")} ${row.lab_group}`
                  : ""}
              </small>
            </div>
            {action && <div className="lesson-action">{action(row)}</div>}
          </article>
          ))}
        </section>)}
      </div>
      {!visible.length && <EmptyState icon={CalendarDays} title={t("noLessonsTitle")} description={t("noLessonsHelp")} />}
      {pagination}
      </div>
    </>
  );
}
export function ScheduleFilters({ role, choices, values, onChange }: {
  role: Account["role"];
  choices: ScheduleFacets["filters"];
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
}) {
  const { t } = useLanguage();
  return <div className="filters">
    {Object.entries(choices).filter(([key]) => role !== "lecturer" || key !== "teacher_id").map(([key, options]) => <label key={key}>
      {t(key)}<select name={key} value={values[key] || ""} onChange={event => onChange({ ...values, [key]: event.target.value })}>
        <option value="">{t("all")}</option>
        {options.map(choice => <option key={choice.id} value={choice.id}>
          {key === "lesson_type" ? t(String(choice.id)) : choice.label}
        </option>)}
      </select>
    </label>)}
  </div>;
}

export function PersonalSchedule({ account, strictStudentGroups = false }: { account: Account; strictStudentGroups?: boolean }) {
  const { t } = useLanguage();
  const [rows, setRows] = useState<Row[]>([]);
  const [notes, setNotes] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Row | null>(null);
  const [content, setContent] = useState("");
  const { busy, error, run } = useAction();
  const [facets, setFacets] = useState<ScheduleFacets | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [range, setRange] = useState({ start: "", end: "" });
  const [view, setView] = useScheduleView(true);
  const [page, setPage] = useState(0);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(false);
  const [readError, setReadError] = useState<unknown>(null);
  const results = useRef<HTMLDivElement>(null);
  const refresh = async () => { setReload((value) => value + 1); };
  const rangeDays = (Date.parse(range.end) - Date.parse(range.start)) / 86400000;
  const validRange = Number.isFinite(rangeDays) && rangeDays >= 0 && rangeDays <= 30;
  const activeFilters = Object.values(filters).filter(Boolean).length;
  useEffect(() => setPage(0), [range, filters, view]);
  useEffect(() => {
    let active = true;
    let inFlight = false;
    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      setLoading(true);
      setReadError(null);
      try {
        const choices = await api<ScheduleFacets>("/schedule/facets");
        if (!active) return;
        setFacets(choices);
        if (view === "semester") { setRows([]); return; }
        if (!range.start) {
          const bounds = choices.date_bounds;
          if (bounds.start && bounds.end) {
            const today = localDay();
            const start = weekStart(today < bounds.start ? bounds.start : today > bounds.end ? bounds.end : today);
            setRange({ start, end: addDays(start, 6) });
          }
          setRows([]);
          return;
        }
        if (!validRange) { setRows([]); return; }
        const params = new URLSearchParams({ ...range, limit: "500" });
        Object.entries(filters).forEach(([key, value]) => {
          if (value) params.set(key, value);
        });
        // A grid must never silently omit later server pages.
        const loadWeek = async () => {
          const collected: Row[] = [];
          let cursor: string | null = null;
          for (let index = 0; index < 20; index += 1) {
            if (!active) return [];
            if (cursor) params.set("cursor", cursor);
            const result: { items: Row[]; next_cursor: string | null } = await api(`/schedule/page?${params}`);
            collected.push(...result.items);
            cursor = result.next_cursor;
            if (!cursor) return collected;
          }
          throw new ApiError(422, "weekLoadLimit");
        };
        const [lessons, memos] = await Promise.all([loadWeek(), api<Row[]>("/notes")]);
        if (!active) return;
        setRows(lessons);
        setNotes(memos);
        setSelected(current => current
          ? lessons.find(lesson => lesson.occurrence_id === current.occurrence_id) || null
          : null);
      } catch (failure) {
        if (!active) return;
        setRows([]);
        setSelected(null);
        setReadError(failure);
      } finally {
        inFlight = false;
        if (active) setLoading(false);
      }
    };
    setRows([]);
    setSelected(null);
    void load();
    const timer = window.setInterval(() => void load(), 30000);
    const focus = () => void load();
    window.addEventListener("focus", focus);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("focus", focus); };
  }, [filters, range, reload, validRange, view]);
  const note = selected
    ? notes.find((n) => n.occurrence_id === selected.occurrence_id)
    : undefined;
  function changePage(next: number) {
    setPage(next);
    results.current?.focus({ preventScroll: true });
    results.current?.scrollIntoView({ block: "start" });
  }
  const currentPage = Math.min(page, Math.max(0, Math.ceil(rows.length / 25) - 1));
  const pageRows = rows.slice(currentPage * 25, (currentPage + 1) * 25);
  const shownRows = view === "list" ? pageRows : rows;
  const pagination = view === "list" && <ListPagination page={currentPage} pageSize={25} total={rows.length} onChange={changePage} />;
  const selectLesson = (row: Row) => {
    setSelected(row);
    setContent(notes.find((n) => n.occurrence_id === row.occurrence_id)?.content || "");
  };
  const grids = Object.entries(facets?.grid || {}).filter(([termId]) =>
    (!filters.term_id || filters.term_id === termId) && rows.some((row) => String(row.term_id) === termId));
  return (
    <>
      <div className="page-heading page-hero">
        <div className="page-hero-copy">
          <p className="eyebrow">{t("scheduleEyebrow")}</p>
          <h1>{t("schedule")}</h1>
          <p>{t(account.role === "lecturer" ? "lecturerScheduleIntro" : "scheduleIntro")}</p>
        </div>
        <button
          className="secondary"
          disabled={busy || loading}
          onClick={() => void refresh()}
        >
          <RefreshCw size={16} className={loading ? "spin" : undefined} aria-hidden="true" />
          {t("refresh")}
        </button>
      </div>
      {strictStudentGroups && account.role === "student" && <StudentGroupingStatus refreshSignal={reload} />}
      {view !== "semester" && <dl className="summary-strip schedule-summary">
        {[
          { icon: CalendarDays, label: "lessonsOnPage", value: shownRows.length },
          { icon: CalendarDays, label: "teachingDaysOnPage", value: new Set(shownRows.map((row) => row.day)).size },
          { icon: BookOpen, label: "subjectsOnPage", value: new Set(shownRows.map((row) => row.subject_id)).size },
          { icon: StickyNote, label: "notesOnPage", value: shownRows.filter((row) => notes.some((note) => note.occurrence_id === row.occurrence_id)).length },
        ].map(({ icon: Icon, label, value }) => <div className="summary-item" key={label}>
          <span className="summary-item-icon"><Icon size={20} aria-hidden="true" /></span>
          <div className="summary-item-copy"><dt className="summary-item-label">{t(label)}</dt><dd className="summary-item-value">{loading ? "—" : value}</dd></div>
        </div>)}
      </dl>}
      <ErrorBox error={error} />
      {view !== "semester" && <ErrorBox error={readError} />}
      <section className="panel schedule-panel" aria-busy={loading}>
        <div className="schedule-filter-bar">
          <div><h2 className="inline"><SlidersHorizontal size={16} aria-hidden="true" />{t("filtersHeading")}
            {activeFilters > 0 && <span className="badge">{activeFilters}</span>}
          </h2><p>{t("scheduleWeekHint")}</p></div>
          {activeFilters > 0 && <button className="link" onClick={() => setFilters({})}>{t("clearFilters")}</button>}
        </div>
        <div className="schedule-week-toolbar">
          {view !== "semester" && range.start && <WeekSelector weekStart={range.start} min={facets?.date_bounds.start || undefined}
            max={facets?.date_bounds.end || undefined} onChange={(start) => setRange({ start, end: addDays(start, 6) })} />}
          <ScheduleViewToggle semester value={view} onChange={setView} />
        </div>
        <ScheduleFilters role={account.role} choices={facets?.filters || {}} values={filters} onChange={setFilters} />
        {view !== "semester" && range.start && !validRange && <p className="notice warning" role="alert">{t("schedule_range_required")}</p>}
        <div className="results-anchor" ref={results} tabIndex={-1} aria-label={t("schedule")}>
        {view === "semester" ? <SemesterTimetable filters={filters} reload={reload} /> : <>
        {pagination}
        {(loading || (!facets && !readError)) && <LoadingState label={t("scheduleLoading")} compact={rows.length > 0} />}
        {rows.length > 0 && <>
        <div className="schedule-results"><span className="count-label">{t("lessonsOnPage")}: {rows.length}</span></div>
        <div className={view !== "list" ? "schedule-grid-content" : "schedule-grid-content schedule-grid-print"}>
          {grids.map(([termId, grid]) => <section key={termId}>
            {grids.length > 1 && <h3>{facets?.filters.term_id?.find((choice) => String(choice.id) === termId)?.label}</h3>}
            <WeekGrid layout={view === "overview" ? "overview" : "grid"} weekStart={range.start} lessons={rows.filter((row) => String(row.term_id) === termId)} grid={grid}
              perspective={account.role === "lecturer" || filters.teacher_id ? "lecturer" : filters.room_id ? "room" : "group"} onSelect={selectLesson}
              decorations={(row) => ({ badges: notes.some((memo) => memo.occurrence_id === row.occurrence_id)
                ? <span className="badge"><StickyNote size={12} aria-hidden="true" />{t("note")}</span> : undefined })} />
          </section>)}
        </div>
        {(view === "list" || !grids.length) && <div className="schedule-list-content"><LessonList
          serverPage
          rows={pageRows}
          action={(row) => (
            <button
              className="secondary"
              onClick={() => selectLesson(row)}
            >
              <StickyNote size={16} aria-hidden="true" />
              {t("note")}
              {notes.some((n) => n.occurrence_id === row.occurrence_id) && <span className="note-dot" aria-hidden="true" />}
            </button>
          )}
        /></div>}
        </>}
        {!loading && !readError && facets && !rows.length && (
          !facets.date_bounds.start ? <EmptyState icon={CalendarDays} title={t("noPublishedTitle")} description={t("noPublishedHelp")} />
            : validRange ? <EmptyState icon={CalendarDays} title={t("noLessonsTitle")} description={t("noLessonsHelp")} /> : null
        )}
        {pagination}
        </>}
        </div>
      </section>
      {account.role === "lecturer" && <LecturerRequests reload={reload} />}
      {selected && (
        <Dialog labelledBy="note-title" closeDisabled={busy} onClose={() => setSelected(null)}>
          <h2 id="note-title">{t("note")}</h2>
          <p>{selected.subject} · {selected.day} · {String(selected.starts_at).slice(0, 5)}–{String(selected.ends_at).slice(0, 5)}</p>
          <p>{[selected.teacher, selected.room && `${t("room_id")} ${selected.room}`, selected.group].filter(Boolean).join(" · ")}</p>
          {account.role === "lecturer" && <LecturerRequestForm key={selected.occurrence_id} lesson={selected} slots={facets?.grid[String(selected.term_id)]?.slots || []} onSaved={() => setReload(v => v + 1)} />}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const saved = await api<Row>(`/notes/${selected.occurrence_id}`, "PUT", {
                  content,
                });
                setNotes((current) => [...current.filter((memo) => memo.occurrence_id !== saved.occurrence_id), saved]);
                setSelected(null);
                await refresh();
              });
            }}
          >
            <label>
              {t("note")}
              <textarea
                autoFocus
                required
                maxLength={10000}
                disabled={busy}
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
            </label>
            <ErrorBox error={error} />
            <div className="actions">
              <button disabled={busy}>{t("save")}</button>
              {note && (
                <button
                  disabled={busy}
                  type="button"
                  className="danger-text"
                  onClick={() =>
                    void run(async () => {
                      await api(`/notes/${note.id}`, "DELETE");
                      setNotes((current) => current.filter((memo) => memo.id !== note.id));
                      setSelected(null);
                      await refresh();
                    })
                  }
                >
                  {t("delete")}
                </button>
              )}
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => setSelected(null)}
              >
                {t("cancel")}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}

export interface ScheduleFacets {
  filters: Record<string, { id: string | number; label: string }[]>;
  date_bounds: { start: string | null; end: string | null };
  revision: number;
  grid: Record<string, GridConfiguration>;
}
