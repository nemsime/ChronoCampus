import { FormEvent, useEffect, useId, useState } from "react";
import { ArrowUpRight, Check, Lightbulb, MessageSquare, RefreshCw, Send, X } from "lucide-react";
import { api, Row } from "./api";
import { dateLabel, Dialog, EmptyState, ErrorBox, ListPagination, LoadingState, timestampLabel, useAction } from "./common";
import { useLanguage } from "./i18n";
import type { GridConfiguration } from "./WeekGrid";

export interface ReviewVersion {
  id: number; name: string; status: string; term: string; term_id: number; revision: number;
  cohort_ids: number[]; starts_on: string; ends_on: string;
  summary: { complete: boolean; required_hours: number; remaining_hours: number; unresolved: number };
}
export interface ReviewFacets {
  filters: Record<string, { id: string | number; label: string }[]>;
  date_bounds: { start: string | null; end: string | null };
  grid: Record<string, GridConfiguration>;
}
export const suggestionStatuses = ["open", "accepted", "rejected", "implemented", "withdrawn"] as const;
export const suggestionStatusKey = (status: string) => `suggestion${status.charAt(0).toUpperCase()}${status.slice(1)}`;
export function suggestionsChanged() { window.dispatchEvent(new Event("suggestions-updated")); }

export function SuggestionForm({ version, lesson, facets, onSaved, onCancel }: {
  version: ReviewVersion; lesson?: Row | null; facets: ReviewFacets;
  onSaved: () => void; onCancel: () => void;
}) {
  const { t } = useLanguage();
  const id = useId();
  const [kind, setKind] = useState(lesson ? "move" : "other");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [day, setDay] = useState(lesson?.day || version.starts_on);
  const [slot, setSlot] = useState(String(lesson?.slot || ""));
  const [room, setRoom] = useState("");
  const [group, setGroup] = useState(String(lesson?.course_group_id || ""));
  const { busy, error, run } = useAction();
  const grid = facets.grid?.[String(version.term_id)];
  const roomless = lesson?.lesson_type === "pe";
  function submit(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      await api("/dean/suggestions", "POST", {
        version_id: version.id, kind, title: title.trim(), body: body.trim(),
        ...(kind !== "other" && lesson ? { occurrence_id: lesson.occurrence_id } : {}),
        ...(kind === "other" && group ? { course_group_id: Number(group) } : {}),
        ...(kind === "move" ? { proposed_day: day, proposed_slot: Number(slot) } : {}),
        ...((kind === "move" || kind === "room") && room ? { proposed_room_id: Number(room) } : {}),
      });
      suggestionsChanged();
      onSaved();
    });
  }
  return <form className="suggestion-form" onSubmit={submit} aria-busy={busy}>
    <p>{t("suggestionIntro")}</p>
    <ErrorBox error={error} />
    <fieldset disabled={busy}>
      <label htmlFor={`${id}-kind`}>{t("suggestionKind")}<select id={`${id}-kind`} value={kind} onChange={event => setKind(event.target.value)}>
        {(lesson ? ["move", ...(roomless ? [] : ["room"]), "cancel", "other"] : ["other"]).map(value => <option value={value} key={value}>{t(`suggestionKind_${value}`)}</option>)}
      </select></label>
      {kind === "other" && <label htmlFor={`${id}-group`}>{t("course_group_id")}<select id={`${id}-group`} value={group} onChange={event => setGroup(event.target.value)}>
        <option value="">{t("all")}</option>{(facets.filters.course_group_id || []).map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
      </select></label>}
      {kind === "move" && <div className="form-grid">
        <label htmlFor={`${id}-day`}>{t("proposedDay")}<input id={`${id}-day`} type="date" required min={version.starts_on} max={version.ends_on} value={day} onChange={event => setDay(event.target.value)} /></label>
        <label htmlFor={`${id}-slot`}>{t("proposedSlot")}<select id={`${id}-slot`} required value={slot} onChange={event => setSlot(event.target.value)}>
          <option value="">{t("select")}</option>{(grid?.slots || []).map(value => <option key={value.slot} value={value.slot}>{value.slot} · {value.starts_at.slice(0, 5)}–{value.ends_at.slice(0, 5)}</option>)}
        </select></label>
      </div>}
      {!roomless && (kind === "move" || kind === "room") && <label htmlFor={`${id}-room`}>{t("proposedRoom")}<select id={`${id}-room`} required={kind === "room"} value={room} onChange={event => setRoom(event.target.value)}>
        <option value="">{t(kind === "room" ? "select" : "keepRoom")}</option>{(facets.filters.room_id || []).map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
      </select></label>}
      <label htmlFor={`${id}-title`}>{t("suggestionTitle")}<input id={`${id}-title`} required maxLength={150} value={title} onChange={event => setTitle(event.target.value)} /><small className="field-counter">{title.length}/150</small></label>
      <label htmlFor={`${id}-body`}>{t("suggestionBody")}<textarea id={`${id}-body`} required maxLength={5000} rows={5} value={body} onChange={event => setBody(event.target.value)} /><small className="field-counter">{body.length}/5000</small></label>
      <div className="actions"><button disabled={busy || !title.trim() || !body.trim()}><Send size={16} aria-hidden="true" />{t("suggestionSend")}</button><button type="button" className="secondary" onClick={onCancel}>{t("cancel")}</button></div>
    </fieldset>
  </form>;
}

interface SuggestionPage { items: Row[]; total: number; counts: Record<string, number> }

function SuggestionDetail({ id, mode, versions, onClose, onChanged, onNavigate }: {
  id: number; mode: "dean" | "admin"; versions: ReviewVersion[];
  onClose: () => void; onChanged: () => void; onNavigate?: (page: string, versionId?: number) => void;
}) {
  const { t, lang } = useLanguage();
  const admin = mode === "admin";
  const prefix = admin ? "/admin/suggestions" : "/dean/suggestions";
  const [detail, setDetail] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [reload, setReload] = useState(0);
  const [comment, setComment] = useState("");
  const [note, setNote] = useState("");
  const [target, setTarget] = useState("");
  const [implementedVersion, setImplementedVersion] = useState("");
  const [check, setCheck] = useState<Row | null>(null);
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useAction();
  const source = versions.find(version => version.id === detail?.version_id);
  const relatedVersions = versions.filter(version => !source || version.term_id === source.term_id);
  const drafts = relatedVersions.filter(version => version.status === "draft");
  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    void api<Row>(`${prefix}/${id}`).then(value => {
      if (!active) return;
      setDetail(value);
      setNote(value.decision_note || "");
    }).catch(failure => { if (active) setLoadError(failure); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, prefix, reload]);
  useEffect(() => { setCheck(null); }, [target]);
  const mutate = (path: string, method: string, body?: Row) => void run(async () => {
    await api(`${prefix}/${id}/${path}`, method, body);
    setComment(""); setCheck(null); setSaved(true);
    setReload(value => value + 1);
    onChanged(); suggestionsChanged();
  });
  return <Dialog labelledBy="suggestion-detail-title" className="suggestion-detail-modal" closeDisabled={busy} onClose={onClose}>
    <h2 id="suggestion-detail-title">{t("suggestionDetails")} · #{id}</h2>
    <ErrorBox error={loadError} /><ErrorBox error={error} />
    {saved && <p className="notice success" role="status">{t("suggestionSaved")}</p>}
    {loading && <LoadingState />}
    <button className="secondary" disabled={busy || loading} onClick={() => { setSaved(false); setReload(value => value + 1); }}>{t("refresh")}</button>
    {detail && !loading && <>
      <div className="suggestion-meta"><SuggestionStatus status={detail.status} /><span>{t(`suggestionKind_${detail.kind}`)}</span><span>{detail.author}</span><time dateTime={detail.created_at}>{timestampLabel(detail.created_at, lang, true)}</time></div>
      <h3>{detail.title}</h3><p className="suggestion-text">{detail.body}</p>
      {detail.outdated && <p className="notice warning">{t("outdatedSuggestion")}</p>}
      <dl className="suggestion-facts">
        <div><dt>{t("reviewVersion")}</dt><dd>{detail.version_name || `#${detail.version_id}`}</dd></div>
        {detail.lesson && <div><dt>{t("schedule")}</dt><dd>{detail.lesson.subject} · {detail.lesson.group} · {detail.lesson.day} · {t("slot")} {detail.lesson.slot}{detail.lesson.room && ` · ${detail.lesson.room}`}</dd></div>}
        {detail.anchor?.day && <div><dt>{t("suggestionOriginalLesson")}</dt><dd>{dateLabel(detail.anchor.day, lang)} · {t("slot")} {detail.anchor.slot}{detail.anchor.room_id != null && ` · ${t("room_id")} #${detail.anchor.room_id}`}</dd></div>}
        {detail.proposed_day && <div><dt>{t("proposedDay")}</dt><dd>{dateLabel(detail.proposed_day, lang)}</dd></div>}
        {detail.proposed_slot && <div><dt>{t("proposedSlot")}</dt><dd>{detail.proposed_slot}</dd></div>}
        {detail.proposed_room_id && <div><dt>{t("proposedRoom")}</dt><dd>#{detail.proposed_room_id}</dd></div>}
        {detail.decision_note && <div><dt>{t("suggestionDecisionNote")}</dt><dd className="suggestion-text">{detail.decision_note}</dd></div>}
        {detail.implemented_in_version_id && <div><dt>{t("suggestionImplementedVersion")}</dt><dd>{versions.find(version => version.id === detail.implemented_in_version_id)?.name || `#${detail.implemented_in_version_id}`}</dd></div>}
      </dl>
      {admin && <section className="suggestion-admin-actions">
        {(detail.kind === "move" || detail.kind === "room") && <div className="suggestion-check">
          <h3>{t("checkFeasibility")}</h3><p>{t("feasibilityReadOnly")}</p>
          <label htmlFor="suggestion-check-version">{t("feasibilityVersion")}<select id="suggestion-check-version" value={target} disabled={busy} onChange={event => setTarget(event.target.value)}><option value="">{t("select")}</option>{drafts.map(version => <option key={version.id} value={version.id}>{version.name} · {version.term} · {t("revision")} {version.revision}</option>)}</select></label>
          <button className="secondary" disabled={busy || !target} onClick={() => void run(async () => setCheck(await api(`${prefix}/${id}/check?version_id=${target}`)))}>{t("checkFeasibility")}</button>
          {check && <div role="status" className={`notice ${check.feasible ? "success" : "warning"}`}><p>{t(check.feasible ? "feasibilityPassed" : "feasibilityFailed")}</p>{(check.issues || []).map((issue: Row, index: number) => <p key={index}>{t(issue.code)}</p>)}</div>}
        </div>}
        {(detail.status === "open" || detail.status === "accepted") && <>
          <label htmlFor="suggestion-decision-note">{t("suggestionDecisionNote")}<textarea id="suggestion-decision-note" value={note} maxLength={1000} rows={3} disabled={busy} onChange={event => setNote(event.target.value)} /></label>
          <div className="actions">{detail.status === "open" && <button disabled={busy} onClick={() => mutate("decision", "PUT", { status: "accepted", note: note.trim() || null, expected_status: detail.status })}><Check size={16} aria-hidden="true" />{t("suggestionAccept")}</button>}<button className="danger-text" disabled={busy || !note.trim()} onClick={() => mutate("decision", "PUT", { status: "rejected", note: note.trim(), expected_status: detail.status })}><X size={16} aria-hidden="true" />{t("suggestionReject")}</button></div>
        </>}
        {detail.status === "accepted" && detail.author_role === "lecturer" && <div className="actions"><button disabled={busy || !target || !drafts.some(v => String(v.id) === target)} onClick={() => void run(async () => { const draft = drafts.find(v => String(v.id) === target)!; await api(`/admin/schedule/versions/${draft.id}/requested-moves/${detail.id}`, "POST", { revision: draft.revision }); setSaved(true); onChanged(); })}>{t("applyRequestToDraft")}</button><p>{t("requestPublishHelp")}</p></div>}
        {detail.status === "accepted" && detail.author_role !== "lecturer" && <div className="suggestion-implementation">
          <label htmlFor="suggestion-implemented-version">{t("suggestionImplementedVersion")}<select id="suggestion-implemented-version" value={implementedVersion} disabled={busy} onChange={event => setImplementedVersion(event.target.value)}><option value="">{t("select")}</option>{relatedVersions.map(version => <option key={version.id} value={version.id}>{version.name} · {t(version.status)}</option>)}</select></label>
          <button disabled={busy || !implementedVersion} onClick={() => mutate("implemented", "POST", { version_id: Number(implementedVersion), expected_status: detail.status })}>{t("suggestionMarkImplemented")}</button>
        </div>}
        <button className="secondary" disabled={busy} onClick={() => { onClose(); onNavigate?.("planner", Number(target || detail.version_id)); }}>{t("suggestionOpenPlanner")}<ArrowUpRight size={16} aria-hidden="true" /></button>
      </section>}
      {!admin && detail.status === "open" && <button className="secondary" disabled={busy} onClick={() => mutate("withdraw", "POST", { expected_status: detail.status })}>{t("suggestionWithdraw")}</button>}
      <section className="suggestion-thread"><h3><MessageSquare size={18} aria-hidden="true" />{t("suggestionComments")}</h3>
        {detail.comments?.length ? <ol>{detail.comments.map((entry: Row) => <li key={entry.id}><header><strong>{entry.author}</strong><time dateTime={entry.created_at}>{timestampLabel(entry.created_at, lang, true)}</time></header><p className="suggestion-text">{entry.content}</p></li>)}</ol> : <p>{t("suggestionNoComments")}</p>}
        {detail.status !== "withdrawn" && <form onSubmit={event => { event.preventDefault(); mutate("comments", "POST", { content: comment.trim() }); }}>
          <label htmlFor="suggestion-comment">{t("suggestionComment")}<textarea id="suggestion-comment" required maxLength={5000} value={comment} rows={3} disabled={busy} onChange={event => setComment(event.target.value)} /><small className="field-counter">{comment.length}/5000</small></label>
          <button disabled={busy || !comment.trim()}>{t("suggestionAddComment")}</button>
        </form>}
      </section>
    </>}
  </Dialog>;
}

export function SuggestionStatus({ status }: { status: string }) {
  const { t } = useLanguage();
  return <span className={`badge suggestion-status-${status}`}>{t(suggestionStatusKey(status))}</span>;
}

export function Suggestions({ mode, onNavigate }: { mode: "dean" | "admin"; onNavigate?: (page: string, versionId?: number) => void }) {
  const { t, lang } = useLanguage();
  const admin = mode === "admin";
  const [data, setData] = useState<SuggestionPage | null>(null);
  const [versions, setVersions] = useState<ReviewVersion[]>([]);
  const [authors, setAuthors] = useState<Row[]>([]);
  const [groups, setGroups] = useState<Row[]>([]);
  const [filters, setFilters] = useState({ status: "", version_id: "", author_id: "", course_group_id: "" });
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const pageSize = 25;
  useEffect(() => {
    let active = true;
    void Promise.all([
      api<ReviewVersion[]>("/dean/versions"),
      ...(admin ? [api<Row[]>("/admin/catalog/users"), api<Row[]>("/admin/catalog/groups")] : []),
    ]).then(([nextVersions, users, nextGroups]) => {
      if (!active) return;
      setVersions(nextVersions as ReviewVersion[]);
      setAuthors((users || []).filter(user => user.role === "dean")); setGroups(nextGroups || []);
    }).catch(failure => { if (active) setError(failure); });
    return () => { active = false; };
  }, [admin, reload]);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(null); setData(null);
    const params = new URLSearchParams({ limit: String(pageSize), offset: String(page * pageSize) });
    Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
    void api<SuggestionPage>(`${admin ? "/admin" : "/dean"}/suggestions?${params}`).then(next => { if (active) setData(next); }).catch(failure => { if (active) setError(failure); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [admin, filters, page, reload]);
  function filter(key: keyof typeof filters, value: string) { setFilters(current => ({ ...current, [key]: value })); setPage(0); }
  const pagination = data && <ListPagination page={page} pageSize={pageSize} total={data.total} onChange={setPage} />;
  return <>
    <div className="page-heading page-hero"><div className="page-hero-copy"><p className="eyebrow">{t(admin ? "navigationAdmin" : "navigationMain")}</p><h1>{t("suggestions")}</h1><p>{t(admin ? "suggestionInboxIntro" : "suggestionIntro")}</p></div><button className="secondary" disabled={loading} onClick={() => setReload(value => value + 1)}><RefreshCw size={16} aria-hidden="true" />{t("refresh")}</button></div>
    <ErrorBox error={error} />
    <section className="panel suggestion-inbox" aria-busy={loading}>
      {data && <div className="suggestion-counts">{suggestionStatuses.map(status => <button className={`secondary${filters.status === status ? " selected" : ""}`} aria-pressed={filters.status === status} key={status} onClick={() => filter("status", filters.status === status ? "" : status)}>{t(suggestionStatusKey(status))}<span>{data.counts?.[status] || 0}</span></button>)}</div>}
      <div className="filters">
        <label>{t("suggestionStatus")}<select value={filters.status} onChange={event => filter("status", event.target.value)}><option value="">{t("all")}</option>{suggestionStatuses.map(status => <option key={status} value={status}>{t(suggestionStatusKey(status))}</option>)}</select></label>
        <label>{t("reviewVersion")}<select value={filters.version_id} onChange={event => filter("version_id", event.target.value)}><option value="">{t("all")}</option>{versions.map(version => <option key={version.id} value={version.id}>{version.name} · {t(version.status)}</option>)}</select></label>
        {admin && <><label>{t("suggestionAuthor")}<select value={filters.author_id} onChange={event => filter("author_id", event.target.value)}><option value="">{t("all")}</option>{authors.map(author => <option key={author.id} value={author.id}>{author.display_name}</option>)}</select></label><label>{t("course_group_id")}<select value={filters.course_group_id} onChange={event => filter("course_group_id", event.target.value)}><option value="">{t("all")}</option>{groups.map(group => <option key={group.id} value={group.id}>{group.group_code}</option>)}</select></label></>}
      </div>
      {pagination}
      {loading && <LoadingState />}
      {data?.items.length ? <div className="table-scroll" role="region" aria-label={t("suggestions")} tabIndex={0}><table><caption className="sr-only">{t("suggestions")}</caption><thead><tr><th scope="col">#</th>{admin && <th scope="col">{t("suggestionAuthor")}</th>}<th scope="col">{t("suggestionTitle")}</th><th scope="col">{t("reviewVersion")}</th><th scope="col">{t("suggestionStatus")}</th><th scope="col">{t("suggestionDetails")}</th></tr></thead><tbody>{data.items.map(item => <tr key={item.id}><td>{item.id}</td>{admin && <td>{item.author}</td>}<td><strong>{item.title}</strong><small className="suggestion-table-meta">{t(`suggestionKind_${item.kind}`)} · {timestampLabel(item.created_at, lang)}</small>{item.outdated && <span className="badge warn">{t("outdatedSuggestion")}</span>}</td><td>{item.version_name || `#${item.version_id}`}</td><td><SuggestionStatus status={item.status} /></td><td><button className="secondary" onClick={() => setSelected(item.id)} aria-label={`${t("suggestionDetails")} #${item.id}`}>{t("suggestionDetails")}</button></td></tr>)}</tbody></table></div> : !loading && !error && <EmptyState icon={Lightbulb} title={t("suggestionEmpty")} description={t("suggestionEmptyHelp")}>{!admin && <button className="secondary" onClick={() => onNavigate?.("timetables")}>{t("openTimetables")}</button>}</EmptyState>}
      {pagination}
    </section>
    {selected !== null && <SuggestionDetail key={selected} id={selected} mode={mode} versions={versions} onClose={() => setSelected(null)} onChanged={() => setReload(value => value + 1)} onNavigate={onNavigate} />}
  </>;
}
