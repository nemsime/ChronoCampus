import { useEffect, useState } from "react";
import { api, Row } from "./api";
import { CatalogData, loadCatalogs, rowLabel } from "./Catalogs";
import { Dialog, ErrorBox, useAction } from "./common";
import { useLanguage } from "./i18n";
import { LessonList } from "./Schedule";
export function Planner() {
  const { t } = useLanguage();
  const [data, setData] = useState<CatalogData>({});
  const [versions, setVersions] = useState<Row[]>([]);
  const [detail, setDetail] = useState<Row | null>(null);
  const [create, setCreate] = useState(false);
  const [groups, setGroups] = useState<number[]>([]);
  const [term, setTerm] = useState("");
  const [runInfo, setRunInfo] = useState<Row | null>(null);
  const [algorithm, setAlgorithm] = useState("cp_sat");
  const [seed, setSeed] = useState(1);
  const [editing, setEditing] = useState<Row | null>(null);
  const [slotOptions, setSlotOptions] = useState<Row[]>([]);
  const { busy, error, run } = useAction();
  const refresh = async () => {
    const [catalogs, rows] = await Promise.all([
      loadCatalogs(),
      api<Row[]>("/admin/schedule/versions"),
    ]);
    setData(catalogs);
    setVersions(rows);
  };
  const open = async (id: number) => {
    const response = await api(`/admin/schedule/versions/${id}`);
    setDetail(response);
    setRunInfo(response.last_run);
  };
  useEffect(() => {
    void run(refresh);
  }, []);
  useEffect(() => {
    if (!runInfo || !["queued", "running"].includes(runInfo.status)) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void api<Row>(`/admin/schedule/runs/${runInfo.id}`)
        .then(async (r) => {
          if (cancelled) return;
          setRunInfo(r);
          if (!["queued", "running"].includes(r.status)) {
            await open(r.version_id);
            await refresh();
          }
        })
        .catch((e) => {
          if (!cancelled)
            void run(async () => {
              throw e;
            });
        });
    }, 1500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [runInfo]);
  const version = detail?.version;
  const searching = !!runInfo && ["queued", "running"].includes(runInfo.status);
  async function edit(row: Row) {
    setEditing(row);
    const calendar = version.configuration.calendar;
    setSlotOptions(await api(`/admin/calendar/${calendar.id}/slots?count=12`));
  }
  const groupOptions = (data.groups || []).filter((g) => {
    const selectedTerm = (data.terms || []).find((r) => String(r.id) === term);
    const calendar = (data.calendars || []).find(
      (c) => c.id === selectedTerm?.calendar_id,
    );
    const major = (data.majors || []).find((m) => m.id === g.major_id);
    return !calendar || calendar.study_form === major?.study_form;
  });
  const workloadLabel = (id: number) => {
    const c = (detail?.workloads || []).find((row: Row) => row.id === id);
    return c
      ? `${rowLabel((data.subjects || []).find((r) => r.id === c.subject_id) || { id: c.subject_id })} · ${t(c.lesson_type)} · ${rowLabel((data.groups || []).find((r) => r.id === c.course_group_id) || { id: c.course_group_id })}${c.small_group_id ? ` / ${c.small_group_id}` : ""}${c.lab_group_id ? ` / ${c.lab_group_id}` : ""}`
      : `#${id}`;
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">CHRONOCAMPUS / PLANNING</p>
          <h1>{t("planner")}</h1>
          <p>{t("unpublished")}</p>
        </div>
        <button onClick={() => setCreate(true)}>{t("createDraft")}</button>
      </div>
      <ErrorBox error={error} />
      <section className="panel">
        <div className="toolbar">
          <select
            aria-label={t("draft")}
            value={version?.id || ""}
            onChange={(e) => {
              setRunInfo(null);
              if (e.target.value) void run(() => open(Number(e.target.value)));
              else setDetail(null);
            }}
          >
            <option value="">{t("select")}</option>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} · {t(v.status)} · #{v.id}
              </option>
            ))}
          </select>
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await refresh();
                if (version) await open(version.id);
              })
            }
          >
            {t("refresh")}
          </button>
        </div>
        {detail && (
          <>
            <div className="toolbar">
              <h2>{version.name}</h2>
              <span
                className={`badge ${detail.report.complete ? "success" : "warn"}`}
              >
                {t(version.status)}
              </span>
            </div>
            {version.status === "draft" && (
              <div className="generation-controls">
                <label>
                  {t("algorithm")}
                  <select
                    value={algorithm}
                    onChange={(e) => setAlgorithm(e.target.value)}
                  >
                    <option value="cp_sat">{t("cp_sat")}</option>
                    <option value="greedy_local">{t("greedy_local")}</option>
                  </select>
                </label>
                <label>
                  {t("seed")}
                  <input
                    type="number"
                    min={0}
                    max={2147483647}
                    value={seed}
                    onChange={(e) => setSeed(Number(e.target.value))}
                  />
                </label>
                <button
                  disabled={busy || searching}
                  onClick={() =>
                    void run(async () =>
                      setRunInfo(
                        await api(
                          `/admin/schedule/versions/${version.id}/generate`,
                          "POST",
                          { revision: version.revision, seed, algorithm },
                        ),
                      ),
                    )
                  }
                >
                  {t("generate")}
                </button>
                <button
                  className="secondary"
                  disabled={busy || searching || !detail.report.complete}
                  onClick={() => {
                    if (confirm(t("publishConfirm")))
                      void run(async () => {
                        await api(
                          `/admin/schedule/versions/${version.id}/publish`,
                          "POST",
                          { revision: version.revision },
                        );
                        await open(version.id);
                        await refresh();
                      });
                  }}
                >
                  {t("publish")}
                </button>
              </div>
            )}
            {runInfo && (
              <p className="notice" role="status">
                {t(runInfo.status)}
                {runInfo.result?.elapsed_seconds
                  ? ` · ${Number(runInfo.result.elapsed_seconds).toFixed(1)} s`
                  : ""}
              </p>
            )}
            <div
              className={`notice ${detail.report.complete ? "success" : "warning"}`}
            >
              {t(detail.report.complete ? "complete" : "partial")}
            </div>
            <ErrorBox error={detail.report.issues} />
            <details className="report" open={!detail.report.complete}>
              <summary>
                {t("workloads")} · {detail.report.hours.length}
              </summary>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{t("subject_id")}</th>
                      {[
                        "required_hours",
                        "planned_hours",
                        "cancelled_hours",
                        "remaining_hours",
                      ].map((k) => (
                        <th key={k}>{t(k)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.report.hours.map((row: Row) => (
                      <tr key={row.component_id}>
                        <td>{workloadLabel(row.component_id)}</td>
                        {[
                          "required_hours",
                          "planned_hours",
                          "cancelled_hours",
                          "remaining_hours",
                        ].map((k) => (
                          <td
                            className={
                              k === "remaining_hours" && row[k] ? "deficit" : ""
                            }
                            key={k}
                          >
                            {row[k]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {detail.report.unplaced_occurrences.length > 0 && (
                <div className="unplaced">
                  {detail.report.unplaced_occurrences.map((id: number) => {
                    const occurrence = detail.occurrences.find(
                      (o: Row) => o.id === id,
                    );
                    const diagnostics =
                      runInfo?.result?.diagnostics?.[id] || [];
                    return (
                      <div key={id}>
                        <span>
                          {workloadLabel(occurrence?.component_id)} · #{id}
                        </span>
                        <small>
                          {diagnostics.map((d: Row) => t(d.code)).join(" · ")}
                        </small>
                        {version.status === "draft" && (
                          <button
                            disabled={busy || searching}
                            className="secondary"
                            onClick={() =>
                              void run(() =>
                                edit({
                                  occurrence_id: id,
                                  day: "",
                                  slot: 1,
                                  room_id: "",
                                  pinned: false,
                                  subject: workloadLabel(
                                    occurrence?.component_id,
                                  ),
                                }),
                              )
                            }
                          >
                            {t("edit")}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </details>
            <LessonList
              rows={detail.assignments}
              action={
                version.status === "draft"
                  ? (row) => (
                      <button
                        disabled={busy || searching}
                        className="secondary"
                        onClick={() => void run(() => edit(row))}
                      >
                        {t("edit")}
                      </button>
                    )
                  : undefined
              }
            />
          </>
        )}
      </section>
      {create && (
        <Dialog labelledBy="draft-title" onClose={() => setCreate(false)}>
          <h2 id="draft-title">{t("createDraft")}</h2>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(async () => {
                const row = await api("/admin/schedule/versions", "POST", {
                  term_id: Number(term),
                  name: f.get("name"),
                  cohort_ids: groups,
                });
                await refresh();
                await open(row.id);
                setCreate(false);
                setRunInfo(null);
              });
            }}
          >
            <label>
              {t("name")}
              <input name="name" required maxLength={150} autoFocus />
            </label>
            <label>
              {t("term_id")}
              <select
                required
                value={term}
                onChange={(e) => {
                  setTerm(e.target.value);
                  setGroups([]);
                }}
              >
                <option value="">{t("select")}</option>
                {(data.terms || []).map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
            <fieldset>
              <legend>{t("groups")}</legend>
              {groupOptions.map((row) => (
                <label className="check" key={row.id}>
                  <input
                    type="checkbox"
                    checked={groups.includes(row.id)}
                    onChange={(e) =>
                      setGroups(
                        e.target.checked
                          ? [...groups, row.id]
                          : groups.filter((id) => id !== row.id),
                      )
                    }
                  />
                  {rowLabel(row)}
                </label>
              ))}
            </fieldset>
            <ErrorBox error={error} />
            <div className="actions">
              <button disabled={busy || !groups.length}>
                {t("createDraft")}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => setCreate(false)}
              >
                {t("cancel")}
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {editing && (
        <Dialog labelledBy="move-title" onClose={() => setEditing(null)}>
          <h2 id="move-title">{t("edit")}</h2>
          <p>{editing.subject}</p>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await api(
                  `/admin/schedule/versions/${version.id}/assignments/${editing.occurrence_id}`,
                  "PUT",
                  {
                    revision: version.revision,
                    day: editing.day,
                    slot: Number(editing.slot),
                    room_id: Number(editing.room_id),
                    pinned: editing.pinned,
                  },
                );
                await open(version.id);
                setEditing(null);
              });
            }}
          >
            <label>
              {t("day")}
              <input
                type="date"
                required
                value={editing.day}
                onChange={(e) =>
                  setEditing({ ...editing, day: e.target.value })
                }
              />
            </label>
            <label>
              {t("slot")}
              <select
                value={editing.slot}
                onChange={(e) =>
                  setEditing({ ...editing, slot: Number(e.target.value) })
                }
              >
                {slotOptions.map((s) => (
                  <option key={s.slot} value={s.slot}>
                    {s.slot} · {s.starts_at}–{s.ends_at}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("room_id")}
              <select
                required
                value={editing.room_id}
                onChange={(e) =>
                  setEditing({ ...editing, room_id: Number(e.target.value) })
                }
              >
                <option value="">{t("select")}</option>
                {(data.rooms || []).map((r) => (
                  <option value={r.id} key={r.id}>
                    {r.room_number} · {t(r.room_type)} · {r.capacity}
                  </option>
                ))}
              </select>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={editing.pinned}
                onChange={(e) =>
                  setEditing({ ...editing, pinned: e.target.checked })
                }
              />
              {t("pin")}
            </label>
            <ErrorBox error={error} />
            <div className="actions">
              <button disabled={busy}>{t("save")}</button>
              <button
                type="button"
                className="secondary"
                onClick={() => setEditing(null)}
              >
                {t("cancel")}
              </button>
            </div>
          </form>
          {detail?.assignments.some(
            (a: Row) => a.occurrence_id === editing.occurrence_id,
          ) && (
            <details className="emergency">
              <summary>{t("emergency")}</summary>
              <p>{t("emergencyHelp")}</p>
              <form
                className="form-stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void run(async () => {
                    await api(
                      `/admin/schedule/versions/${version.id}/assignments/${editing.occurrence_id}/emergency`,
                      "POST",
                      { revision: version.revision, reason: f.get("reason") },
                    );
                    await open(version.id);
                    setEditing(null);
                  });
                }}
              >
                <label>
                  {t("reason")}
                  <input name="reason" required maxLength={500} />
                </label>
                <button
                  className="danger-text"
                  disabled={busy || editing.pinned || editing.cancelled}
                >
                  {t("emergency")}
                </button>
              </form>
            </details>
          )}
        </Dialog>
      )}
    </>
  );
}
