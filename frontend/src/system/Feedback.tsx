import { useEffect, useState } from "react";
import { MessageSquare, Plus } from "lucide-react";
import { Account, api, Row } from "./api";
import { Dialog, EmptyState, ErrorBox, LoadingState, useAction } from "./common";
import { useLanguage } from "./i18n";
export function Feedback({ account }: { account: Account }) {
  const { t, lang } = useLanguage();
  const [threads, setThreads] = useState<Row[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [compose, setCompose] = useState(false);
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const { busy, error, run } = useAction();
  const refresh = async () => {
    setLoading(true);
    try {
      setThreads(await api("/feedback"));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void run(refresh);
  }, []);
  const selected = threads.find((row) => row.id === active);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{t("feedback")}</h1>
          <p className="page-subtitle">{t("supportDescription")}</p>
        </div>
        <button onClick={() => setCompose(true)}>
          <Plus size={18} aria-hidden="true" />
          {t("supportNewRequest")}
        </button>
      </div>
      <ErrorBox error={error} />
      {!!error && (
        <button className="secondary" disabled={busy} onClick={() => void run(refresh)}>
          {t("supportRetry")}
        </button>
      )}
      <div className="support-layout">
        <aside className="panel thread-list" aria-busy={loading}>
          <div className="thread-list-heading">
            <h2>{t("supportRequests")}</h2>
            <span className="count-label">{threads.length}</span>
          </div>
          {loading && <LoadingState label={t("supportLoading")} compact />}
          {threads.map((thread) => (
            <button
              className={active === thread.id ? "active" : ""}
              key={thread.id}
              aria-pressed={active === thread.id}
              onClick={() => {
                setActive(thread.id);
                setReply("");
              }}
            >
              <strong>{thread.subject}</strong>
              <span className={`badge${thread.status === "closed" ? " success" : thread.status === "in_progress" ? " warn" : ""}`}>
                {t(thread.status)}
              </span>
              <small>
                {new Date(thread.created_at + "Z").toLocaleDateString(
                  lang === "hy" ? "hy-AM" : lang,
                )}
              </small>
            </button>
          ))}
          {!loading && !error && !threads.length && (
            <p className="empty">{t("supportEmptyTitle")}</p>
          )}
        </aside>
        <section className="panel conversation-panel">
          {selected ? (
            <>
              <div className="toolbar">
                <h2>{selected.subject}</h2>
                {account.role === "admin" ? (
                  <select
                    aria-label={t("status")}
                    value={selected.status}
                    disabled={busy}
                    onChange={(e) =>
                      void run(async () => {
                        await api(`/feedback/${selected.id}/status`, "PUT", {
                          status: e.target.value,
                        });
                        await refresh();
                      })
                    }
                  >
                    {["new", "in_progress", "closed"].map((v) => (
                      <option key={v} value={v}>
                        {t(v)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className={`badge${selected.status === "closed" ? " success" : selected.status === "in_progress" ? " warn" : ""}`}>
                    {t(selected.status)}
                  </span>
                )}
              </div>
              <div className="messages">
                {!selected.messages.length && (
                  <EmptyState icon={MessageSquare} title={t("supportNoMessages")} description={t("supportNoMessagesDescription")} />
                )}
                {selected.messages.map((message: Row) => (
                  <article
                    key={message.id}
                    className={
                      message.author_id === account.id
                        ? "message own"
                        : "message"
                    }
                  >
                    <small>
                      {message.author_id === account.id
                        ? account.display_name
                        : t("feedback")}{" "}
                      ·{" "}
                      {new Date(message.created_at + "Z").toLocaleString(
                        lang === "hy" ? "hy-AM" : lang,
                      )}
                    </small>
                    <p>{message.content}</p>
                  </article>
                ))}
              </div>
              {selected.status !== "closed" && (
                <form
                  className="form-stack"
                  aria-busy={busy}
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      await api(`/feedback/${selected.id}/messages`, "POST", {
                        content: reply,
                      });
                      setReply("");
                      await refresh();
                    });
                  }}
                >
                  <label>
                    {t("content")}
                    <textarea
                      required
                      maxLength={10000}
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                    />
                  </label>
                  <button disabled={busy}>{t(busy ? "supportSending" : "reply")}</button>
                </form>
              )}
              {selected.status === "closed" && (
                <p className="notice">{t("supportClosedNotice")}</p>
              )}
            </>
          ) : loading && !threads.length ? (
            <LoadingState label={t("supportLoading")} />
          ) : error && !threads.length ? null : (
            <EmptyState
              icon={MessageSquare}
              title={t(threads.length ? "supportSelectTitle" : "supportEmptyTitle")}
              description={t(threads.length ? "supportSelectDescription" : "supportEmptyDescription")}
            />
          )}
        </section>
      </div>
      {compose && (
        <Dialog labelledBy="feedback-title" onClose={() => setCompose(false)}>
          <h2 id="feedback-title">{t("supportNewRequest")}</h2>
          <form
            className="form-stack"
            aria-busy={busy}
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(async () => {
                const thread = await api("/feedback", "POST", {
                  subject: f.get("subject"),
                  content: f.get("content"),
                });
                await refresh();
                setActive(thread.id);
                setCompose(false);
              });
            }}
          >
            <label>
              {t("subject")}
              <input name="subject" autoFocus required maxLength={150} />
            </label>
            <label>
              {t("content")}
              <textarea name="content" required maxLength={10000} />
            </label>
            <ErrorBox error={error} />
            <div className="actions">
              <button disabled={busy}>{t(busy ? "supportSending" : "supportSendRequest")}</button>
              <button
                type="button"
                className="secondary"
                onClick={() => setCompose(false)}
              >
                {t("cancel")}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
