import { FormEvent, useId, useState } from "react";
import { Account, api, setCsrf } from "./api";
import { ErrorBox, PasswordInput, useAction } from "./common";
import { LanguageSwitch, useLanguage } from "./i18n";
export function PasswordForm({
  onDone,
  token,
}: {
  onDone: () => void;
  token?: string;
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
            token ? "/auth/reset-password" : "/auth/change-password",
            "POST",
            token
              ? { token, password: f.get("password") }
              : {
                  current_password: f.get("current_password"),
                  password: f.get("password"),
                },
          );
          history.replaceState(null, "", location.pathname);
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
        {t(busy ? "authChangingPassword" : "changePassword")}
      </button>
    </form>
  );
}
export function SignIn({ onLogin }: { onLogin: (a: Account) => void }) {
  const { t } = useLanguage();
  const passwordId = useId();
  const { busy, error, setError, run } = useAction();
  const [mode, setMode] = useState<"login" | "reset">("login");
  const [message, setMessage] = useState("");
  const [token, setToken] = useState(
    () => new URLSearchParams(location.hash.slice(1)).get("reset") || "",
  );
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void run(async () => {
      if (mode === "reset") {
        await api("/auth/forgot-password", "POST", { email: f.get("email") });
        setMessage("reset_requested");
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
          <span className="brand-mark">C</span>ChronoCampus
        </div>
        <div>
          <p className="eyebrow">{t("schedule")}</p>
          <h2>{t("welcome")}</h2>
          <p>{t("welcomeText")}</p>
        </div>
        <small>ChronoCampus · 2026</small>
      </section>
      <section className="auth-panel">
        <LanguageSwitch />
        <div className="auth-card">
          <header className="auth-card-header">
            <h1>{t(token || mode === "reset" ? "reset" : "authSignInTitle")}</h1>
            <p className="auth-description">
              {t(
                token
                  ? "authNewPasswordDescription"
                  : mode === "login"
                    ? "authSignInDescription"
                    : "authResetDescription",
              )}
            </p>
          </header>
          {message && (
            <p className="notice" role="status">
              {t(message)}
            </p>
          )}
          {token ? (
            <PasswordForm
              token={token}
              onDone={() => {
                setToken("");
                setMode("login");
                setMessage("password_changed");
              }}
            />
          ) : (
            <form onSubmit={submit} className="form-stack" aria-busy={busy}>
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
                    : mode === "login" ? "login" : "reset",
                )}
              </button>
              <button
                className="link"
                type="button"
                disabled={busy}
                onClick={() => {
                  setMode(mode === "login" ? "reset" : "login");
                  setMessage("");
                  setError(null);
                }}
              >
                {t(mode === "login" ? "forgot" : "login")}
              </button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
