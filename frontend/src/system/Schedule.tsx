import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw, SlidersHorizontal, StickyNote } from "lucide-react";
import { api, ApiError, Row } from "./api";
import { dateLabel, Dialog, EmptyState, ErrorBox, ListPagination, LoadingState, useAction } from "./common";
import { useLanguage } from "./i18n";
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
      serverPage ? rows : rows
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
        )
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
  return (
    <>
      {!serverPage && <>
      <div className="schedule-filter-bar">
        <h2 className="inline"><SlidersHorizontal size={16} aria-hidden="true" />{t("filtersHeading")}</h2>
        {Object.values(filters).some(Boolean) && <button className="link" onClick={() => setFilters({})}>{t("clearFilters")}</button>}
      </div>
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
                  rows.map((row) => [
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
      </div></>}
      <div className="results-anchor" ref={results} tabIndex={-1} aria-label={t("schedule")}>
      {pagination}
      <div className="lesson-list">
        {(serverPage ? visible : visible.slice(currentPage * pageSize, (currentPage + 1) * pageSize)).map((row) => (
          <article
            className={`lesson ${row.cancelled ? "cancelled" : ""}`}
            key={row.occurrence_id}
          >
            <div className="lesson-time">
              <strong>{dateLabel(row.day, lang)}</strong>
              <span>
                {String(row.starts_at).slice(0, 5)}–
                {String(row.ends_at).slice(0, 5)}
              </span>
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
              <h3>{row.subject}</h3>
              <p>
                {row.teacher} · {t("room_id")} {row.room}
              </p>
              <small>
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
      </div>
      {!visible.length && <EmptyState icon={CalendarDays} title={t("noLessonsTitle")} description={t("noLessonsHelp")} />}
      {pagination}
      </div>
    </>
  );
}
export function PersonalSchedule() {
  const { t } = useLanguage();
  const [rows, setRows] = useState<Row[]>([]);
  const [notes, setNotes] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Row | null>(null);
  const [content, setContent] = useState("");
  const { busy, error, run } = useAction();
  const [facets, setFacets] = useState<ScheduleFacets | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [range, setRange] = useState({ start: "", end: "" });
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(false);
  const [readError, setReadError] = useState<unknown>(null);
  const results = useRef<HTMLDivElement>(null);
  const refresh = async () => { setReload((value) => value + 1); };
  const rangeDays = (Date.parse(range.end) - Date.parse(range.start)) / 86400000;
  const validRange = Number.isFinite(rangeDays) && rangeDays >= 0 && rangeDays <= 30;
  const cursor = cursors[cursors.length - 1];
  const activeFilters = Object.values(filters).filter(Boolean).length;
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
        if (!range.start) {
          const bounds = choices.date_bounds;
          if (bounds.start && bounds.end) {
            const today = new Date().toISOString().slice(0, 10);
            const start = today < bounds.start ? bounds.start : today > bounds.end ? bounds.end : today;
            setRange({ start, end: addDays(start, Math.min(30, (Date.parse(bounds.end) - Date.parse(start)) / 86400000)) });
          }
          setRows([]);
          return;
        }
        if (!validRange) { setRows([]); return; }
        const params = new URLSearchParams({ ...range, limit: "25" });
        Object.entries(filters).forEach(([key, value]) => {
          if (value) params.set(key, value);
        });
        if (cursor) params.set("cursor", cursor);
        const [page, memos] = await Promise.all([
          api<{ items: Row[]; next_cursor: string | null }>(`/schedule/page?${params}`),
          api<Row[]>("/notes"),
        ]);
        if (!active) return;
        setRows(page.items);
        setNextCursor(page.next_cursor);
        setNotes(memos);
      } catch (failure) {
        if (!active) return;
        setRows([]);
        setNextCursor(null);
        if (failure instanceof ApiError && failure.status === 409 && cursor) {
          setCursors([null]);
        } else setReadError(failure);
      } finally {
        inFlight = false;
        if (active) setLoading(false);
      }
    };
    setRows([]);
    setNextCursor(null);
    void load();
    const timer = window.setInterval(() => void load(), 30000);
    const focus = () => void load();
    window.addEventListener("focus", focus);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("focus", focus); };
  }, [filters, range, cursor, reload, validRange]);
  const note = selected
    ? notes.find((n) => n.occurrence_id === selected.occurrence_id)
    : undefined;
  function changePage(next: (string | null)[]) {
    setCursors(next);
    results.current?.focus({ preventScroll: true });
    results.current?.scrollIntoView({ block: "start" });
  }
  const pagination = (rows.length > 0 || cursors.length > 1) && <nav className="pagination result-pagination" aria-label={t("paginationLabel")}>
    <button className="secondary" disabled={loading || cursors.length === 1}
      onClick={() => changePage(cursors.slice(0, -1))}><ChevronLeft size={16} aria-hidden="true" />{t("previous_page")}</button>
    <span className="count-label">{t("pageLabel")} {cursors.length}</span>
    <button className="secondary" disabled={loading || !nextCursor}
      onClick={() => nextCursor && changePage([...cursors, nextCursor])}>{t("next_page")}<ChevronRight size={16} aria-hidden="true" /></button>
  </nav>;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{t("schedule")}</h1>
          <p>{t("scheduleIntro")}</p>
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
      <ErrorBox error={error} />
      <ErrorBox error={readError} />
      <section className="panel" aria-busy={loading}>
        <div className="schedule-filter-bar">
          <div><h2 className="inline"><SlidersHorizontal size={16} aria-hidden="true" />{t("filtersHeading")}
            {activeFilters > 0 && <span className="badge">{activeFilters}</span>}
          </h2><p>{t("scheduleRangeHint")}</p></div>
          {activeFilters > 0 && <button className="link" onClick={() => { setFilters({}); setCursors([null]); }}>{t("clearFilters")}</button>}
        </div>
        <div className="filters">
          {(["start", "end"] as const).map((key) => <label key={key}>
            {t(key === "start" ? "starts_on" : "ends_on")}
            <input type="date" value={range[key]} min={facets?.date_bounds.start || undefined}
              max={key === "end" && range.start ? addDays(range.start, 30) : facets?.date_bounds.end || undefined}
              onChange={(event) => { setRange({ ...range, [key]: event.target.value }); setCursors([null]); }} />
          </label>)}
          {Object.entries(facets?.filters || {}).map(([key, choices]) => <label key={key}>
            {t(key)}<select value={filters[key] || ""} onChange={(event) => {
              setFilters({ ...filters, [key]: event.target.value }); setCursors([null]);
            }}><option value="">{t("all")}</option>
              {choices.map((choice) => <option key={choice.id} value={choice.id}>
                {key === "lesson_type" ? t(String(choice.id)) : choice.label}
              </option>)}
            </select>
          </label>)}
        </div>
        {range.start && !validRange && <p className="notice warning" role="alert">{t("schedule_range_required")}</p>}
        <div className="results-anchor" ref={results} tabIndex={-1} aria-label={t("schedule")}>
        {pagination}
        {(loading || (!facets && !readError)) && <LoadingState label={t("scheduleLoading")} compact={rows.length > 0} />}
        {rows.length > 0 && <>
        <div className="schedule-results"><span className="count-label">{t("lessonsOnPage")}: {rows.length}</span></div>
        <LessonList
          serverPage
          rows={rows}
          action={(row) => (
            <button
              className="secondary"
              onClick={() => {
                setSelected(row);
                setContent(
                  notes.find((n) => n.occurrence_id === row.occurrence_id)
                    ?.content || "",
                );
              }}
            >
              <StickyNote size={16} aria-hidden="true" />
              {t("note")}
              {notes.some((n) => n.occurrence_id === row.occurrence_id) && <span className="note-dot" aria-hidden="true" />}
            </button>
          )}
        />
        </>}
        {!loading && !readError && facets && !rows.length && (
          !facets.date_bounds.start ? <EmptyState icon={CalendarDays} title={t("noPublishedTitle")} description={t("noPublishedHelp")} />
            : validRange ? <EmptyState icon={CalendarDays} title={t("noLessonsTitle")} description={t("noLessonsHelp")} /> : null
        )}
        {pagination}
        </div>
      </section>
      {selected && (
        <Dialog labelledBy="note-title" onClose={() => setSelected(null)}>
          <h2 id="note-title">{t("note")}</h2>
          <p>
            {selected.subject} · {selected.day}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await api(`/notes/${selected.occurrence_id}`, "PUT", {
                  content,
                });
                await refresh();
                setSelected(null);
              });
            }}
          >
            <label>
              {t("note")}
              <textarea
                autoFocus
                required
                maxLength={10000}
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
                      await refresh();
                      setSelected(null);
                    })
                  }
                >
                  {t("delete")}
                </button>
              )}
              <button
                type="button"
                className="secondary"
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

interface ScheduleFacets {
  filters: Record<string, { id: string | number; label: string }[]>;
  date_bounds: { start: string | null; end: string | null };
  revision: number;
}

function addDays(day: string, days: number) {
  return new Date(Date.parse(day) + days * 86400000).toISOString().slice(0, 10);
}
