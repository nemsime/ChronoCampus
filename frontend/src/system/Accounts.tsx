import { FormEvent, useEffect, useId, useState } from "react";
import { Account, api, setCsrf } from "./api";
import { ErrorBox, PasswordInput, useAction } from "./common";
import { LanguageSwitch, useLanguage } from "./i18n";
import { ArrowRight, CalendarDays, Check, LockKeyhole } from "lucide-react";
export function useAuthLink() {
  const read = () => {
    const params = new URLSearchParams(location.hash.slice(1));
    const query = new URLSearchParams(location.search);
    const resetPage = location.pathname === "/reset-password";
    return { token: resetPage ? query.get("token") || "invalid" : params.get("verify") || params.get("reset") || "", verification: !resetPage && params.has("verify") };
  };
  const [link, setLink] = useState(read);
  useEffect(() => {
    // Keep the token only in React memory, removing it from address/history immediately.
    if (location.pathname === "/reset-password" && new URLSearchParams(location.search).has("token")) {
      const query = new URLSearchParams(location.search);
      query.delete("token");
      history.replaceState(null, "", location.pathname + (query.size ? "?" + query : ""));
    }
    const update = () => setLink(read());
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return link;
}
function clearAuthLink() {
  history.replaceState(null, "", (location.pathname === "/reset-password" ? "/" : location.pathname) + location.search);
  window.dispatchEvent(new Event("hashchange"));
}
export function PasswordForm({
  onDone,
  token,
  verification = false,
}: {
  onDone: () => void;
  token?: string;
  verification?: boolean;
}) {
  const { t } = useLanguage();
  const fieldId = useId();
  const { busy, error, run } = useAction();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void run(async () => {
          if (f.get("password") !== f.get("confirmation"))
            throw new Error("password_mismatch");
          await api(
            token ? verification ? "/auth/verify-email" : "/auth/reset-password" : "/auth/change-password",
            "POST",
            token
              ? verification ? { token, password: f.get("password") } : { token, newPassword: f.get("password") }
              : {
                  current_password: f.get("current_password"),
                  password: f.get("password"),
                },
          );
          clearAuthLink();
          onDone();
        });
      }}
      className="form-stack"
      aria-busy={busy}
    >
      {!token && (
        <div className="field">
          <label htmlFor={`${fieldId}-current`}>{t("current_password")}</label>
          <PasswordInput
            id={`${fieldId}-current`}
            name="current_password"
            autoComplete="current-password"
            required
            maxLength={256}
          />
        </div>
      )}
      <div className="field">
        <label htmlFor={`${fieldId}-new`}>{t("newPassword")}</label>
        <PasswordInput
          id={`${fieldId}-new`}
          name="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={256}
          required
        />
      </div>
      <div className="field">
        <label htmlFor={`${fieldId}-confirm`}>{t("confirmPassword")}</label>
        <PasswordInput
          id={`${fieldId}-confirm`}
          name="confirmation"
          autoComplete="new-password"
          minLength={12}
          maxLength={256}
          required
        />
      </div>
      <ErrorBox error={error} />
      <button disabled={busy}>
        {t(busy ? "authChangingPassword" : verification ? "verifyAndCreate" : "changePassword")}
      </button>
    </form>
  );
}
export function SignIn({ onLogin, onSessionEnded, authLink }: { onLogin: (a: Account) => void; onSessionEnded: () => void; authLink: { token: string; verification: boolean } }) {
  const { t } = useLanguage();
  const passwordId = useId();
  const { busy, error, setError, run } = useAction();
  const [mode, setMode] = useState<"login" | "reset" | "register">("login");
  const [message, setMessage] = useState("");
  const { token, verification } = authLink;
  function navigate(next: "login" | "reset" | "register") {
    clearAuthLink();
    setMode(next);
    setMessage("");
    setError(null);
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void run(async () => {
      if (mode === "reset") {
        await api("/auth/forgot-password", "POST", { email: f.get("email") });
        setMessage("reset_requested");
      } else if (mode === "register") {
        await api("/auth/register", "POST", { email: f.get("email"), display_name: f.get("display_name") });
        setMessage("registration_requested");
      } else {
        const response = await api("/auth/login", "POST", {
          email: f.get("email"),
          password: f.get("password"),
        });
        setCsrf(response.csrf_token);
        onLogin(response.user);
      }
    });
  }
  return (
    <div className="auth-shell">
      <section className="auth-story">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true"><CalendarDays size={24} strokeWidth={1.7} /></span><span>Chrono<span className="brand-light">Campus</span></span>
        </div>
        <div className="auth-story-content">
          <h2>{t("authHeadline")}</h2>
          <p>{t("authStory")}</p>
          <div className="auth-schedule-art" aria-hidden="true">
            <div className="auth-art-header"><CalendarDays size={19} /><span>{t("authArtTitle")}</span><span className="art-dot" /></div>
            <div className="auth-art-grid">{Array.from({ length: 20 }, (_, index) => <span className={`art-cell art-cell-${index}`} key={index}><i /><i /></span>)}</div>
            <div className="auth-art-label"><span><Check size={14} /></span>{t("authArtBadge")}</div>
          </div>
        </div>
        <small>{t("authFooter")}<span>ChronoCampus © {new Date().getFullYear()}</span></small>
      </section>
      <section className="auth-panel">
        <LanguageSwitch />
        <div className="auth-card">
          <header className="auth-card-header">
            <span className="auth-lock"><LockKeyhole size={22} strokeWidth={1.5} aria-hidden="true" /></span>
            <p className="eyebrow">{t("authPortal")}</p>
            <h1>{t(verification && token ? "verifyEmail" : token || mode === "reset" ? "reset" : mode === "register" ? "register" : "authSignInTitle")}</h1>
            <p className="auth-description">
              {t(
                token
                  ? verification ? "verificationDescription" : "authNewPasswordDescription"
                  : mode === "login"
                    ? "authSignInDescription"
                    : mode === "register" ? "registrationDescription" : "authResetDescription",
              )}
            </p>
          </header>
          {message && (
            <p className="notice" role="status">
              {t(message)}
            </p>
          )}
          {token ? (
            <div className="form-stack">
            <PasswordForm
              key={token}
              token={token}
              verification={verification}
              onDone={() => {
                onSessionEnded();
                setMode("login");
                setMessage(verification ? "email_verified" : "password_changed");
              }}
            />
            <button className="link" type="button" onClick={() => navigate(verification ? "register" : "reset")}>{t("requestNewLink")}</button>
            <button className="link" type="button" onClick={() => navigate("login")}>{t("login")}</button>
            </div>
          ) : (
            <form onSubmit={submit} className="form-stack" aria-busy={busy}>
              {mode === "register" && <label>{t("registrationName")}<input name="display_name" autoComplete="name" required maxLength={150} /></label>}
              <label>
                {t("email")}
                <input
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                  maxLength={255}
                />
              </label>
              {mode === "login" && (
                <div className="field">
                  <label htmlFor={passwordId}>{t("password")}</label>
                  <PasswordInput
                    id={passwordId}
                    name="password"
                    autoComplete="current-password"
                    required
                    maxLength={256}
                  />
                </div>
              )}
              <ErrorBox error={error} />
              <button disabled={busy}>
                {t(
                  busy
                    ? mode === "login" ? "authSigningIn" : "authSendingReset"
                    : mode === "login" ? "login" : mode === "register" ? "register" : "reset",
                )}
                {!busy && <ArrowRight size={17} aria-hidden="true" />}
              </button>
              <button
                className="link"
                type="button"
                disabled={busy}
                onClick={() => {
                  navigate(mode === "login" ? "reset" : "login");
                }}
              >
                {t(mode === "login" ? "forgot" : "login")}
              </button>
              {mode !== "register" && <button className="link" type="button" disabled={busy} onClick={() => navigate("register")}>{t("register")}</button>}
            </form>
          )}
          <p className="auth-access-note"><LockKeyhole size={13} aria-hidden="true" />{t("registrationAccessHelp")}</p>
        </div>
      </section>
    </div>
  );
}
