import { useEffect, useState } from "react";
import {
  CalendarDays,
  Database,
  MessageSquare,
  Settings,
  UserRound,
  LogOut,
  Activity,
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
import { Feedback } from "./Feedback";
import { LanguageProvider, LanguageSwitch, useLanguage } from "./i18n";
import { ErrorBox, useAction } from "./common";
import "./styles.css";
function Workspace() {
  const { t } = useLanguage();
  const [account, setAccount] = useState<Account | null>(null);
  const [ready, setReady] = useState(false);
  const [page, setPage] = useState("schedule");
  const { busy, error, run } = useAction();
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
    return <div className="loading-screen">ChronoCampus · {t("loading")}</div>;
  if (!account)
    return (
      <SignIn
        onLogin={(user) => {
          setAccount(user);
          setPage(user.role === "admin" ? "planner" : "schedule");
        }}
      />
    );
  const navigation = [
    { id: "schedule", icon: CalendarDays },
    ...(account.role === "admin"
      ? [
          { id: "planner", icon: Settings },
          { id: "catalogs", icon: Database },
          { id: "diagnostics", icon: Activity },
        ]
      : []),
    { id: "feedback", icon: MessageSquare },
    { id: "account", icon: UserRound },
  ];
  return (
    <div className="workspace">
      <aside className="sidebar">
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            setPage("schedule");
          }}
        >
          <span className="brand-mark">C</span>ChronoCampus
        </a>
        <p className="sidebar-label">{t(account.role)}</p>
        <nav>
          {navigation.map((item) => (
            <button
              key={item.id}
              className={page === item.id ? "active" : ""}
              onClick={() => setPage(item.id)}
            >
              <item.icon size={19} />
              {t(item.id)}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="avatar">
            {account.display_name?.slice(0, 1) || "C"}
          </span>
          <div>
            <strong>{account.display_name}</strong>
            <small>{account.email}</small>
          </div>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <span>{t(page)}</span>
          <div className="inline">
            <LanguageSwitch />
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
              <LogOut size={19} />
            </button>
          </div>
        </header>
        <main>
          <ErrorBox error={error} />
          <DiagnosticBoundary
            key={page}
            message={t("frontendFailure")}
            reload={t("reload")}
          >
            {account.must_change_password || page === "account" ? (
              <section className="panel account-panel">
                <h1>{t("account")}</h1>
                <p>
                  {account.display_name} · {account.email}
                </p>
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
            ) : page === "catalogs" && account.role === "admin" ? (
              <Catalogs />
            ) : page === "planner" && account.role === "admin" ? (
              <Planner />
            ) : page === "diagnostics" && account.role === "admin" ? (
              <Diagnostics />
            ) : page === "feedback" ? (
              <Feedback account={account} />
            ) : (
              <PersonalSchedule />
            )}
          </DiagnosticBoundary>
        </main>
      </div>
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
