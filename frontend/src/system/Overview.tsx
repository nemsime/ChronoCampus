import { useEffect, useState } from "react";
import {
  ArrowRight, ArrowUpRight, BookOpen, Building2, CalendarCheck2, CalendarDays,
  ChevronLeft, ChevronRight, Clock3, Layers3, MapPin, MessageSquare,
  NotebookPen, RefreshCw, UsersRound, type LucideIcon,
} from "lucide-react";
import { Account, api, Row } from "./api";
import { dateLabel, EmptyState, ErrorBox, timestampLabel } from "./common";
import { useLanguage } from "./i18n";

interface OverviewData {
  date: string;
  stats: Record<string, number>;
  week: { day: string; lessons: number }[];
  upcoming: Row[];
  versions: { id: number; name: string; status: string; term: string; report_complete: boolean | null }[];
  activity: { id: number; action: string; resource: string; created_at: string }[];
  support: { new: number; in_progress: number; closed: number };
}

export function localDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function shiftedDay(day: string, amount: number) {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return localDay(date);
}

function Metric({ icon: Icon, label, value, tone }: {
  icon: LucideIcon; label: string; value: number; tone: string;
}) {
  return <article className={`overview-metric tone-${tone}`}>
    <div className="overview-metric-top"><span className="metric-icon"><Icon size={19} aria-hidden="true" /></span><span className="metric-indicator" aria-hidden="true" /></div>
    <strong>{new Intl.NumberFormat().format(value)}</strong>
    <span>{label}</span>
  </article>;
}

export function Overview({ account, onNavigate }: {
  account: Account; onNavigate: (page: string, versionId?: number) => void;
}) {
  const { t, lang } = useLanguage();
  const [day, setDay] = useState(() => localDay());
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [reload, setReload] = useState(0);
  const locale = lang === "hy" ? "hy-AM" : lang;
  const admin = account.role === "admin";
  const current = data?.date === day ? data : null;

  useEffect(() => {
    let live = true;
    let inFlight = false;
    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      setLoading(true);
      try {
        const next = await api<OverviewData>(`/workspace/overview?day=${day}`);
        if (live) { setData(next); setError(null); }
      } catch (failure) {
        if (live) setError(failure);
      } finally {
        inFlight = false;
        if (live) setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 30000);
    const focus = () => void load();
    window.addEventListener("focus", focus);
    return () => { live = false; window.clearInterval(timer); window.removeEventListener("focus", focus); };
  }, [day, reload]);

  const hour = new Date().getHours();
  const greeting = t(hour < 12 ? "greetingMorning" : hour < 18 ? "greetingAfternoon" : "greetingEvening");
  const firstName = account.display_name.trim().split(/\s+/)[0];
  const metrics = admin
    ? [{ key: "today_lessons", label: "overviewToday", icon: CalendarDays, tone: "sage" },
       { key: "published_cohorts", label: "overviewPublished", icon: CalendarCheck2, tone: "blue" },
       { key: "draft_versions", label: "overviewDrafts", icon: Layers3, tone: "sand" },
       { key: "open_requests", label: "overviewRequests", icon: MessageSquare, tone: "rose" }]
    : [{ key: "today_lessons", label: "overviewToday", icon: CalendarDays, tone: "sage" },
       { key: "week_lessons", label: "overviewWeek", icon: BookOpen, tone: "blue" },
       { key: "personal_notes", label: "overviewNotes", icon: NotebookPen, tone: "sand" },
       { key: "open_requests", label: "overviewRequests", icon: MessageSquare, tone: "rose" }];
  const activityLabels: Record<string, string> = {
    "catalog.created": "activityCreated", "catalog.updated": "activityUpdated", "catalog.deleted": "activityDeleted",
    "draft.created": "activityDraft", "schedule.published": "activityPublished", "lesson.changed": "activityLesson",
    "lesson.emergency": "activityEmergency", "generation.requested": "activityGeneration",
    "account.login": "activityAccount", "account.logout": "activityAccount",
    "account.password_changed": "activityAccount", "account.password_reset": "activityAccount",
    "feedback.status_changed": "activitySupport",
  };

  return <div className="overview-page">
    <header className="page-heading overview-heading">
      <div><p className="eyebrow">{t("academicWorkspace")}</p><h1>{greeting}, {firstName}<span className="heading-period">.</span></h1><p>{t("overviewIntro")}</p></div>
      <button className="secondary overview-refresh" disabled={loading} onClick={() => setReload(value => value + 1)}><RefreshCw size={16} className={loading ? "spin" : ""} aria-hidden="true" />{t("refresh")}</button>
    </header>
    <ErrorBox error={error} />
    {!!error && current && <p className="notice warning" role="status">{t("overviewStale")}</p>}
    {!current ? loading ? <div className="overview-skeleton" aria-busy="true" aria-label={t("loading")}>
      <div className="overview-metrics">{[0, 1, 2, 3].map(index => <div className="skeleton-metric" key={index} />)}</div>
      <div className="skeleton-panel" />
    </div> : <section className="panel"><EmptyState icon={CalendarDays} title={t("overviewErrorTitle")} description={t("overviewErrorHelp")}><button onClick={() => setReload(value => value + 1)}>{t("refresh")}</button></EmptyState></section> : <>
      <section className="overview-metrics" aria-label={t("overview")}>
        {metrics.map(metric => <Metric key={metric.key} icon={metric.icon} tone={metric.tone} label={t(metric.label)} value={current.stats[metric.key] ?? 0} />)}
      </section>
      <div className="overview-columns">
        <div className="overview-main-column">
          <section className="panel week-panel">
            <div className="overview-panel-heading"><div><p className="eyebrow">{t("schedule")}</p><h2>{t("overviewSchedule")}</h2></div><div className="week-navigation">
              <button className="icon-button" aria-label={t("previousWeek")} onClick={() => setDay(shiftedDay(day, -7))}><ChevronLeft size={18} /></button>
              <button className="link today-button" onClick={() => setDay(localDay())}>{t("today")}</button>
              <button className="icon-button" aria-label={t("nextWeek")} onClick={() => setDay(shiftedDay(day, 7))}><ChevronRight size={18} /></button>
            </div></div>
            <div className="overview-date-row"><p>{t("overviewScheduleHelp")}</p><label className="date-picker-label"><span className="sr-only">{t("selectedDay")}</span><input type="date" value={day} required onChange={event => { if (event.target.validity.valid && event.target.value) setDay(event.target.value); }} /></label></div>
            <div className="week-strip">
              {current.week.map(item => <button key={item.day} className={`week-day${item.day === day ? " selected" : ""}${item.day === localDay() ? " is-today" : ""}`} aria-pressed={item.day === day} aria-label={`${dateLabel(item.day, lang)}, ${t("lessonsLabel")}: ${item.lessons}`} onClick={() => setDay(item.day)}>
                <span className="week-day-name">{t(["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date(`${item.day}T12:00:00`).getDay()])}</span>
                <strong>{Number(item.day.slice(8))}</strong>
                <span className="week-day-marks" aria-hidden="true">{Array.from({ length: Math.min(3, item.lessons) }, (_, index) => <i key={index} />)}</span>
                <small>{item.lessons} <span>{t("lessonsLabel").toLocaleLowerCase(locale)}</span></small>
              </button>)}
            </div>
          </section>
          <section className="panel upcoming-panel">
            <div className="overview-panel-heading"><div><h2>{t("overviewUpcoming")}</h2><p>{t("overviewUpcomingHelp")}</p></div><button className="link panel-action" onClick={() => onNavigate("schedule")}>{t("viewAll")}<ArrowUpRight size={16} aria-hidden="true" /></button></div>
            {current.upcoming.length ? <div className="upcoming-list">{current.upcoming.map(lesson => <article className={`upcoming-lesson ${lesson.lesson_type}`} key={lesson.occurrence_id}>
              <div className="upcoming-time"><strong>{String(lesson.starts_at).slice(0, 5)}</strong><span>{String(lesson.ends_at).slice(0, 5)}</span></div>
              <div className="upcoming-description"><span className={`badge ${lesson.lesson_type}`}>{t(lesson.lesson_type)}</span><h3>{lesson.subject}</h3><p>{lesson.teacher}</p></div>
              <div className="upcoming-place"><span><CalendarDays size={13} aria-hidden="true" />{dateLabel(lesson.day, lang)}</span><span><MapPin size={13} aria-hidden="true" />{lesson.room}</span></div>
            </article>)}</div> : <EmptyState icon={CalendarDays} title={t("overviewNoLessons")} description={t("overviewNoLessonsHelp")}><button className="secondary" onClick={() => onNavigate("schedule")}>{t("overviewViewSchedule")}</button></EmptyState>}
          </section>
          {admin && <section className="panel activity-panel"><div className="overview-panel-heading"><h2>{t("overviewActivity")}</h2><button className="link panel-action" onClick={() => onNavigate("diagnostics")}>{t("viewAll")}<ArrowUpRight size={16} aria-hidden="true" /></button></div>
            {current.activity.length ? <ol className="activity-list">{current.activity.map(item => <li key={item.id}><span className="activity-dot" aria-hidden="true" /><div><strong>{t(activityLabels[item.action] || "activityRecorded")}</strong><small>{t(item.resource) === item.resource ? t("academicWorkspace") : t(item.resource)}</small></div><time dateTime={`${item.created_at}Z`}>{timestampLabel(item.created_at, lang)}</time></li>)}</ol> : <EmptyState icon={Clock3} title={t("overviewNoActivity")} description={t("overviewActivityHelp")} />}
          </section>}
        </div>
        <aside className="overview-side-column">
          <section className="planning-feature"><span className="feature-icon"><CalendarCheck2 size={24} aria-hidden="true" /></span><p className="eyebrow">ChronoCampus</p><h2>{t(admin ? "overviewPlanningTitle" : "overviewPersonalTitle")}</h2><p>{t(admin ? "overviewPlanningText" : "overviewPersonalText")}</p><button onClick={() => onNavigate(admin ? "planner" : "schedule")}>{t(admin ? "overviewOpenPlanner" : "overviewViewSchedule")}<ArrowRight size={16} aria-hidden="true" /></button><div className="feature-grid-art" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div></section>
          {admin ? <>
            <section className="panel versions-panel"><div className="overview-panel-heading"><h2>{t("overviewVersions")}</h2><Layers3 size={18} aria-hidden="true" /></div>
              {current.versions.length ? <div className="version-list">{current.versions.map(version => <button key={version.id} className="version-link" onClick={() => onNavigate("planner", version.id)}><span className="version-icon"><CalendarDays size={18} aria-hidden="true" /></span><span className="version-copy"><strong>{version.name}</strong><small>{version.term}</small></span><span className={`badge ${version.status === "published" ? "success" : version.report_complete ? "ready" : "draft"}`}>{t(version.status)}</span></button>)}</div> : <EmptyState icon={Layers3} title={t("overviewNoVersions")} description={t("overviewNoVersionsHelp")}><button className="secondary" onClick={() => onNavigate("planner")}>{t("createDraft")}</button></EmptyState>}
            </section>
            <section className="panel campus-panel"><h2>{t("overviewCampus")}</h2><dl>{[{ key: "total_cohorts", label: "groups", icon: UsersRound }, { key: "total_rooms", label: "rooms", icon: Building2 }, { key: "active_users", label: "overviewActiveUsers", icon: UsersRound }, { key: "active_runs", label: "overviewActiveRuns", icon: Clock3 }].map(({ key, label, icon: Icon }) => <div key={key}><dt><Icon size={16} aria-hidden="true" />{t(label)}</dt><dd>{current.stats[key] ?? 0}</dd></div>)}</dl><button className="link panel-action" onClick={() => onNavigate("catalogs")}>{t("catalogs")}<ArrowUpRight size={15} aria-hidden="true" /></button></section>
          </> : <section className="panel support-overview"><span className="metric-icon"><MessageSquare size={20} aria-hidden="true" /></span><h2>{t("overviewSupportTitle")}</h2><p>{t("overviewSupportHelp")}</p><div className="support-counts"><span>{t("new")}<strong>{current.support.new}</strong></span><span>{t("in_progress")}<strong>{current.support.in_progress}</strong></span></div><button className="secondary" onClick={() => onNavigate("feedback")}>{t("feedback")}<ArrowRight size={16} aria-hidden="true" /></button></section>}
        </aside>
      </div>
    </>}
  </div>;
}
