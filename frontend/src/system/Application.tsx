import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  Database,
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
  ArrowUpRight,
  CircleHelp,
  ShieldCheck,
} from "lucide-react";
import {
  Account,
  api,
  setCsrf,
  reportClientError,
  setDiagnosticPage,
} from "./api";
import { Diagnostics } from "./Diagnostics";
import { DiagnosticBoundary } from "./DiagnosticBoundary";
import { SignIn, PasswordForm } from "./Accounts";
import { Catalogs } from "./Catalogs";
import { Planner } from "./Planner";
import { PersonalSchedule } from "./Schedule";
import { Overview, localDay } from "./Overview";
import { Feedback } from "./Feedback";
import { LanguageProvider, LanguageSwitch, useLanguage } from "./i18n";
import { dateLabel, ErrorBox, LoadingState, useAction } from "./common";
import "./styles.css";
import "./workspace.css";
function Workspace() {
  const { t, lang } = useLanguage();
  const [account, setAccount] = useState<Account | null>(null);
  const [ready, setReady] = useState(false);
  const [page, setPage] = useState("overview");
  const [plannerVersion, setPlannerVersion] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem("chronocampus.sidebarCollapsed") === "true"; }
    catch { return false; }
  });
  const [showBackToTop, setShowBackToTop] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const main = useRef<HTMLElement>(null);
  const { busy, error, run } = useAction();
  const activePage = account?.must_change_password ? "account" : page;
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
  const navigate = (next: string, versionId: number | null = null) => {
    setPlannerVersion(next === "planner" ? versionId : null);
    setPage(next);
    setMenuOpen(false);
    requestAnimationFrame(() => {
      main.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0 });
    });
  };
  useEffect(() => {
    setDiagnosticPage(page);
  }, [page]);
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
  if (!ready)
    return <div className="loading-screen"><span className="brand">ChronoCampus</span><LoadingState /></div>;
  if (!account)
    return (
      <SignIn
        onLogin={(user) => {
          setAccount(user);
          setMenuOpen(false);
          setPage("overview");
        }}
      />
    );
  const navigation = [
    { id: "overview", icon: LayoutDashboard, group: "navigationMain" },
    { id: "schedule", icon: CalendarDays, group: "navigationMain" },
    ...(account.role === "admin"
      ? [
          { id: "planner", icon: Settings, group: "navigationMain" },
          { id: "catalogs", icon: Database, group: "navigationAdmin" },
          { id: "diagnostics", icon: Activity, group: "navigationAdmin" },
        ]
      : []),
    { id: "feedback", icon: MessageSquare, group: "navigationPersonal" },
    { id: "account", icon: UserRound, group: "navigationPersonal" },
  ];
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
              {activePage === item.id && <span className="nav-active-dot" aria-hidden="true" />}
            </button>
          ))}</div>)}
        </nav>
        <div className="sidebar-help">
          <CircleHelp size={21} aria-hidden="true" />
          <strong>{t("workspaceHelpTitle")}</strong><p>{t("workspaceHelpText")}</p>
          <button disabled={account.must_change_password} onClick={() => navigate("feedback")}>{t("workspaceHelpAction")}<ArrowUpRight size={14} aria-hidden="true" /></button>
        </div>
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
            key={page}
            message={t("frontendFailure")}
            reload={t("reload")}
          >
            {account.must_change_password || page === "account" ? (
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
            ) : page === "catalogs" && account.role === "admin" ? (
              <Catalogs />
            ) : page === "planner" && account.role === "admin" ? (
              <Planner initialVersionId={plannerVersion} />
            ) : page === "diagnostics" && account.role === "admin" ? (
              <Diagnostics />
            ) : page === "feedback" ? (
              <Feedback account={account} />
            ) : page === "overview" ? (
              <Overview account={account} onNavigate={navigate} />
            ) : (
              <PersonalSchedule />
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
