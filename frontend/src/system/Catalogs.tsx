import { FormEvent, useEffect, useState } from "react";
import { api, Row } from "./api";
import { catalogSchema, Field, resourceNames } from "./catalogSchema";
import { ErrorBox, useAction } from "./common";
import { useLanguage } from "./i18n";
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
  else
    input = (
      <input
        {...props}
        type={f.type || "text"}
        min={f.min}
        max={f.max}
        minLength={f.type === "password" ? 12 : undefined}
        maxLength={f.type === "password" ? 256 : undefined}
        autoComplete={f.type === "password" ? "new-password" : undefined}
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
export function Catalogs() {
  const { t } = useLanguage();
  const [data, setData] = useState<CatalogData>({});
  const [resource, setResource] = useState("terms");
  const [draft, setDraft] = useState<Row | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [slots, setSlots] = useState<Row[]>([]);
  const { busy, error, run } = useAction();
  const refresh = async () => setData(await loadCatalogs());
  useEffect(() => {
    void run(refresh);
  }, []);
  function open(row?: Row) {
    setEditing(row?.id ?? null);
    setDraft(
      Object.fromEntries(
        catalogSchema[resource].map((f) => [
          f.key,
          row?.[f.key] ?? f.initial ?? (f.type === "boolean" ? false : null),
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
      await api(
        `/admin/catalog/${resource}${editing ? `/${editing}` : ""}`,
        editing ? "PUT" : "POST",
        body,
      );
      await refresh();
      setDraft(null);
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
    if (field.type === "boolean") return t(value ? "yes" : "no");
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
  const rows = (data[resource] || []).filter((row) =>
    Object.values(row).join(" ").toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">CHRONOCAMPUS / ADMIN</p>
          <h1>{t("catalogs")}</h1>
          <p>{t("catalogHelp")}</p>
        </div>
        <button
          disabled={busy}
          onClick={() => void run(refresh)}
          className="secondary"
        >
          {t("refresh")}
        </button>
      </div>
      <div className="catalog-layout">
        <nav className="catalog-nav" aria-label={t("catalogs")}>
          {resourceNames.map((name) => (
            <button
              className={name === resource ? "active" : ""}
              key={name}
              onClick={() => {
                setResource(name);
                setDraft(null);
                setSearch("");
              }}
            >
              {t(name)}
              <small>{data[name]?.length ?? "—"}</small>
            </button>
          ))}
        </nav>
        <section className="panel catalog-content">
          <div className="toolbar">
            <h2>{t(resource)}</h2>
            <input
              aria-label={t("search")}
              placeholder={t("search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button onClick={() => open()} disabled={busy}>
              {t("add")}
            </button>
          </div>
          <ErrorBox error={error} />
          {draft && (
            <form onSubmit={save} className="editor">
              <h3>
                {t(editing ? "edit" : "add")} · {t(resource)}
              </h3>
              {resource === "calendars" && (
                <p className="notice">{t("unavailableCalendar")}</p>
              )}
              <div className="form-grid">
                {catalogSchema[resource].map((field) => (
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
                <button disabled={busy}>{t("save")}</button>
                <button
                  className="secondary"
                  type="button"
                  onClick={() => setDraft(null)}
                >
                  {t("cancel")}
                </button>
              </div>
            </form>
          )}
          <div className="table-scroll">
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
                {rows.map((row) => (
                  <tr key={row.id}>
                    {fields.map((f) => (
                      <td key={f.key}>{display(f, row)}</td>
                    ))}
                    <td>
                      <div className="inline">
                        <button className="secondary" onClick={() => open(row)}>
                          {t("edit")}
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
                            {t("delete")}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!rows.length && (
            <p className="empty">{t(busy ? "loading" : "empty")}</p>
          )}
        </section>
      </div>
    </>
  );
}
