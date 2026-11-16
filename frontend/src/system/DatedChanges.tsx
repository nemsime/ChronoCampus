import { useEffect, useState } from "react";
import { api, Row } from "./api";
import { dateLabel, ErrorBox, useAction } from "./common";
import { suggestionStatusKey } from "./Suggestions";
import { useLanguage } from "./i18n";

export function useDatedChangesEnabled() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => { let active = true; void api<{enabled: boolean}>("/schedule/change-features").then(r => { if (active) setEnabled(r.enabled); }).catch(() => {}); return () => { active = false; }; }, []);
  return enabled;
}

export function LecturerRequestForm({ lesson, slots, onSaved }: { lesson: Row; slots: Row[]; onSaved(): void }) {
  const { t } = useLanguage();
  const enabled = useDatedChangesEnabled();
  const { busy, error, run } = useAction();
  const [sent, setSent] = useState(false);
  if (!enabled) return null;
  return <details><summary>{t("requestOneTimeMove")}</summary><p>{t("lecturerRequestHelp")}</p>
    <ErrorBox error={error} />{sent && <p role="status">{t("requestSent")}</p>}
    <form className="form-stack" onSubmit={event => {
      event.preventDefault(); const form = event.currentTarget; const f = new FormData(form);
      void run(async () => { await api("/lecturer/change-requests", "POST", { version_id: lesson.version_id, occurrence_id: lesson.occurrence_id, proposed_day: f.get("day"), proposed_slot: Number(f.get("slot")), reason: f.get("reason") }); setSent(true); form.reset(); onSaved(); });
    }}><label>{t("replacementDay")}<input type="date" name="day" required /></label>
      <label>{t("slot")}<select name="slot" defaultValue={lesson.slot}>{(slots.length ? slots : [{slot: lesson.slot}]).map(s => <option key={s.slot} value={s.slot}>{s.slot * 2 - 1}–{s.slot * 2}</option>)}</select></label>
      <label>{t("changeReason")}<textarea name="reason" required minLength={1} maxLength={500} /></label>
      <button disabled={busy || sent}>{t("submitChangeRequest")}</button>
    </form></details>;
}

export function LecturerRequests({ reload }: { reload: number }) {
  const { t, lang } = useLanguage();
  const enabled = useDatedChangesEnabled();
  const [rows, setRows] = useState<Row[]>([]);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true; setError(null);
    void api<Row[]>(`/lecturer/change-requests?offset=${offset}`).then(r => { if(active) setRows(r); }).catch(e => { if(active) setError(e); });
    return () => { active = false; };
  }, [enabled, reload, offset]);
  if (!enabled) return null;
  return <section className="panel"><h2>{t("myChangeRequests")}</h2><ErrorBox error={error}/>
    <p>{t("lecturerRequestHelp")}</p>
    {!rows.length && !error && <p>{t("noChangeRequests")}</p>}
    {rows.map(row => <article key={row.id}><h3>{row.title}</h3><p>{dateLabel(row.anchor.day, lang)} → {dateLabel(row.proposed_day, lang)} · {t("slot")} {row.proposed_slot}</p><p>{t(suggestionStatusKey(row.status))}{row.outdated && ` · ${t("request_outdated")}`}</p>{row.decision_note && <p>{row.decision_note}</p>}{row.comments.map((c: Row) => <p key={c.id}>{c.author}: {c.content}</p>)}</article>)}
    <div className="actions"><button className="secondary" disabled={!offset} onClick={() => setOffset(Math.max(0,offset-50))}>{t("requestPrevious")}</button><button className="secondary" disabled={rows.length<50} onClick={() => setOffset(offset+50)}>{t("requestNext")}</button></div>
  </section>;
}

export function AdminDatedChanges({ version, groups, disabled, onChanged, onEdit }: { version: Row; groups: Row[]; disabled: boolean; onChanged(): Promise<void>; onEdit(row: Row): void }) {
  const { t, lang } = useLanguage();
  const enabled = useDatedChangesEnabled();
  const [state, setState] = useState<Row | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [loadError, setLoadError] = useState<unknown>(null);
  const { busy, error, run } = useAction();
  useEffect(() => { setSelected(version.cohort_ids); }, [version.id]);
  useEffect(() => {
    if (!enabled) return;
    let active = true; setState(null); setLoadError(null);
    void api<Row>(`/admin/schedule/versions/${version.id}/changes`).then(r => { if(active) setState(r); }).catch(e => { if(active) setLoadError(e); });
    return () => { active = false; };
  }, [enabled, version.id, version.revision]);
  if (!enabled) return <p>{t("datedChangesUnavailable")}</p>;
  return <section className="panel"><h2>{t("datedChanges")}</h2><ErrorBox error={error}/><ErrorBox error={loadError}/>
    {version.status === "draft" && <details><summary>{t("addTeachingClosure")}</summary><p>{t("closureHelp")}</p>
      <form className="form-stack" onSubmit={event => {
        event.preventDefault(); const f=new FormData(event.currentTarget);
        void run(async () => { await api(`/admin/schedule/versions/${version.id}/closures`, "POST", {revision: version.revision, starts_on:f.get("start"), ends_on:f.get("end"), cohort_ids:selected, reason:f.get("reason")}); await onChanged(); });
      }}><fieldset disabled={disabled || busy}><legend>{t("affectedGroups")}</legend>{groups.filter(g=>version.cohort_ids.includes(g.id)).map(g=><label className="check" key={g.id}><input type="checkbox" checked={selected.includes(g.id)} onChange={e=>setSelected(ids=>e.target.checked?[...ids,g.id]:ids.filter(id=>id!==g.id))}/>{g.group_code}</label>)}
        <label>{t("starts_on")}<input type="date" name="start" required /></label><label>{t("ends_on")}<input type="date" name="end" required /></label><label>{t("changeReason")}<textarea name="reason" maxLength={500} required /></label><button disabled={!selected.length}>{t("addTeachingClosure")}</button>
      </fieldset></form></details>}
    {(state?.events || []).map((e: Row)=><p key={e.id}>{dateLabel(e.starts_on,lang)}–{dateLabel(e.ends_on,lang)} · {e.reason}</p>)}
    {(state?.overrides || []).filter((o: Row)=>o.unresolved).map((o: Row)=><div className="notice warning" key={o.occurrence_id}><p>{t("makeup_required")} · {dateLabel(o.original.day,lang)} · {t("slot")} {o.original.slot} · {o.reason}</p>{version.status==="draft" && <button disabled={disabled || busy} onClick={()=>onEdit(o)}>{t("placeMakeupLesson")}</button>}</div>)}
    {!!state?.events.length && version.status === "draft" && <p>{t("datedChangesManualHelp")}</p>}
  </section>;
}
