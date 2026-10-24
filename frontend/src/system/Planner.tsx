import { useEffect, useRef, useState } from "react";
import { CalendarDays, CircleStop, Play, Plus, RefreshCw, Upload } from "lucide-react";
import { api, Row } from "./api";
import { CatalogData, loadCatalogs, rowLabel } from "./Catalogs";
import { Dialog, EmptyState, ErrorBox, LoadingState, SectionLinks, useAction } from "./common";
import { useLanguage } from "./i18n";
import { LessonList } from "./Schedule";
import { isRunActive, RunCard, RunHistory } from "./Diagnostics";
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
  const launchIntent = useRef<{ parameters: string; key: string } | null>(null);
  const selection = useRef<number | null>(null);
  const loadSequence = useRef(0);
  const [pollError, setPollError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const { busy, error, run } = useAction();
  const refresh = async () => {
    setLoading(true);
    try {
    const [catalogs, rows] = await Promise.all([
      loadCatalogs(),
      api<Row[]>("/admin/schedule/versions"),
    ]);
    setData(catalogs);
    setVersions(rows);
    } finally { setLoading(false); }
  };
  const open = async (id: number) => {
    selection.current = id;
    const ticket = ++loadSequence.current;
    const response = await api(`/admin/schedule/versions/${id}`);
    if (selection.current !== id || loadSequence.current !== ticket) return;
    setDetail(response);
    setRunInfo(response.last_run);
    setPollError(null);
  };
  useEffect(() => {
    void run(refresh);
    return () => {
      selection.current = null;
      ++loadSequence.current;
    };
  }, []);
  useEffect(() => {
    if (!runInfo || !isRunActive(runInfo)) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const ticket = loadSequence.current;
      try {
        const result = await api<Row>(`/admin/schedule/runs/${runInfo.id}`);
        if (cancelled || selection.current !== result.version_id || loadSequence.current !== ticket) return;
        setPollError(null);
        if (isRunActive(result)) {
          setRunInfo(result);
        } else {
          // Keep polling until the completed draft itself has loaded successfully.
          await open(result.version_id);
          if (!cancelled) await refresh();
        }
      } catch (e) {
        if (!cancelled) {
          setPollError(e);
          timer = setTimeout(poll, 3000);
        }
      }
    };
    timer = setTimeout(poll, 1500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [runInfo]);
  const version = detail?.version;
  const searching = !!runInfo && isRunActive(runInfo);
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
          <h1>{t("planner")}</h1>
          <p>{t("unpublished")}</p>
        </div>
        <button onClick={() => setCreate(true)}><Plus size={16} aria-hidden="true" />{t("createDraft")}</button>
      </div>
      <ol className="planner-steps">
        <li>{t("plannerStepDraft")}</li>
        <li>{t("plannerStepGenerate")}</li>
        <li>{t("plannerStepReview")}</li>
      </ol>
      <ErrorBox error={error} />
      <ErrorBox error={pollError} />
      {!!pollError && <p className="notice warning">{t("staleData")}</p>}
      {detail && <SectionLinks items={[
        { id: "planner-controls", label: t("plannerControls") },
        { id: "planner-report", label: t("plannerReport") },
        { id: "planner-lessons", label: t("schedule") },
        { id: "planner-history", label: t("runHistory") },
      ]} />}
      <section className="panel">
        <div className="toolbar">
          <label className="toolbar-field">
            {t("plannerVersion")}
            <select
              disabled={busy}
              value={version?.id || ""}
              onChange={(e) => {
                selection.current = e.target.value
                  ? Number(e.target.value)
                  : null;
                ++loadSequence.current;
                launchIntent.current = null;
                setRunInfo(null);
                setDetail(null);
                setPollError(null);
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
          </label>
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
            <RefreshCw size={16} aria-hidden="true" />{t("refresh")}
          </button>
        </div>
        {(busy || loading) && <LoadingState compact={!!detail} />}
        {!detail && !busy && !loading && !error && (
          <EmptyState icon={CalendarDays} title={t("plannerSelectTitle")} description={t("plannerSelectHelp")}>
            <button onClick={() => setCreate(true)}><Plus size={16} aria-hidden="true" />{t("createDraft")}</button>
          </EmptyState>
        )}
        {detail && (
          <>
            <section id="planner-controls" className="section-target" tabIndex={-1} aria-label={t("plannerControls")}>
            <div className="section-heading">
              <div>
                <p className="eyebrow">{t("plannerVersion")} · #{version.id}</p>
                <h2>{version.name}</h2>
              </div>
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
                    onChange={(e) => {
                      launchIntent.current = null;
                      setAlgorithm(e.target.value);
                    }}
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
                    onChange={(e) => {
                      launchIntent.current = null;
                      setSeed(Number(e.target.value));
                    }}
                  />
                </label>
                <button
                  disabled={busy || searching}
                  onClick={() =>
                    void run(async () => {
                      const parameters = JSON.stringify([version.id, version.revision, seed, algorithm]);
                      if (launchIntent.current?.parameters !== parameters) {
                        launchIntent.current = { parameters, key: crypto.randomUUID() };
                      }
                      const intent = launchIntent.current;
                      const ticket = loadSequence.current;
                      const result = await api(
                        `/admin/schedule/versions/${version.id}/generate`,
                        "POST",
                        { revision: version.revision, seed, algorithm, idempotency_key: intent.key },
                      );
                      if (!result.id) throw new Error(t("runResponseMissing"));
                      if (launchIntent.current === intent) launchIntent.current = null;
                      if (selection.current === version.id && loadSequence.current === ticket) {
                        setRunInfo(result);
                        setPollError(null);
                      }
                    })
                  }
                >
                  <Play size={16} aria-hidden="true" />{t("generate")}
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
                  <Upload size={16} aria-hidden="true" />{t("publish")}
                </button>
              </div>
            )}
            {runInfo && <RunCard run={runInfo} />}
            {searching && (
              <button
                className="secondary"
                disabled={busy || !!runInfo?.job?.cancel_requested_at}
                onClick={() => void run(async () => {
                  const ticket = loadSequence.current;
                  const result = await api<Row>(`/admin/schedule/runs/${runInfo!.id}/cancel`, "POST");
                  if (selection.current !== result.version_id || loadSequence.current !== ticket) return;
                  setRunInfo(result);
                  setPollError(null);
                  if (!isRunActive(result)) {
                    await open(result.version_id);
                    await refresh();
                  }
                })}
              >
                <CircleStop size={16} aria-hidden="true" />{t(runInfo?.job?.cancel_requested_at ? "cancellationPending" : "cancelRun")}
              </button>
            )}
            <div
              className={`notice ${detail.report.complete ? "success" : "warning"}`}
            >
              {t(detail.report.complete ? "complete" : "partial")}
            </div>
            <ErrorBox error={detail.report.issues} />
            </section>
            <section id="planner-report" className="section-target" tabIndex={-1} aria-label={t("plannerReport")}>
            <details className="report" open={!detail.report.complete}>
              <summary>
                {t("workloads")} · {detail.report.hours.length}
              </summary>
              <div className="table-scroll bounded-table" tabIndex={0} role="region" aria-label={t("plannerReport")}>
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
                <div className="unplaced" tabIndex={0} role="region" aria-label={t("partial")}>
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
            </section>
            <section id="planner-lessons" className="section-target" tabIndex={-1} aria-label={t("schedule")}>
            <h2 className="section-title">{t("schedule")}</h2>
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
            </section>
            <section id="planner-history" className="section-target" tabIndex={-1} aria-label={t("runHistory")}>
            <RunHistory key={version.id} versionId={version.id} />
            </section>
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
