import { useEffect, useRef, useState } from "react";
import { AlertCircle, CalendarDays, CheckCircle2, CircleStop, Play, Plus, RefreshCw, Upload } from "lucide-react";
import { api, Row } from "./api";
import { CatalogData, loadCatalogs, rowLabel } from "./Catalogs";
import { addDays, Dialog, EmptyState, ErrorBox, LoadingState, localDay, useAction, weekStart } from "./common";
import { useLanguage } from "./i18n";
import { LessonList } from "./Schedule";
import { isRunActive, runStatusKey, RunCard, RunHistory } from "./Diagnostics";
import { DraftWizard } from "./DraftWizard";
import { GridConfiguration, ScheduleViewToggle, useScheduleView, WeekGrid, WeekSelector } from "./WeekGrid";
export function Planner({ initialVersionId = null, createOnOpen = false, initialTermId = "", onOpenSetup }: {
  initialVersionId?: number | null; createOnOpen?: boolean; initialTermId?: string; onOpenSetup?: () => void;
} = {}) {
  const { t } = useLanguage();
  const [data, setData] = useState<CatalogData>({});
  const [versions, setVersions] = useState<Row[]>([]);
  const [detail, setDetail] = useState<Row | null>(null);
  const [create, setCreate] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const [runInfo, setRunInfo] = useState<Row | null>(null);
  const [algorithm, setAlgorithm] = useState("cp_sat");
  const [seed, setSeed] = useState(1);
  const [editing, setEditing] = useState<Row | null>(null);
  const [inspecting, setInspecting] = useState<Row | null>(null);
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
    if (selection.current !== id) setShowIssues(false);
    selection.current = id;
    const ticket = ++loadSequence.current;
    const response = await api(`/admin/schedule/versions/${id}`);
    if (selection.current !== id || loadSequence.current !== ticket) return;
    setDetail(response);
    setRunInfo(response.last_run);
    setPollError(null);
  };
  useEffect(() => {
    void run(async () => {
      await refresh();
      if (initialVersionId !== null) await open(initialVersionId);
      if (createOnOpen) setCreate(true);
    });
    return () => {
      selection.current = null;
      ++loadSequence.current;
    };
  }, [initialVersionId, createOnOpen]);
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
  const workloadLabel = (id: number) => {
    const c = (detail?.workloads || []).find((row: Row) => row.id === id);
    return c
      ? `${rowLabel((data.subjects || []).find((r) => r.id === c.subject_id) || { id: c.subject_id })} · ${t(c.lesson_type)} · ${rowLabel((data.groups || []).find((r) => r.id === c.course_group_id) || { id: c.course_group_id })}${c.small_group_id ? ` / ${c.small_group_id}` : ""}${c.lab_group_id ? ` / ${c.lab_group_id}` : ""}`
      : `#${id}`;
  };
  const published = version?.status === "published";
  const complete = !!detail?.report.complete;
  const requiredHours = detail?.report.hours.reduce((total: number, row: Row) => total + row.required_hours, 0) || 0;
  const remainingHours = detail?.report.hours.reduce((total: number, row: Row) => total + row.remaining_hours, 0) || 0;
  return (
    <div className={`planner-workspace${detail ? " has-draft" : ""}`}>
      <div className="page-heading page-hero">
        <div className="page-hero-copy">
          <p className="eyebrow">{t("plannerEyebrow")}</p>
          <h1>{t("planner")}</h1>
          <p>{t("unpublished")}</p>
        </div>
        <button disabled={busy} onClick={() => setCreate(true)}><Plus size={16} aria-hidden="true" />{t("createDraft")}</button>
      </div>
      <ErrorBox error={error} />
      <ErrorBox error={pollError} />
      {!!pollError && <p className="notice warning">{t("staleData")}</p>}
      {detail && <section className="panel planner-result-summary" aria-label={t("draftResult")}>
        <div className="planner-result-heading"><div><h2>{version.name}</h2><p>{data.terms?.find(row => row.id === version.term_id)?.name || version.configuration?.term?.name} · {(version.cohort_ids || []).map((id: number) => rowLabel(data.groups?.find(row => row.id === id) || { id })).join(", ")}</p></div><span className={`badge ${published || complete ? "success" : "warn"}`}>{t(published ? "published" : searching ? "running" : complete ? "readyToPublish" : "needsReview")}</span></div>
        <dl className="planner-result-counts"><div><dt>{t("placedLessons")}</dt><dd>{detail.assignments.length} / {detail.occurrences.length}</dd></div><div><dt>{t("semester_hours")}</dt><dd>{requiredHours}</dd></div><div><dt>{t("remaining_hours")}</dt><dd>{remainingHours}</dd></div></dl>
        <div className="planner-result-actions"><button className="secondary" onClick={() => { setShowIssues(true); requestAnimationFrame(() => { const target = document.getElementById("planner-report"); target?.focus({ preventScroll: true }); target?.scrollIntoView({ block: "start" }); }); }}><AlertCircle size={16} aria-hidden="true" />{t("reviewIssues")}</button>
          {version.status === "draft" && (                <button
                  className="planner-publish"
                  disabled={busy || searching || !!pollError || !detail.report.complete}
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
                </button>)}
          {onOpenSetup && <button className="link" onClick={onOpenSetup}>{t("reviewSemesterSetup")}</button>}
        </div>
      </section>}
      <section className="panel planner-panel">
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
                setShowIssues(false);
                setDetail(null);
                setPollError(null);
                if (e.target.value) void run(() => open(Number(e.target.value)));
                else setDetail(null);
              }}
            >
              <option value="">{t("select")}</option>
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} · {t(v.status)} · {t("revision")} {v.revision}
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
            {runInfo && <div className="planner-progress">
              <div role="status"><strong>{t(runInfo.job?.cancel_requested_at ? "cancellationPending" : runStatusKey(runInfo.status))}</strong>{searching && <span> · {t(runInfo.progress?.stage || "snapshotPending")}</span>}</div>
              {runInfo.inputs_updated_since_enqueue && <p className="notice warning">{t("inputsUpdatedSinceEnqueue")}</p>}
              <ErrorBox error={runInfo.result?.error || runInfo.job?.error_code} />
              <details><summary>{t("generationDetails")}</summary><RunCard run={runInfo} /></details>
            </div>}
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
        {detail && (
          <>
            <section id="planner-lessons" className="section-target" tabIndex={-1} aria-label={t("schedule")}>
            <h2 className="section-title">{t("schedule")}</h2>
            <PlannerTimetable key={version.id} detail={detail} disabled={busy || searching}
              onSelect={(row) => {
                if (version.status === "draft") {
                  if (!busy && !searching) void run(() => edit(row));
                } else setInspecting(row);
              }} />
            </section>
            <section id="planner-controls" className="section-target" tabIndex={-1} aria-label={t("plannerControls")}>
            <div className="section-heading planner-version-heading">
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
              <details className="planner-advanced"><summary>{t("advancedGeneration")}</summary><div className="generation-controls">
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

              </div></details>
            )}
            </section>
            <section id="planner-report" className="section-target" tabIndex={-1} aria-label={t("plannerReport")}>
            <details className="report" open={showIssues} onToggle={event => setShowIssues(event.currentTarget.open)}>
              <summary>
                {t("reviewIssues")} · {t("workloads")} {detail.report.hours.length}
              </summary>
            <div
              className={`notice planner-readiness ${detail.report.complete ? "success" : "warning"}`}
            >
              {detail.report.complete ? <CheckCircle2 size={19} aria-hidden="true" /> : <AlertCircle size={19} aria-hidden="true" />}
              {t(detail.report.complete ? "complete" : "partial")}
            </div>
            <ErrorBox error={detail.report.issues} />

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
            <section id="planner-history" className="section-target" tabIndex={-1} aria-label={t("runHistory")}>
            <details><summary>{t("runHistory")}</summary><RunHistory key={version.id} versionId={version.id} /></details>
            </section>
          </>
        )}
      </section>
      {inspecting && <Dialog labelledBy="planner-lesson-title" onClose={() => setInspecting(null)}>
        <h2 id="planner-lesson-title">{t("lessonDetails")}</h2>
        <h3>{inspecting.subject}</h3>
        <p>{inspecting.day} · {String(inspecting.starts_at).slice(0, 5)}–{String(inspecting.ends_at).slice(0, 5)} · {t(inspecting.lesson_type)}</p>
        <p>{inspecting.teacher} · {inspecting.group} · {t("room_id")} {inspecting.room}</p>
        {inspecting.cancelled && <p className="notice warning">{t("cancelled")}</p>}
      </Dialog>}
      {create && !loading && <DraftWizard data={data} initialTermId={initialTermId} onOpenSetup={onOpenSetup}
        onClose={() => { setCreate(false); void run(refresh); }}
        onCreated={row => setVersions(current => [row, ...current.filter(item => item.id !== row.id)])}
        onOpenVersion={id => { setCreate(false); void run(async () => { await open(id); await refresh(); }); }}
        onStarted={(row, result) => {
          selection.current = row.id; ++loadSequence.current; launchIntent.current = null;
          setShowIssues(false); setDetail(null); setRunInfo(result); setPollError(null); setCreate(false);
          void run(() => open(row.id));
        }} />}
      {editing && (
        <Dialog labelledBy="move-title" closeDisabled={busy} onClose={() => setEditing(null)}>
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
                setEditing(null);
                await open(version.id);
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
                disabled={busy}
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
                    setEditing(null);
                    await open(version.id);
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
    </div>
  );
}

function PlannerTimetable({ detail, disabled, onSelect }: { detail: Row; disabled: boolean; onSelect: (row: Row) => void }) {
  const { t } = useLanguage();
  const assignments: Row[] = detail.assignments;
  const dates = assignments.map((row) => row.day as string).sort();
  const startsOn = detail.version.configuration?.term?.starts_on || dates[0] || localDay();
  const endsOn = detail.version.configuration?.term?.ends_on || dates[dates.length - 1] || startsOn;
  const [monday, setMonday] = useState(() => {
    const today = localDay();
    return weekStart(today < startsOn ? startsOn : today > endsOn ? endsOn : today);
  });
  const [view, setView] = useScheduleView();
  const [perspective, setPerspective] = useState<"group" | "lecturer" | "room">("group");
  const [filter, setFilter] = useState("");
  const field = perspective === "group" ? "course_group_id" : perspective === "lecturer" ? "teacher_id" : "room_id";
  const label = perspective === "group" ? "group" : perspective === "lecturer" ? "teacher" : "room";
  const choices = Array.from(new Map(assignments.map((row) => [String(row[field]), row[label]])).entries());
  const rows = assignments.filter((row) => row.day >= monday && row.day <= addDays(monday, 6) && (!filter || String(row[field]) === filter));
  // The server computes the frozen version's calendar, including empty slots.
  const grid: GridConfiguration | undefined = detail.grid?.slots ? detail.grid : detail.grid?.[String(detail.version.term_id)];
  const issueIds = new Set<number>((detail.report?.issues || []).flatMap((issue: Row) => [
    ...(Array.isArray(issue.occurrence_ids) ? issue.occurrence_ids : []),
    ...(issue.occurrence_id ? [issue.occurrence_id] : []),
  ]));
  return <div className="planner-timetable">
    <div className="schedule-week-toolbar">
      <WeekSelector weekStart={monday} onChange={setMonday} min={startsOn} max={endsOn} />
      <ScheduleViewToggle value={view} onChange={setView} />
    </div>
    <div className="filters timetable-perspective-controls">
      <label>{t("viewBy")}<select value={perspective} onChange={(event) => {
        setPerspective(event.target.value as typeof perspective); setFilter("");
      }}>
        <option value="group">{t("course_group_id")}</option>
        <option value="lecturer">{t("teacher_id")}</option>
        <option value="room">{t("room_id")}</option>
      </select></label>
      <label>{t(field)}<select value={filter} onChange={(event) => setFilter(event.target.value)}>
        <option value="">{t("all")}</option>
        {choices.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select></label>
    </div>
    {grid && <div className={view === "grid" ? "schedule-grid-content" : "schedule-grid-content schedule-grid-print"}>
      <WeekGrid weekStart={monday} lessons={rows} grid={grid} perspective={perspective} onSelect={onSelect} disabled={disabled}
        decorations={(row) => ({ badges: issueIds.has(row.occurrence_id)
          ? <span className="badge warn"><AlertCircle size={12} aria-hidden="true" />{t("needsReview")}</span> : undefined })} />
    </div>}
    {(view === "list" || !grid) && <div className="schedule-list-content"><LessonList rows={rows} action={(row) =>
      <button type="button" className="secondary" disabled={disabled} onClick={() => onSelect(row)}>
        {t(detail.version.status === "draft" ? "edit" : "lessonDetails")}
      </button>} /></div>}
    {view === "grid" && grid && !rows.length && <EmptyState icon={CalendarDays} title={t("noLessonsTitle")} description={t("noLessonsHelp")} />}
  </div>;
}
