import { useState, useRef, useEffect, ReactNode, InputHTMLAttributes } from "react";
import { ChevronLeft, ChevronRight, Eye, EyeOff, Inbox, LoaderCircle, X, type LucideIcon } from "lucide-react";
import { ApiError } from "./api";
import { useLanguage } from "./i18n";
export function ErrorBox({ error }: { error: unknown }) {
  const { t } = useLanguage();
  if (!error) return null;
  const detail =
    error instanceof ApiError
      ? error.detail
      : error instanceof Error
        ? error.message
        : error;
  const values = (value: any): string[] =>
    typeof value === "string"
      ? [value]
      : Array.isArray(value)
        ? value.flatMap(values)
        : value && typeof value === "object"
          ? [
              value.code || (value.msg ? "invalid_input" : ""),
              ...(value.issues ? values(value.issues) : []),
              ...(value.report?.issues ? values(value.report.issues) : []),
            ].filter(Boolean)
          : [];
  const codes = [...new Set(values(detail))];
  if (!codes.length) return null;
  return (
    <div className="notice error" role="alert">
      {codes.map((code, i) => (
        <div key={i}>{t(code) === code ? t("request_failed") : t(code)}</div>
      ))}
      {error instanceof ApiError && error.requestId && <small>{t("diagnosticReference")}: <code className="break-code">{error.requestId}</code></small>}
    </div>
  );
}
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}
export const dateLabel = (date: string, lang: string) =>
  new Intl.DateTimeFormat(lang === "hy" ? "hy-AM" : lang, {
    day: "numeric",
    month: "short",
    weekday: "short",
  }).format(new Date(`${date}T12:00:00`));

export function LoadingState({ label, compact = false }: { label?: string; compact?: boolean }) {
  const { t } = useLanguage();
  return (
    <div className={`loading-state${compact ? " compact" : ""}`} role="status">
      <LoaderCircle size={20} className="spin" aria-hidden="true" />
      <span>{label || t("loading")}</span>
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, description, children }: {
  icon?: LucideIcon; title: string; description?: string; children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon"><Icon size={24} aria-hidden="true" /></span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {children && <div className="empty-state-actions">{children}</div>}
    </div>
  );
}

export function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const { t } = useLanguage();
  const [visible, setVisible] = useState(false);
  return (
    <span className="password-field">
      <input {...props} type={visible ? "text" : "password"} />
      <button type="button" className="icon-button password-toggle"
        aria-label={t(visible ? "hidePassword" : "showPassword")}
        title={t(visible ? "hidePassword" : "showPassword")}
        aria-pressed={visible} disabled={props.disabled}
        onClick={() => setVisible(!visible)}>
        {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
      </button>
    </span>
  );
}

export function SectionLinks({ items }: { items: { id: string; label: string }[] }) {
  const { t } = useLanguage();
  return <nav className="section-links" aria-label={t("pageSections")}>
    {items.map(({ id, label }) => <a key={id} href={`#${id}`} onClick={(event) => {
      const target = document.getElementById(id);
      if (!target) return;
      event.preventDefault();
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: "start" });
    }}>{label}</a>)}
  </nav>;
}

export function ListPagination({ page, pageSize, total, onChange }: {
  page: number; pageSize: number; total: number; onChange: (page: number) => void;
}) {
  const { t } = useLanguage();
  if (total <= pageSize) return null;
  const pages = Math.ceil(total / pageSize);
  return <nav className="pagination result-pagination" aria-label={t("paginationLabel")}>
    <span className="count-label">{t("shownRecords")} {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} {t("ofTotal")} {total}</span>
    <div className="inline">
      <button type="button" className="secondary" aria-label={t("previous_page")} disabled={page === 0} onClick={() => onChange(page - 1)}><ChevronLeft size={18} aria-hidden="true" /></button>
      <span className="count-label">{t("pageLabel")} {page + 1} / {pages}</span>
      <button type="button" className="secondary" aria-label={t("next_page")} disabled={page + 1 >= pages} onClick={() => onChange(page + 1)}><ChevronRight size={18} aria-hidden="true" /></button>
    </div>
  </nav>;
}

export function Dialog({
  children,
  labelledBy,
  onClose,
  className = "",
  closeDisabled = false,
}: {
  children: ReactNode;
  labelledBy: string;
  onClose: () => void;
  className?: string;
  closeDisabled?: boolean;
}) {
  const { t } = useLanguage();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      className={`modal${className ? ` ${className}` : ""}`}
      aria-labelledby={labelledBy}
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        if (!closeDisabled) onClose();
      }}
    >
      <button type="button" className="icon-button dialog-close" onClick={onClose} disabled={closeDisabled}
        aria-label={t("closeDialog")} title={t("closeDialog")}>
        <X size={20} aria-hidden="true" />
      </button>
      {children}
    </dialog>
  );
}
