import { useState, useRef, useEffect, ReactNode } from "react";
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

export function Dialog({
  children,
  labelledBy,
  onClose,
}: {
  children: ReactNode;
  labelledBy: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      className="modal"
      aria-labelledby={labelledBy}
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      {children}
    </dialog>
  );
}
