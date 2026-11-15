import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Lightbulb, RefreshCw } from "lucide-react";
import { api, Row } from "./api";
import { addDays, dateLabel, Dialog, EmptyState, ErrorBox, LoadingState, localDay, weekStart } from "./common";
import { useLanguage } from "./i18n";
import { LessonList } from "./Schedule";
import { ScheduleViewToggle, useScheduleView, WeekGrid, WeekSelector } from "./WeekGrid";
import { ReviewFacets, ReviewVersion, SuggestionForm } from "./Suggestions";

type Perspective = "group" | "lecturer" | "room";
interface VersionDiff { items: Row[]; total: number; counts: Record<string, number> }
const perspectiveFields = { group: "course_group_id", lecturer: "teacher_id", room: "room_id" };
const changeKeys: Record<string, string> = { added: "changesAdded", removed: "changesRemoved", moved: "changesMoved", room_changed: "changesRoom", cancelled_changed: "changesCancelled" };

export function DeanTimetables() {
  const { t, lang } = useLanguage();
  const [versions, setVersions] = useState<ReviewVersion[]>([]);
  const [versionId, setVersionId] = useState("");
  const [versionLoading, setVersionLoading] = useState(true);
  const [facets, setFacets] = useState<ReviewFacets | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [pending, setPending] = useState<Set<number>>(new Set());
  const [perspective, setPerspective] = useState<Perspective>("group");
  const [filter, setFilter] = useState("");
  const [week, setWeek] = useState(() => weekStart());
  const [view, setView] = useScheduleView();
  const [showChanges, setShowChanges] = useState(false);
  const [diff, setDiff] = useState<VersionDiff | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<unknown>(null);
  const [selected, setSelected] = useState<Row | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [reload, setReload] = useState(0);
  const [sent, setSent] = useState(false);
  const version = versions.find(item => String(item.id) === versionId);
  const field = perspectiveFields[perspective];
  const choices = facets?.filters[field] || [];
  const end = addDays(week, 6);

  useEffect(() => {
    let active = true;
    setVersionLoading(true);
    void api<ReviewVersion[]>("/dean/versions").then(items => {
      if (!active) return;
      setVersions(items);
      setVersionId(current => items.some(item => String(item.id) === current) ? current : String((items.find(item => item.status === "published") || items[0])?.id || ""));
      setError(null);
    }).catch(failure => { if (active) { setVersions([]); setVersionId(""); setError(failure); } }).finally(() => { if (active) setVersionLoading(false); });
    return () => { active = false; };
  }, [reload]);

  useEffect(() => {
    if (!versionId || !version) return;
    let active = true;
    setFacets(null); setRows([]); setSelected(null); setSuggesting(false); setDiff(null); setLoading(true);
    void api<ReviewFacets>(`/dean/versions/${versionId}/facets`).then(next => {
      if (!active) return;
      setFacets(next);
      setFilter(String(next.filters[perspectiveFields[perspective]]?.[0]?.id || ""));
      const today = localDay();
      setWeek(weekStart(today < version.starts_on ? version.starts_on : today > version.ends_on ? version.ends_on : today));
      setError(null);
    }).catch(failure => { if (active) { setError(failure); setLoading(false); } });
    return () => { active = false; };
  }, [versionId, reload]);

  useEffect(() => {
    if (!versionId || !facets) return;
    let active = true;
    setLoading(true); setRows([]); setError(null); setSelected(null);
    async function load() {
      const params = new URLSearchParams({ start: week, end, limit: "500" });
      if (filter) params.set(field, filter);
      const items: Row[] = [];
      for (let page = 0; page < 20; page++) {
        const response = await api<{ items: Row[]; next_cursor: string | null }>(`/dean/versions/${versionId}/schedule?${params}`);
        if (!active) return;
        items.push(...response.items);
        if (!response.next_cursor) {
          setRows(items);
          return;
        }
        params.set("cursor", response.next_cursor);
      }
      throw new Error("reviewPageLimit");
    }
    void load().catch(failure => { if (active) setError(failure); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [versionId, facets, week, end, field, filter, reload]);

  useEffect(() => {
    if (!versionId) return;
    let active = true;
    const load = async () => {
      try {
        const page = await api<{ items: Row[] }>(`/dean/suggestions?version_id=${versionId}&status=open&limit=50`);
        if (active) setPending(new Set(page.items.filter(item => item.status === "open" || item.status === "accepted").map(item => item.occurrence_id)));
      } catch { /* Suggestion badges are supplementary to the authorized timetable. */ }
    };
    setPending(new Set());
    void load();
    window.addEventListener("suggestions-updated", load);
    return () => { active = false; window.removeEventListener("suggestions-updated", load); };
  }, [versionId, reload]);

  useEffect(() => {
    setDiff(null); setDiffError(null);
    if (!showChanges || !versionId) return;
    let active = true;
    setDiffLoading(true);
    async function loadDiff() {
      let result: VersionDiff = { items: [], total: 0, counts: {} };
      for (let offset = 0; offset < 10000; offset += 100) {
        const page = await api<VersionDiff>(`/dean/versions/${versionId}/diff?base=published&limit=100&offset=${offset}`);
        if (!active) return;
        result = { ...page, items: [...result.items, ...page.items] };
        if (result.items.length >= page.total) { setDiff(result); return; }
      }
      throw new Error("reviewPageLimit");
    }
    void loadDiff().catch(failure => { if (active) setDiffError(failure); }).finally(() => { if (active) setDiffLoading(false); });
    return () => { active = false; };
  }, [versionId, showChanges, reload]);

  const changes = useMemo(() => new Map<number, string[]>((diff?.items || []).map(item => [item.occurrence_id, item.changes])), [diff]);
  const displayRows = useMemo(() => {
    if (!showChanges || !diff) return rows;
    const currentIds = new Set(rows.map(row => row.occurrence_id));
    const removed = diff.items.filter(item => item.before && !currentIds.has(item.occurrence_id) && item.before.day >= week && item.before.day <= end && (!filter || String(item.before[field]) === filter) && (item.changes.includes("removed") || (item.after && (item.after.day < week || item.after.day > end || (filter && String(item.after[field]) !== filter))))).map(item => ({ ...item.before, _removed: true }));
    return [...rows, ...removed];
  }, [rows, diff, showChanges, week, end, field, filter]);
  function badges(row: Row) {
    return <>{pending.has(row.occurrence_id) && <span className="badge pending-suggestion"><Lightbulb size={13} aria-hidden="true" />{t("deanOpenSuggestions")}</span>}{showChanges && (changes.get(row.occurrence_id) || []).map(change => <span className={`badge diff-${change}`} key={change}>{t(changeKeys[change] || change)}</span>)}</>;
  }
  return <>
    <div className="page-heading page-hero"><div className="page-hero-copy"><p className="eyebrow">{t("dean")}</p><h1>{t("timetables")}</h1><p>{t("deanIntro")}</p></div><button className="secondary" disabled={loading || versionLoading} onClick={() => setReload(value => value + 1)}><RefreshCw size={16} aria-hidden="true" />{t("refresh")}</button></div>
    <p className="notice" role="note">{t("readOnlyBanner")}</p>
    <ErrorBox error={error} />
    {sent && <p className="notice success" role="status">{t("suggestionSent")}</p>}
    {versionLoading && !versions.length && <LoadingState />}
    {!versionLoading && !error && !versions.length && <section className="panel"><EmptyState icon={CalendarDays} title={t("reviewNoVersions")} description={t("reviewNoVersionsHelp")} /></section>}
    {!!versions.length && <>
      <section className="panel dean-version-controls">
        <label>{t("reviewVersion")}<select value={versionId} onChange={event => { setVersionId(event.target.value); setSent(false); }}>
          {["published", "draft"].map(status => <optgroup key={status} label={t(status === "draft" ? "versionDraft" : "versionPublished")}>{versions.filter(item => item.status === status).map(item => <option key={item.id} value={item.id}>{item.name} · {item.term} · {t("revision")} {item.revision} · {t(item.summary.complete ? "complete" : "reviewIncomplete")}</option>)}</optgroup>)}
        </select></label>
        {version?.status === "draft" && <p className="notice warning" role="note">{t("draftNotVisible")}</p>}
        {version && <dl className="dean-version-summary">{[{ label: "required_hours", value: version.summary.required_hours }, { label: "remaining_hours", value: version.summary.remaining_hours }, { label: "reviewUnresolved", value: version.summary.unresolved }, { label: "complete", value: t(version.summary.complete ? "yes" : "no") }].map(item => <div key={item.label}><dt>{t(item.label)}</dt><dd>{item.value}</dd></div>)}</dl>}
      </section>
      <section className="panel dean-schedule" aria-busy={loading}>
        <div className="dean-schedule-toolbar">
          <div className="inline"><label>{t("reviewPerspective")}<select value={perspective} onChange={event => { const value = event.target.value as Perspective; setPerspective(value); setFilter(String(facets?.filters[perspectiveFields[value]]?.[0]?.id || "")); }}>
            {(["group", "lecturer", "room"] as const).map(value => <option key={value} value={value}>{t(value === "group" ? "reviewGroup" : value === "lecturer" ? "reviewLecturer" : "reviewRoom")}</option>)}
          </select></label><label>{t(field)}<select value={filter} onChange={event => setFilter(event.target.value)}><option value="">{t("all")}</option>{choices.map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}</select></label></div>
          <WeekSelector weekStart={week} onChange={setWeek} min={version?.starts_on} max={version?.ends_on} />
          <ScheduleViewToggle value={view} onChange={setView} />
        </div>
        <div className="dean-comparison-controls"><label className="check"><input type="checkbox" checked={showChanges} onChange={event => setShowChanges(event.target.checked)} />{t("showChanges")}</label><button className="secondary" disabled={!facets} onClick={() => { setSelected(null); setSuggesting(true); setSent(false); }}><Lightbulb size={16} aria-hidden="true" />{t("suggestionGeneral")}</button></div>
        <ErrorBox error={diffError} />
        {diffLoading && <LoadingState compact label={t("changesLoading")} />}
        {showChanges && diff && <div className="diff-legend" role="status">{Object.entries(diff.counts).map(([change, count]) => <span className={`badge diff-${change}`} key={change}>{t(changeKeys[change] || change)}: {count}</span>)}{diff.total === 0 && <p>{t("changesNone")}</p>}</div>}
        {loading && <LoadingState label={t("scheduleLoading")} />}
        {!loading && !error && facets && <>
          {facets.grid?.[String(version?.term_id)] && <div className={`schedule-grid-content${view === "list" ? " schedule-grid-print" : ""}`}><WeekGrid weekStart={week} lessons={displayRows} grid={facets.grid[String(version?.term_id)]} perspective={perspective} parityMode="this-week" decorations={row => ({ badges: badges(row), className: row._removed ? "diff-removed-lesson" : changes.has(row.occurrence_id) ? "diff-changed-lesson" : "" })} onSelect={setSelected} /></div>}
          {(view === "list" || !facets.grid?.[String(version?.term_id)]) && <div className="schedule-list-content"><LessonList serverPage rows={displayRows} action={row => <div className="dean-lesson-actions">{badges(row)}<button className="secondary" onClick={() => setSelected(row)}>{t("suggestionLessonDetails")}</button></div>} /></div>}
        </>}
      </section>
    </>}
    {(selected || suggesting) && version && facets && <Dialog labelledBy="dean-lesson-title" onClose={() => { setSelected(null); setSuggesting(false); }}>
      <h2 id="dean-lesson-title">{t(suggesting ? "suggestChange" : "suggestionLessonDetails")}</h2>
      {selected && <div className="dean-lesson-details"><h3>{selected.subject}</h3><p>{selected.group} · {selected.teacher}</p><p>{dateLabel(selected.day, lang)} · {t("slot")} {selected.slot} · {String(selected.starts_at).slice(0, 5)}–{String(selected.ends_at).slice(0, 5)} · {selected.room}</p><span className={`badge ${selected.lesson_type}`}>{t(selected.lesson_type)}</span>{selected.cancelled && <span className="badge warn">{t("cancelled")}</span>}{badges(selected)}</div>}
      {suggesting ? <SuggestionForm version={version} lesson={selected} facets={facets} onCancel={() => setSuggesting(false)} onSaved={() => { setSelected(null); setSuggesting(false); setSent(true); }} /> : selected && !selected._removed && <button onClick={() => { setSuggesting(true); setSent(false); }}><Lightbulb size={16} aria-hidden="true" />{t("suggestChange")}</button>}
    </Dialog>}
  </>;
}
