import { useEffect, useMemo, useState } from "react";
import { api, Row } from "./api";
import { dateLabel, Dialog, ErrorBox, useAction } from "./common";
import { useLanguage } from "./i18n";
export function LessonList({
  rows,
  action,
}: {
  rows: Row[];
  action?: (row: Row) => React.ReactNode;
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
      rows
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
    [rows, filters],
  );
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [filters, rows]);
  return (
    <>
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
      </div>
      <div className="lesson-list">
        {visible.slice(page * 40, (page + 1) * 40).map((row) => (
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
      {!visible.length && <p className="empty">{t("empty")}</p>}
      {visible.length > 40 && (
        <div className="pagination">
          <button
            className="secondary"
            aria-label={t("previous_page")}
            disabled={!page}
            onClick={() => setPage(page - 1)}
          >
            ←
          </button>
          <span>
            {page + 1} / {Math.ceil(visible.length / 40)}
          </span>
          <button
            className="secondary"
            aria-label={t("next_page")}
            disabled={(page + 1) * 40 >= visible.length}
            onClick={() => setPage(page + 1)}
          >
            →
          </button>
        </div>
      )}
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
  const refresh = async () => {
    const [lessons, memos] = await Promise.all([
      api<Row[]>("/schedule"),
      api<Row[]>("/notes"),
    ]);
    setRows(lessons);
    setNotes(memos);
  };
  useEffect(() => {
    void run(refresh);
  }, []);
  const note = selected
    ? notes.find((n) => n.occurrence_id === selected.occurrence_id)
    : undefined;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">CHRONOCAMPUS</p>
          <h1>{t("schedule")}</h1>
          <p>{t("unpublished")}</p>
        </div>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => void run(refresh)}
        >
          {t("refresh")}
        </button>
      </div>
      <ErrorBox error={error} />
      <section className="panel">
        <LessonList
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
              {notes.some((n) => n.occurrence_id === row.occurrence_id)
                ? "✎ "
                : ""}
              {t("note")}
            </button>
          )}
        />
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
