import { useEffect, useId, useState } from "react";
import { ArrowLeft, ArrowRight, Bell, CalendarDays, CheckCheck, MapPin } from "lucide-react";
import { Account, api, Row } from "./api";
import { dateLabel, Dialog, ErrorBox } from "./common";
import { useLanguage } from "./i18n";

export function notificationKey(row: Row) {
  return [row.version_id, row.occurrence_id, row.day, row.slot, row.room_id, row.reason].join(":");
}
export function publishedChanges(semesters: Row[]): Row[] {
  return semesters.flatMap(s => s.exceptions.filter((r: Row) => !r.unresolved).map((r: Row) => ({ ...r, term: s.term, version_id: s.version_id })))
    .sort((a,b) => b.day.localeCompare(a.day) || b.version_id-a.version_id || a.occurrence_id-b.occurrence_id);
}

export function ChangeDrawer({ rows, onClose, read = [], onRead, onReadAll, error, loading = false }: { rows: Row[]; onClose(): void; read?: string[]; onRead?(row: Row): void; onReadAll?(): void; error?: unknown; loading?: boolean }) {
  const { t, lang } = useLanguage();
  const heading = useId();
  const [selected, setSelected] = useState<Row | null>(null);
  return <Dialog labelledBy={heading} className="notification-drawer" onClose={onClose}>
    <header className="notification-heading"><span className="eyebrow">{t("semesterTimetable")}</span><h2 id={heading}>{selected ? t("lessonDetails") : t("timetableNotifications")}</h2><p>{t("notificationHelp")}</p></header>
    <ErrorBox error={error}/>{loading && <p role="status">{t("scheduleLoading")}</p>}
    {selected ? <>
      <button type="button" className="link notification-back" onClick={() => setSelected(null)}><ArrowLeft size={15}/>{t("allTimetableChanges")}</button>
      <div className="notification-detail"><span className="notification-kind">{t(`template_${selected.reason}`)}</span><h3>{selected.subject}</h3><p>{selected.teacher && `${selected.teacher} · `}{t(selected.lesson_type)}</p><p>{selected.group}{selected.small_group && ` · ${t("small_group_id")} ${selected.small_group}`}{selected.lab_group && ` · ${t("lab_group_id")} ${selected.lab_group}`}</p>
        <div className="notification-placement"><CalendarDays size={18} aria-hidden="true"/><div><small>{t(selected.cancelled || selected.unresolved ? "day" : "replacementDay")}</small><strong>{dateLabel(selected.day,lang)}</strong><span>{t("pair")} {selected.slot*2-1}–{selected.slot*2}{selected.starts_at && ` · ${String(selected.starts_at).slice(0,5)}–${String(selected.ends_at).slice(0,5)}`}</span></div></div>
        {selected.room && <div className="notification-placement"><MapPin size={18} aria-hidden="true"/><div><small>{t("room_id")}</small><strong>{selected.room}</strong></div></div>}
        {selected.original?.day && <div className="notification-original"><small>{t("template_original")}</small><p>{dateLabel(selected.original.day,lang)} · {t("pair")} {selected.original.slot*2-1}–{selected.original.slot*2}{selected.original.room && ` · ${t("room_id")} ${selected.original.room}`}</p></div>}
        {selected.change_reason && <div className="notification-reason"><small>{t("changeReason")}</small><p>{selected.change_reason}</p></div>}
        {selected.inferred && <p className="muted">{t("template_inferred")}</p>}
      </div>
    </> : <>
      {!!rows.length && onReadAll && <button className="link notification-read-all" type="button" onClick={onReadAll}><CheckCheck size={16}/>{t("markChangesRead")}</button>}
      {!rows.length && !error && !loading && <div className="notification-empty"><Bell size={28} aria-hidden="true"/><h3>{t("semesterNoChanges")}</h3></div>}
      <div className="notification-items">{rows.map(row => <button type="button" key={notificationKey(row)} className={`notification-item${read.includes(notificationKey(row)) ? " is-read" : ""}`} onClick={() => { setSelected(row); onRead?.(row); }}>
        <span className="notification-dot" aria-hidden="true"/><span className="notification-item-copy"><span className="notification-item-meta"><span>{t(`template_${row.reason}`)}</span><time dateTime={row.day}>{dateLabel(row.day,lang)}</time></span><strong>{row.subject}</strong><span>{row.teacher && `${row.teacher} · `}{t("pair")} {row.slot*2-1}–{row.slot*2}{row.room && ` · ${t("room_id")} ${row.room}`}</span>{row.change_reason && <span className="notification-preview">{row.change_reason}</span>}</span><ArrowRight size={16} aria-hidden="true"/>
      </button>)}</div>
    </>}
  </Dialog>;
}

export function ChangeNotificationBell({ account }: { account: Account }) {
  const { t } = useLanguage();
  const [rows, setRows] = useState<Row[]>([]);
  const [read, setRead] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const storageKey = `chronocampus.change-notifications.v1.${account.id}`;
  useEffect(() => {
    try { const saved = JSON.parse(localStorage.getItem(storageKey) || "[]"); setRead(Array.isArray(saved) ? saved.filter(v => typeof v === "string") : []); } catch { setRead([]); }
  }, [storageKey]);
  useEffect(() => {
    let active = true, inFlight = false;
    async function refresh() {
      if (inFlight) return;
      inFlight = true; if(active) setLoading(true);
      try {
        const response = await api<{semesters: Row[]}>("/schedule/template");
        if(active) { setRows(publishedChanges(response.semesters)); setError(null); }
      } catch(e) { if(active) { setRows([]); setError(e); } }
      finally { inFlight = false; if(active) setLoading(false); }
    }
    setRows([]); void refresh();
    const timer=window.setInterval(() => void refresh(),30000);
    const focus=()=>void refresh();window.addEventListener("focus",focus);
    return () => { active=false; window.clearInterval(timer); window.removeEventListener("focus",focus); };
  }, [account.id, account.role]);
  const mark = (ids: string[]) => setRead(current => {
    const next=Array.from(new Set([...current,...ids])).slice(-3000);
    try { localStorage.setItem(storageKey,JSON.stringify(next)); } catch { /* Optional local read markers. */ }
    return next;
  });
  const unread=rows.filter(row=>!read.includes(notificationKey(row))).length;
  return <>
    <button type="button" className="icon-button notification-bell" aria-label={`${t("timetableNotifications")}${unread ? ` (${unread})` : ""}`} title={t("timetableNotifications")} onClick={()=>setOpen(true)}><Bell size={19} aria-hidden="true"/>{unread>0 && <span className="notification-count">{unread>99 ? "99+" : unread}</span>}</button>
    {open && <><ChangeDrawer rows={rows} read={read} onRead={row=>mark([notificationKey(row)])} onReadAll={()=>mark(rows.map(notificationKey))} error={error} loading={loading} onClose={()=>setOpen(false)}/></>}
  </>;
}
