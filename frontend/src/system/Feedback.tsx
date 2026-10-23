import { useEffect, useState } from "react";
import { Account, api, Row } from "./api";
import { Dialog, ErrorBox, useAction } from "./common";
import { useLanguage } from "./i18n";
export function Feedback({ account }: { account: Account }) {
  const { t, lang } = useLanguage();
  const [threads, setThreads] = useState<Row[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [compose, setCompose] = useState(false);
  const [reply, setReply] = useState("");
  const { busy, error, run } = useAction();
  const refresh = async () => setThreads(await api("/feedback"));
  useEffect(() => {
    void run(refresh);
  }, []);
  const selected = threads.find((row) => row.id === active);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">CHRONOCAMPUS / SUPPORT</p>
          <h1>{t("feedback")}</h1>
        </div>
        <button onClick={() => setCompose(true)}>{t("add")}</button>
      </div>
      <ErrorBox error={error} />
      <div className="support-layout">
        <aside className="panel thread-list">
          {threads.map((thread) => (
            <button
              className={active === thread.id ? "active" : ""}
              key={thread.id}
              onClick={() => {
                setActive(thread.id);
                setReply("");
              }}
            >
              <strong>{thread.subject}</strong>
              <span className="badge">{t(thread.status)}</span>
              <small>
                {new Date(thread.created_at + "Z").toLocaleDateString(
                  lang === "hy" ? "hy-AM" : lang,
                )}
              </small>
            </button>
          ))}
          {!threads.length && <p className="empty">{t("empty")}</p>}
        </aside>
        <section className="panel">
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
                  <span className="badge">{t(selected.status)}</span>
                )}
              </div>
              <div className="messages">
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
                  <button disabled={busy}>{t("reply")}</button>
                </form>
              )}
            </>
          ) : (
            <p className="empty">{t("select")}</p>
          )}
        </section>
      </div>
      {compose && (
        <Dialog labelledBy="feedback-title" onClose={() => setCompose(false)}>
          <h2 id="feedback-title">{t("feedback")}</h2>
          <form
            className="form-stack"
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
              <button disabled={busy}>{t("save")}</button>
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
