import { FormEvent, useState } from "react";
import { Account, api, setCsrf } from "./api";
import { ErrorBox, useAction } from "./common";
import { LanguageSwitch, useLanguage } from "./i18n";
export function PasswordForm({
  onDone,
  token,
}: {
  onDone: () => void;
  token?: string;
}) {
  const { t } = useLanguage();
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
    >
      {!token && (
        <label>
          {t("current_password")}
          <input
            name="current_password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={256}
          />
        </label>
      )}
      <label>
        {t("newPassword")}
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={256}
          required
        />
      </label>
      <label>
        {t("confirmPassword")}
        <input
          name="confirmation"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={256}
          required
        />
      </label>
      <ErrorBox error={error} />
      <button disabled={busy}>{t("changePassword")}</button>
    </form>
  );
}
export function SignIn({ onLogin }: { onLogin: (a: Account) => void }) {
  const { t } = useLanguage();
  const { busy, error, run } = useAction();
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
          <h1>{t("welcome")}</h1>
          <p>{t("welcomeText")}</p>
          <div className="clock-art" aria-hidden="true">
            <span>01</span>
            <i />
            <span>02</span>
            <b>✓</b>
          </div>
        </div>
        <small>ChronoCampus · 2026</small>
      </section>
      <section className="auth-panel">
        <LanguageSwitch />
        <div className="auth-card">
          <h2>{t(token ? "reset" : mode === "login" ? "login" : "reset")}</h2>
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
            <form onSubmit={submit} className="form-stack">
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
                <label>
                  {t("password")}
                  <input
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    maxLength={256}
                  />
                </label>
              )}
              <ErrorBox error={error} />
              <button disabled={busy}>
                {t(mode === "login" ? "login" : "reset")}
              </button>
              <button
                className="link"
                type="button"
                onClick={() => {
                  setMode(mode === "login" ? "reset" : "login");
                  setMessage("");
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
