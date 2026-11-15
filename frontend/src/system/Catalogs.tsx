import { FormEvent, useEffect, useRef, useState } from "react";
import { BookOpen, Building2, CalendarDays, CalendarPlus, CalendarRange, Clock3, Database, DoorOpen, FlaskConical, GraduationCap, Landmark, Layers3, ListChecks, Monitor, Pencil, Plus, RefreshCw, Save, Search, SlidersHorizontal, Sun, Trash2, UserRound, Users, X, type LucideIcon } from "lucide-react";
import { api, Row } from "./api";
import { catalogSchema, Field, resourceNames } from "./catalogSchema";
import { Dialog, EmptyState, ErrorBox, ListPagination, LoadingState, localDay, PasswordInput, useAction } from "./common";
import { useLanguage } from "./i18n";
import { adminAreas, catalogScope, type CatalogMode } from "./adminFlow";
export type CatalogData = Record<string, Row[]>;
export const rowLabel = (row: Row) =>
  row.display_name ||
  row.group_code ||
  row.room_number ||
  row.name ||
  row.label ||
  String(row.id);
export async function loadCatalogs(): Promise<CatalogData> {
  const rows = await Promise.all(
    resourceNames.map(async (name) => [
      name,
      await api(`/admin/catalog/${name}`),
    ]),
  );
  return Object.fromEntries(rows);
}
const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const resourceIcons: Record<string, LucideIcon> = {
  faculties: Landmark, majors: GraduationCap, groups: Users, subgroups: Layers3,
  "lab-groups": FlaskConical, buildings: Building2, rooms: DoorOpen, equipment: Monitor,
  subjects: BookOpen, users: UserRound, calendars: Clock3, terms: CalendarDays,
  periods: CalendarRange, holidays: Sun, "extra-permissions": CalendarPlus,
  availability: SlidersHorizontal, workloads: ListChecks,
};
function FieldInput({
  field: f,
  value,
  onChange,
  data,
  draft,
}: {
  field: Field;
  value: any;
  onChange: (v: any) => void;
  data: CatalogData;
  draft: Row;
}) {
  const { t } = useLanguage();
  const id = `field-${f.key}`;
  const props = { id, required: !f.optional };
  if (f.type === "boolean")
    return (
      <label className="check">
        <input
          id={id}
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
        />
        {t(f.key)}
      </label>
    );
  let input;
  if (f.type === "reference" || f.type === "select") {
    let options =
      f.type === "select"
        ? (f.options || []).map((v) => ({ id: v, label: t(v) }))
        : (data[f.resource!] || [])
            .filter((row) => !f.filter || row.role === f.filter)
            .filter((row) =>
              f.key === "small_group_id" && draft.course_group_id
                ? row.course_group_id === Number(draft.course_group_id)
                : f.key === "lab_group_id" && draft.small_group_id
                  ? row.small_group_id === Number(draft.small_group_id)
                  : true,
            )
            .map((row) => ({ id: row.id, label: rowLabel(row) }));
    input = (
      <select
        {...props}
        value={value ?? ""}
        onChange={(e) =>
          onChange(
            e.target.value === ""
              ? null
              : f.type === "reference"
                ? Number(e.target.value)
                : e.target.value,
          )
        }
      >
        <option value="">{t(f.optional ? "none" : "select")}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    );
  } else if (f.type === "days" || f.type === "multi") {
    const options =
      f.type === "days"
        ? days.map((day, index) => ({ id: index, label: t(day) }))
        : (data[f.resource!] || []).map((row) => ({
            id: row.id,
            label: rowLabel(row),
          }));
    input = (
      <div className="choice-grid">
        {options.map((o) => (
          <label className="check" key={o.id}>
            <input
              type="checkbox"
              checked={(value || []).includes(o.id)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...(value || []), o.id]
                    : (value || []).filter((v: number) => v !== o.id),
                )
              }
            />
            {o.label}
          </label>
        ))}
      </div>
    );
  } else if (f.type === "breaks") {
    input = (
      <div className="compound">
        {Object.entries(value || {}).map(([number, length]) => (
          <div className="inline" key={number}>
            <span>
              {t("slot")} {number}
            </span>
            <input
              aria-label={`${t("break_minutes")} ${number}`}
              type="number"
              min={0}
              max={120}
              value={length as number}
              onChange={(e) =>
                onChange({ ...value, [number]: Number(e.target.value) })
              }
            />
            <button
              type="button"
              className="secondary"
              onClick={() => {
                const next = { ...value };
                delete next[number];
                onChange(next);
              }}
            >
              {t("delete")}
            </button>
          </div>
        ))}
        <button
          type="button"
          className="secondary"
          onClick={() => {
            let n = 1;
            while (String(n) in (value || {})) n++;
            onChange({ ...value, [n]: 10 });
          }}
        >
          {t("add")}
        </button>
      </div>
    );
  } else if (f.type === "weights") {
    input = (
      <div className="compound">
        {Object.entries(value || {}).map(([key, v]) => (
          <label className="inline" key={key}>
            {t(key)}
            <input
              type="number"
              min={0}
              max={100}
              value={v as number}
              onChange={(e) =>
                onChange({ ...value, [key]: Number(e.target.value) })
              }
            />
          </label>
        ))}
      </div>
    );
  } else if (f.type === "numbers")
    input = (
      <input
        {...props}
        placeholder="5, 6"
        value={Array.isArray(value) ? value.join(", ") : (value ?? "")}
        pattern="[0-9, ]+"
        onChange={(e) => onChange(e.target.value)}
      />
    );
  else if (f.type === "password")
    input = (
      <PasswordInput
        {...props}
        minLength={12}
        maxLength={256}
        autoComplete="new-password"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  else
    input = (
      <input
        {...props}
        type={f.type || "text"}
        min={f.min}
        max={f.max}
        value={value ?? ""}
        onChange={(e) =>
          onChange(
            f.type === "number"
              ? e.target.value === ""
                ? null
                : Number(e.target.value)
              : e.target.value,
          )
        }
      />
    );
  return (
    <div className="field">
      <label htmlFor={id}>
        {t(f.key)}
        {f.optional ? "" : " *"}
      </label>
      {input}
    </div>
  );
}
export function Catalogs({ mode = "university", onCreateDraft }: { mode?: CatalogMode; onCreateDraft?: (termId: string) => void }) {
  const { t } = useLanguage();
  const [data, setData] = useState<CatalogData>({});
  const areas = adminAreas[mode];
  const [resource, setResource] = useState(areas[0].resources[0]);
  const [termId, setTermId] = useState("");
  const [draft, setDraft] = useState<Row | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [slots, setSlots] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const results = useRef<HTMLElement>(null);
  const { busy, error, setError, run } = useAction();
  const ResourceIcon = resourceIcons[resource] || Database;
  const area = areas.find(item => item.resources.includes(resource)) || areas[0];
  const selectedTerm = data.terms?.find(row => String(row.id) === termId);
  useEffect(() => {
    if (data.terms?.length && !data.terms.some(row => String(row.id) === termId)) {
      const sorted = [...data.terms].sort((a, b) => b.starts_on.localeCompare(a.starts_on));
      setTermId(String((sorted.find(row => row.starts_on <= localDay() && row.ends_on >= localDay()) || sorted[0]).id));
    }
  }, [data.terms, termId]);
  const refresh = async () => {
    setLoading(true);
    try { setData(await loadCatalogs()); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    void run(refresh);
  }, []);
  function open(row?: Row) {
    setError(null);
    setEditing(row?.id ?? null);
    setDraft(
      Object.fromEntries(
        catalogSchema[resource].map((f) => [
          f.key,
          row?.[f.key] ?? (mode === "semester" && !row && selectedTerm && resource !== "terms"
            ? f.key === "term_id" ? selectedTerm.id : ["starts_on", "ends_on"].includes(f.key) ? selectedTerm[f.key] : undefined
            : undefined) ?? f.initial ?? (f.type === "boolean" ? false : null),
        ]),
      ),
    );
    setSlots([]);
    if (resource === "calendars" && row)
      void run(async () =>
        setSlots(await api(`/admin/calendar/${row.id}/slots?count=8`)),
      );
  }
  function save(e: FormEvent) {
    e.preventDefault();
    void run(async () => {
      const body = { ...draft };
      for (const field of catalogSchema[resource]) {
        if (field.visibleWhen && body[field.visibleWhen.key] !== field.visibleWhen.value)
          body[field.key] = null;
        if (field.type === "numbers")
          body[field.key] = Array.isArray(body[field.key])
            ? body[field.key]
            : String(body[field.key] || "")
                .split(",")
                .map((v) => Number(v.trim()))
                .filter(Boolean);
        if (field.type === "password" && !body[field.key])
          body[field.key] = null;
        if (field.optional && body[field.key] === "") body[field.key] = null;
        if (
          ["address", "description"].includes(field.key) &&
          body[field.key] == null
        )
          body[field.key] = "";
      }
      const saved = await api<Row>(
        `/admin/catalog/${resource}${editing ? `/${editing}` : ""}`,
        editing ? "PUT" : "POST",
        body,
      );
      setData((current) => ({
        ...current,
        [resource]: editing
          ? (current[resource] || []).map((row) => row.id === saved.id ? saved : row)
          : [...(current[resource] || []), saved],
      }));
      setDraft(null);
      if (mode === "semester" && resource === "terms" && !editing) setTermId(String(saved.id));
      await refresh();
    });
  }
  function display(field: Field, row: Row) {
    const value = row[field.key];
    if (field.type === "password") return "••••";
    if (field.type === "reference")
      return rowLabel(
        (data[field.resource!] || []).find((r) => r.id === value) || {
          id: value ?? "—",
        },
      );
    if (field.type === "boolean")
      return <span className={`badge ${value ? "success" : ""}`}>{t(value ? "yes" : "no")}</span>;
    if (field.type === "days")
      return (value || []).map((d: number) => t(days[d])).join(", ");
    if (field.type === "multi")
      return (value || [])
        .map((id: number) =>
          rowLabel(
            (data[field.resource!] || []).find((r) => r.id === id) || { id },
          ),
        )
        .join(", ");
    if (typeof value === "object") return "…";
    return field.type === "select" ? t(value) : String(value ?? "—");
  }
  const summaryFields: Record<string, string[]> = {
    calendars: [
      "name",
      "study_form",
      "first_start",
      "ordinary_slots",
      "teaching_weeks",
      "confirmed",
    ],
    terms: ["name", "starts_on", "ends_on", "calendar_id", "confirmed"],
    users: ["display_name", "email", "role", "is_active", "course_group_id"],
    workloads: [
      "course_group_id",
      "subject_id",
      "lesson_type",
      "semester_hours",
      "teacher_id",
      "small_group_id",
      "lab_group_id",
    ],
  };
  const fields = catalogSchema[resource].filter((f) =>
    summaryFields[resource]
      ? summaryFields[resource].includes(f.key)
      : !["password", "breaks", "weights"].includes(f.type || ""),
  );
  const query = search.trim().toLocaleLowerCase();
  const scopedRows = mode === "semester" ? catalogScope(resource, data[resource] || [], selectedTerm) : data[resource] || [];
  const rows = scopedRows.filter((row) =>
    [...Object.values(row), ...fields.map((field) => display(field, row)).filter((value) => typeof value === "string")]
      .join(" ").toLocaleLowerCase().includes(query),
  );
  const pageSize = 25;
  const lastPage = Math.max(0, Math.ceil(rows.length / pageSize) - 1);
  const currentPage = Math.min(page, lastPage);
  useEffect(() => setPage((value) => Math.min(value, lastPage)), [lastPage]);
  const pagination = <ListPagination page={currentPage} pageSize={pageSize} total={rows.length} onChange={(next) => {
    setPage(next);
    results.current?.focus({ preventScroll: true });
    results.current?.scrollIntoView({ block: "start" });
  }} />;
  function selectResource(name: string, focusResults = false) {
    setResource(name);
    setDraft(null);
    setSearch("");
    setPage(0);
    setError(null);
    if (focusResults) requestAnimationFrame(() => {
        results.current?.focus({ preventScroll: true });
        results.current?.scrollIntoView({ block: "start" });
      });
  }
  return (
    <>
      <div className="page-heading page-hero">
        <div className="page-hero-copy">
          <p className="eyebrow">{t("catalogEyebrow")}</p>
          <h1>{t(mode)}</h1>
          <p>{t(mode === "university" ? "universityHelp" : "semesterHelp")}</p>
        </div>
        <button
          disabled={busy}
          onClick={() => void run(refresh)}
          className="secondary"
        >
          <RefreshCw size={16} aria-hidden="true" />{t("refresh")}
        </button>
      </div>
      {mode === "semester" && <section className="panel semester-context">
        <label>{t("term_id")}<select value={termId} disabled={loading || busy} onChange={event => { setTermId(event.target.value); setSearch(""); setPage(0); }}>
          <option value="">{t("select")}</option>{(data.terms || []).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select></label>
        <p>{t(data.terms?.length ? "semesterScopeBrief" : "semesterFirst")}</p>
        {onCreateDraft && <button disabled={busy || loading || !selectedTerm} onClick={() => onCreateDraft(termId)}><Plus size={16} aria-hidden="true" />{t("createDraft")}</button>}
      </section>}
      <div className="admin-management">
        <div className="admin-area-tabs" role="tablist" aria-label={t(mode)} onKeyDown={event => {
          const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          if (index < 0) return;
          const next = event.key === "ArrowRight" ? (index + 1) % buttons.length : event.key === "ArrowLeft" ? (index + buttons.length - 1) % buttons.length : event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : -1;
          if (next >= 0) { event.preventDefault(); buttons[next].click(); buttons[next].focus(); }
        }}>
          {areas.map(item => <button key={item.id} id={`${mode}-${item.id}`} role="tab" aria-selected={area.id === item.id} aria-controls={`${mode}-records`} tabIndex={area.id === item.id ? 0 : -1}
            className={area.id === item.id ? "active" : "secondary"} disabled={busy} onClick={() => selectResource(item.resources[0])}>{t(`adminArea_${item.id}`)}</button>)}
        </div>
        <section id={`${mode}-records`} role="tabpanel" aria-labelledby={`${mode}-${area.id}`} className="panel catalog-content results-anchor" ref={results} tabIndex={-1}>
          <p className="admin-area-help">{t(`adminAreaHelp_${area.id}`)}</p>
          {area.resources.length > 1 && <div className="admin-resource-tabs" role="group" aria-label={t("catalogResource")}>
            {area.resources.map(name => { const Icon = resourceIcons[name] || Database; return <button key={name} className="secondary" aria-pressed={resource === name} disabled={busy} onClick={() => selectResource(name)}><Icon size={16} aria-hidden="true" />{t(name)}</button>; })}
          </div>}
          {mode === "semester" && <p className="admin-scope-note">{t(resource === "calendars" ? "sharedCalendarsHelp" : resource === "availability" ? "sharedAvailabilityHelp" : resource === "terms" ? "semesterRecordsHelp" : "selectedSemesterOnly")}</p>}
          <div className="section-heading">
            <h2 className="catalog-resource-heading"><ResourceIcon size={21} aria-hidden="true" />{t(resource)}</h2>
            <button onClick={() => open()} disabled={busy}>
              <Plus size={16} aria-hidden="true" />{t("add")}
            </button>
          </div>
          <div className="toolbar">
            <label className="toolbar-field">
              {t("search")}
              <span className="search-field">
                <Search size={16} aria-hidden="true" />
                <input
                  type="search"
                  placeholder={t("search")}
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                />
              </span>
            </label>
            {search && <button className="secondary search-clear" onClick={() => setSearch("")}><X size={16} aria-hidden="true" />{t("catalogClearSearch")}</button>}
            {data[resource] && <span className="count-label" role="status">{t("catalogResults")}: {rows.length} / {scopedRows.length}</span>}
          </div>
          {!draft && <ErrorBox error={error} />}
          {draft && (
            <Dialog labelledBy="catalog-editor-title" className="catalog-editor-modal" closeDisabled={busy} onClose={() => setDraft(null)}>
            <h2 id="catalog-editor-title">{t(editing ? "edit" : "add")} · {t(resource)}{editing ? ` · #${editing}` : ""}</h2>
            <form onSubmit={save} className="catalog-editor" aria-busy={busy}>
              <ErrorBox error={error} />
              {resource === "calendars" && (
                <p className="notice">{t("unavailableCalendar")}</p>
              )}
              <div className="form-grid">
                {catalogSchema[resource].filter((field) => !field.visibleWhen || draft[field.visibleWhen.key] === field.visibleWhen.value).map((field) => (
                  <FieldInput
                    key={field.key}
                    field={field}
                    value={draft[field.key]}
                    data={data}
                    draft={draft}
                    onChange={(v) =>
                      setDraft({
                        ...draft,
                        [field.key]: v,
                        ...(field.key === "role" ? {
                          ...(v !== "dean" ? { faculty_id: null } : {}),
                          ...(v !== "student" ? { course_group_id: null, small_group_id: null, lab_group_id: null } : {}),
                        } : {}),
                        ...(field.key === "course_group_id" &&
                        "small_group_id" in draft
                          ? { small_group_id: null, lab_group_id: null }
                          : field.key === "small_group_id" &&
                              "lab_group_id" in draft
                            ? { lab_group_id: null }
                            : {}),
                      })
                    }
                  />
                ))}
              </div>
              {slots.length > 0 && (
                <div className="slot-preview">
                  {slots.map((s) => (
                    <span key={s.slot}>
                      {s.slot} · {s.starts_at}–{s.ends_at}
                    </span>
                  ))}
                </div>
              )}
              <div className="actions">
                <button disabled={busy}><Save size={16} aria-hidden="true" />{t("save")}</button>
                <button
                  className="secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => setDraft(null)}
                >
                  {t("cancel")}
                </button>
              </div>
            </form>
            </Dialog>
          )}
          {(busy || loading) && <LoadingState compact={rows.length > 0} />}
          <div>
          {pagination}
          {rows.length > 0 && <div className="table-scroll" aria-busy={busy || loading} tabIndex={0} role="region" aria-label={t(resource)}>
            <table>
              <thead>
                <tr>
                  {fields.map((f) => (
                    <th key={f.key}>{t(f.key)}</th>
                  ))}
                  <th>{t("edit")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map((row) => (
                  <tr key={row.id}>
                    {fields.map((f) => (
                      <td key={f.key}>{display(f, row)}</td>
                    ))}
                    <td>
                      <div className="inline">
                        <button className="secondary" disabled={busy} onClick={() => open(row)}>
                          <Pencil size={16} aria-hidden="true" />{t("edit")}
                        </button>
                        {resource !== "users" && (
                          <button
                            className="danger-text"
                            disabled={busy}
                            onClick={() => {
                              if (confirm(t("confirmDelete")))
                                void run(async () => {
                                  await api(
                                    `/admin/catalog/${resource}/${row.id}`,
                                    "DELETE",
                                  );
                                  await refresh();
                                });
                            }}
                          >
                            <Trash2 size={16} aria-hidden="true" />{t("delete")}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
          {pagination}
          {!rows.length && !busy && !loading && !error && (
            <EmptyState icon={search ? Search : Database} title={t(search ? "catalogSearchEmptyTitle" : "catalogEmptyTitle")} description={t(search ? "catalogSearchEmptyHelp" : "catalogEmptyHelp")}>
              {search ? (
                <button className="secondary" onClick={() => setSearch("")}><X size={16} aria-hidden="true" />{t("catalogClearSearch")}</button>
              ) : !draft ? (
                <button onClick={() => open()}><Plus size={16} aria-hidden="true" />{t("add")}</button>
              ) : null}
            </EmptyState>
          )}
          </div>
        </section>
      </div>
    </>
  );
}
