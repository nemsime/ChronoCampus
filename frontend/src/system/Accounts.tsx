import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { Account, api, setCsrf } from "./api";
import { ErrorBox, PasswordInput, useAction } from "./common";
import { LanguageSwitch, useLanguage } from "./i18n";
import { ArrowRight, CalendarDays, Clock3 } from "lucide-react";
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
        const form = e.currentTarget;
        const f = new FormData(form);
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
          form.reset();
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
  const form = useRef<HTMLFormElement>(null);
  const { busy, error, setError, run } = useAction();
  const [mode, setMode] = useState<"login" | "reset" | "register">("login");
  const [message, setMessage] = useState("");
  const [groups, setGroups] = useState<{ id: number; group_code: string }[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  useEffect(() => {
    if (mode !== "register") return;
    let active = true;
    setGroupsLoading(true);
    void api<{ id: number; group_code: string }[]>("/auth/registration-groups")
      .then(items => { if (active) setGroups(items); })
      .catch(failure => { if (active) setError(failure); })
      .finally(() => { if (active) setGroupsLoading(false); });
    return () => { active = false; };
  }, [mode]);
  const [loginFieldsEditable, setLoginFieldsEditable] = useState(false);
  const { token, verification } = authLink;
  useEffect(() => {
    const clearForm = () => {
      form.current?.reset();
      setLoginFieldsEditable(false);
    };
    clearForm();
    window.addEventListener("pageshow", clearForm);
    return () => window.removeEventListener("pageshow", clearForm);
  }, [mode, token]);
  function navigate(next: "login" | "reset" | "register") {
    form.current?.reset();
    setLoginFieldsEditable(false);
    clearAuthLink();
    setMode(next);
    setMessage("");
    setError(null);
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const submittedForm = e.currentTarget;
    const f = new FormData(submittedForm);
    void run(async () => {
      if (mode === "reset") {
        await api("/auth/forgot-password", "POST", { email: f.get("email") });
        submittedForm.reset();
        setMessage("reset_requested");
      } else if (mode === "register") {
        await api("/auth/register", "POST", { email: f.get("email"), display_name: f.get("display_name"), course_group_id: Number(f.get("course_group_id")) });
        submittedForm.reset();
        setMessage("registration_requested");
      } else {
        const response = await api("/auth/login", "POST", {
          email: f.get("email"),
          password: f.get("password"),
        });
        submittedForm.reset();
        setCsrf(response.csrf_token);
        onLogin(response.user);
      }
    });
  }
  return (
    <div className="auth-shell auth-entry-shell">
      <div className="auth-scene" aria-hidden="true">
        <div className="auth-floating-note">
          <span className="auth-note-icon"><Clock3 size={15} /></span>
          <span className="auth-note-lines"><i /><i /></span>
        </div>
        <div className="auth-floating-calendar">
          {Array.from({ length: 21 }, (_, index) => <i key={index} />)}
        </div>
      </div>
      <header className="auth-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true"><CalendarDays size={24} strokeWidth={1.7} /></span><span>Chrono<span className="brand-light">Campus</span></span>
        </div>
        <LanguageSwitch />
      </header>
      <section className="auth-panel">
        <div className="auth-card">
          <header className="auth-card-header">
            <p className="eyebrow">{t("authPortal")}</p>
            <h1 className={mode === "login" && !token ? "auth-entry-title" : undefined}>
              {mode === "login" && !token ? <>{t("login")}<span>ChronoCampus</span></> : t(verification && token ? "verifyEmail" : token || mode === "reset" ? "reset" : mode === "register" ? "register" : "authSignInTitle")}
            </h1>
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
            <form key={mode} ref={form} onSubmit={submit} className="form-stack" aria-busy={busy} autoComplete="off">
              {mode === "register" && <label>{t("registrationName")}<input name="display_name" autoComplete="off" required maxLength={150} /></label>}
              {mode === "register" && <label>{t("course_group_id")}
                <select name="course_group_id" required defaultValue="" disabled={groupsLoading}>
                  <option value="" disabled>{t("registrationGroupPrompt")}</option>
                  {groups.map(group => <option key={group.id} value={group.id}>{group.group_code}</option>)}
                </select>
              </label>}
              {mode === "register" && !groupsLoading && groups.length === 0 && <p role="status">{t("registrationNoGroups")}</p>}
              <label>
                {t("email")}
                <input
                  name="email"
                  type="email"
                  placeholder={t("authEmailPlaceholder")}
                  autoComplete="off"
                  readOnly={mode === "login" && !loginFieldsEditable}
                  onFocus={() => setLoginFieldsEditable(true)}
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
                    placeholder={t("authPasswordPlaceholder")}
                    autoComplete="new-password"
                    readOnly={!loginFieldsEditable}
                    onFocus={() => setLoginFieldsEditable(true)}
                    required
                    maxLength={256}
                  />
                </div>
              )}
              <ErrorBox error={error} />
              <button disabled={busy || (mode === "register" && (groupsLoading || groups.length === 0))}>
                {t(
                  busy
                    ? mode === "login" ? "authSigningIn" : "authSendingReset"
                    : mode === "login" ? "login" : mode === "register" ? "register" : "reset",
                )}
                {!busy && <ArrowRight size={17} aria-hidden="true" />}
              </button>
              <div className="auth-form-links"><button
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
              </div>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
