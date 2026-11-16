import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  Landmark,
  CalendarRange,
  MessageSquare,
  Settings,
  UserRound,
  LogOut,
  Activity,
  Menu,
  X,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  ArrowUp,
  LayoutDashboard,
  ShieldCheck,
  Lightbulb,
} from "lucide-react";
import {
  Account,
  api,
  setCsrf,
  reportClientError,
  setDiagnosticPage,
} from "./api";
import { ChangeNotificationBell } from "./ChangeNotifications";
import { Diagnostics } from "./Diagnostics";
import { DiagnosticBoundary } from "./DiagnosticBoundary";
import { SignIn, PasswordForm, useAuthLink } from "./Accounts";
import { Catalogs } from "./Catalogs";
import { Planner } from "./Planner";
import { PersonalSchedule } from "./Schedule";
import { Overview } from "./Overview";
import { DeanTimetables } from "./Dean";
import { Suggestions } from "./Suggestions";
import { Feedback } from "./Feedback";
import { LanguageProvider, LanguageSwitch, useLanguage } from "./i18n";
import { dateLabel, ErrorBox, LoadingState, localDay, useAction } from "./common";
import "./styles.css";
import "./workspace.css";
import "./dean.css";
import "./adminWorkspace.css";
import "./theme.css";

export function navigationForRole(role: Account["role"]) {
  return [
    { id: "overview", icon: LayoutDashboard, group: "navigationMain" },
    { id: role === "dean" ? "timetables" : "schedule", icon: CalendarDays, group: "navigationMain" },
    ...(role === "dean" ? [{ id: "suggestions", icon: Lightbulb, group: "navigationMain" }] : []),
    ...(role === "admin" ? [
      { id: "planner", icon: Settings, group: "navigationMain" },
      { id: "university", icon: Landmark, group: "navigationAdmin" },
      { id: "semester", icon: CalendarRange, group: "navigationAdmin" },
      { id: "diagnostics", icon: Activity, group: "navigationAdmin" },
      { id: "suggestions", icon: Lightbulb, group: "navigationAdmin" },
    ] : []),
    { id: "feedback", icon: MessageSquare, group: "navigationPersonal" },
    { id: "account", icon: UserRound, group: "navigationPersonal" },
  ];
}
export function pageForRole(page: string, role: Account["role"]) {
  if (page === "catalogs" && role === "admin") return "university";
  return navigationForRole(role).some(item => item.id === page) ? page : "overview";
}

export function defaultPageForRole(role: Account["role"]) {
  return role === "lecturer" ? "schedule" : "overview";
}

function Workspace() {
  const { t, lang } = useLanguage();
  const authLink = useAuthLink();
  const [account, setAccount] = useState<Account | null>(null);
  const [ready, setReady] = useState(false);
  const [openSuggestions, setOpenSuggestions] = useState(0);
  const [page, setPage] = useState("overview");
  const [plannerVersion, setPlannerVersion] = useState<number | null>(null);
  const [plannerStart, setPlannerStart] = useState({ createDraft: false, termId: "" });
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem("chronocampus.sidebarCollapsed") === "true"; }
    catch { return false; }
  });
  const [showBackToTop, setShowBackToTop] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const main = useRef<HTMLElement>(null);
  const { busy, error, run } = useAction();
  const activePage = account?.must_change_password ? "account" : account ? pageForRole(page, account.role) : "overview";
  useEffect(() => {
    try { localStorage.setItem("chronocampus.sidebarCollapsed", String(sidebarCollapsed)); }
    catch { /* Navigation still works when browser storage is unavailable. */ }
  }, [sidebarCollapsed]);
  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 600);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    document.title = `${account ? t(activePage) : t("login")} · ChronoCampus`;
  }, [activePage, lang, account]);
  const navigate = (next: string, versionId: number | null = null, options: { createDraft?: boolean; termId?: string } = {}) => {
    setPlannerVersion(next === "planner" ? versionId : null);
    setPlannerStart({ createDraft: next === "planner" && !!options.createDraft, termId: next === "planner" ? options.termId || "" : "" });
    setPage(next);
    setMenuOpen(false);
    requestAnimationFrame(() => {
      main.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0 });
    });
  };
  useEffect(() => {
    setDiagnosticPage(activePage);
  }, [activePage]);
  useEffect(() => {
    const error = (event: ErrorEvent) =>
      reportClientError("javascript_error", event.error);
    const rejection = (event: PromiseRejectionEvent) =>
      reportClientError("unhandled_rejection", event.reason);
    window.addEventListener("error", error);
    window.addEventListener("unhandledrejection", rejection);
    return () => {
      window.removeEventListener("error", error);
      window.removeEventListener("unhandledrejection", rejection);
    };
  }, []);
  useEffect(() => {
    let live = true;
    void api("/auth/me")
      .then((response) => {
        if (live) {
          setCsrf(response.csrf_token);
          setAccount(response.user);
          setPage(defaultPageForRole(response.user.role));
        }
      })
      .catch(() => {})
      .finally(() => {
        if (live) setReady(true);
      });
    const expire = () => {
      setCsrf("");
      setAccount(null);
    };
    window.addEventListener("session-expired", expire);
    return () => {
      live = false;
      window.removeEventListener("session-expired", expire);
    };
  }, []);
  useEffect(() => {
    if (account?.role !== "admin" || account.must_change_password) { setOpenSuggestions(0); return; }
    let active = true;
    const load = async () => {
      try {
        const result = await api<{ total: number; counts: Record<string, number> }>("/admin/suggestions?status=open&limit=1");
        if (active) setOpenSuggestions(result.counts?.open ?? result.total);
      } catch { /* A badge failure must not block navigation. */ }
    };
    void load();
    const timer = window.setInterval(load, 30000);
    window.addEventListener("suggestions-updated", load);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("suggestions-updated", load); };
  }, [account]);
  if (!ready)
    return <div className="loading-screen"><span className="brand">ChronoCampus</span><LoadingState /></div>;
  if (!account || authLink.token)
    return (
      <SignIn
        authLink={authLink}
        onSessionEnded={() => { setAccount(null); setCsrf(""); }}
        onLogin={(user) => {
          setAccount(user);
          setMenuOpen(false);
          setPage(defaultPageForRole(user.role));
        }}
      />
    );
  const navigation = navigationForRole(account.role);
  return (
    <div className={`workspace${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
      <a className="skip-link" href="#main-content">{t("skipContent")}</a>
      <aside className={`sidebar${menuOpen ? " nav-open" : ""}`} onKeyDown={(event) => {
        if (event.key === "Escape" && menuOpen) {
          setMenuOpen(false);
          menuButton.current?.focus();
        }
      }}>
        <div className="sidebar-top">
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            navigate("overview");
          }}
        >
          <span className="brand-mark" aria-hidden="true"><CalendarDays size={22} strokeWidth={1.7} /></span><span className="brand-name">Chrono<span>Campus</span><small>{t("campusEdition")}</small></span>
        </a>
        <button ref={menuButton} type="button" className="icon-button mobile-menu"
          aria-label={t(menuOpen ? "closeMenu" : "openMenu")}
          aria-expanded={menuOpen} aria-controls="workspace-navigation"
          onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
        </button>
        </div>
        <nav id="workspace-navigation" aria-label={t("navigation")}>
          {["navigationMain", ...(account.role === "admin" ? ["navigationAdmin"] : []), "navigationPersonal"].map(group => <div className="navigation-group" key={group}><p className="nav-group-label">{t(group)}</p>{navigation.filter(item => item.group === group).map((item) => (
            <button
              key={item.id}
              className={activePage === item.id ? "active" : ""}
              title={t(item.id)}
              aria-label={t(item.id)}
              aria-current={activePage === item.id ? "page" : undefined}
              disabled={account.must_change_password && item.id !== "account"}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={19} aria-hidden="true" />
              <span className="nav-label">{t(item.id)}</span>
              {item.id === "suggestions" && account.role === "admin" && openSuggestions > 0 && <span className="nav-count" aria-label={`${t("suggestionOpen")}: ${openSuggestions}`}>{openSuggestions}</span>}
              {activePage === item.id && <span className="nav-active-dot" aria-hidden="true" />}
            </button>
          ))}</div>)}
        </nav>
        <div className="sidebar-footer">
          <span className="avatar">
            {account.display_name?.slice(0, 1) || "C"}
          </span>
          <div className="sidebar-identity">
            <strong>{account.display_name}</strong>
            <small>{t(account.role)}</small>
          </div>
          <button className="icon-button sidebar-account" disabled={account.must_change_password} aria-label={t("account")} onClick={() => navigate("account")}><ChevronRight size={16} aria-hidden="true" /></button>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <div className="topbar-location">
            <button type="button" className="icon-button sidebar-toggle"
              aria-label={t(sidebarCollapsed ? "expandSidebar" : "collapseSidebar")}
              title={t(sidebarCollapsed ? "expandSidebar" : "collapseSidebar")}
              aria-expanded={!sidebarCollapsed} aria-controls="workspace-navigation"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
              {sidebarCollapsed ? <PanelLeftOpen size={20} aria-hidden="true" /> : <PanelLeftClose size={20} aria-hidden="true" />}
            </button>
            <span className="topbar-context">{t("workspaceLabel")}</span>
            <ChevronRight size={15} className="topbar-divider" aria-hidden="true" />
            <span>{t(activePage)}</span>
          </div>
          <div className="inline">
            <span className="topbar-date"><CalendarDays size={15} aria-hidden="true" />{lang === "hy" ? `${dateLabel(localDay(), lang)}, ${new Date().getFullYear()}` : new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", year: "numeric" }).format(new Date())}</span>
            {!account.must_change_password && <ChangeNotificationBell key={account.id} account={account} />}
            <LanguageSwitch />
            <span className="topbar-separator" aria-hidden="true" />
            <button
              className="icon-button"
              title={t("logout")}
              aria-label={t("logout")}
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await api("/auth/logout", "POST");
                  setCsrf("");
                  setAccount(null);
                })
              }
            >
              <LogOut size={19} aria-hidden="true" />
            </button>
          </div>
        </header>
        <main id="main-content" ref={main} tabIndex={-1}>
          <ErrorBox error={error} />
          <DiagnosticBoundary
            key={activePage}
            message={t("frontendFailure")}
            reload={t("reload")}
          >
            {account.must_change_password || activePage === "account" ? (
              <>
              <div className="page-heading page-hero"><div className="page-hero-copy"><p className="eyebrow">{t("navigationPersonal")}</p><h1>{t("account")}</h1><p>{t("accountIntro")}</p></div><span className="page-hero-icon"><UserRound size={26} aria-hidden="true" /></span></div>
              <div className="account-layout"><section className="panel account-panel">
                <div className="account-identity">
                  <span className="avatar" aria-hidden="true">{account.display_name?.slice(0, 1) || "C"}</span>
                  <div><h2>{account.display_name}</h2><p>{account.email}</p><span className="badge">{t(account.role)}</span></div>
                </div>
                {account.must_change_password && (
                  <p className="notice warning">
                    {t("password_change_required")}
                  </p>
                )}
                <PasswordForm
                  onDone={() => {
                    setCsrf("");
                    setAccount(null);
                  }}
                />
              </section>
              <aside className="panel account-security"><span className="security-icon"><ShieldCheck size={28} aria-hidden="true" /></span><h2>{t("accountSecurity")}</h2><p>{t("accountSecurityHelp")}</p><div className="security-rule"><span>12–256</span>{t("newPassword")}</div><p className="account-access-note">{t("authAccessHelp")}</p></aside></div>
              </>
            ) : (activePage === "university" || activePage === "semester") && account.role === "admin" ? (
              <Catalogs key={activePage} mode={activePage} onCreateDraft={termId => navigate("planner", null, { createDraft: true, termId })} />
            ) : activePage === "planner" && account.role === "admin" ? (
              <Planner initialVersionId={plannerVersion} createOnOpen={plannerStart.createDraft} initialTermId={plannerStart.termId} onOpenSetup={() => navigate("semester")} />
            ) : activePage === "diagnostics" && account.role === "admin" ? (
              <Diagnostics />
            ) : activePage === "timetables" && account.role === "dean" ? (
              <DeanTimetables />
            ) : activePage === "suggestions" && (account.role === "dean" || account.role === "admin") ? (
              <Suggestions mode={account.role} onNavigate={navigate} />
            ) : activePage === "feedback" ? (
              <Feedback account={account} />
            ) : activePage === "schedule" && account.role !== "dean" ? (
              <PersonalSchedule account={account} />
            ) : (
              <Overview account={account} onNavigate={navigate} />
            )}
          </DiagnosticBoundary>
        </main>
      </div>
      {showBackToTop && <button type="button" className="back-to-top secondary" onClick={() => {
        main.current?.focus({ preventScroll: true });
        window.scrollTo({ top: 0 });
      }}><ArrowUp size={17} aria-hidden="true" />{t("backToTop")}</button>}
    </div>
  );
}
export default function Application() {
  return (
    <LanguageProvider>
      <Workspace />
    </LanguageProvider>
  );
}
