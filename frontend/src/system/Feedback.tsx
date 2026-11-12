import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Clock3, Inbox, MessageSquare, Plus, RefreshCw, Search, Send } from "lucide-react";
import { Account, api, Row } from "./api";
import { Dialog, EmptyState, ErrorBox, LoadingState, timestampLabel, useAction } from "./common";
import { useLanguage } from "./i18n";
export function Feedback({ account }: { account: Account }) {
  const { t, lang } = useLanguage();
  const [threads, setThreads] = useState<Row[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [compose, setCompose] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
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
  const query = search.trim().toLocaleLowerCase();
  const visible = threads.filter((thread) => (!status || thread.status === status)
    && (!query || String(thread.subject).toLocaleLowerCase().includes(query)));
  const updateThread = (thread: Row) => setThreads((current) => current.some((row) => row.id === thread.id)
    ? current.map((row) => row.id === thread.id ? thread : row)
    : [thread, ...current]);
  const conversation = useRef<HTMLElement>(null);
  const messages = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (messages.current) messages.current.scrollTop = messages.current.scrollHeight;
  }, [active, selected?.messages.length]);
  return (
    <>
      <div className="page-heading page-hero">
        <div className="page-hero-copy">
          <p className="eyebrow">{t("supportEyebrow")}</p>
          <h1>{t("feedback")}</h1>
          <p className="page-subtitle">{t("supportDescription")}</p>
        </div>
        <div className="page-hero-actions">
        <button className="secondary" disabled={busy || loading} onClick={() => void run(refresh)}>
          <RefreshCw size={16} className={loading ? "spin" : undefined} aria-hidden="true" />{t("refresh")}
        </button>
        <button disabled={busy} onClick={() => setCompose(true)}>
          <Plus size={18} aria-hidden="true" />
          {t("supportNewRequest")}
        </button>
        </div>
      </div>
      <dl className="summary-strip support-summary">
        {[
          { icon: Inbox, label: "new" },
          { icon: Clock3, label: "in_progress" },
          { icon: CheckCircle2, label: "closed" },
        ].map(({ icon: Icon, label }) => <div className="summary-item" key={label}>
          <span className={`summary-item-icon status-${label}`}><Icon size={20} aria-hidden="true" /></span>
          <div className="summary-item-copy"><dt className="summary-item-label">{t(label)}</dt><dd className="summary-item-value">{loading ? "—" : threads.filter((thread) => thread.status === label).length}</dd></div>
        </div>)}
      </dl>
      <ErrorBox error={error} />
      <div className="support-layout">
        <aside className="panel thread-list" aria-busy={loading}>
          <div className="thread-list-heading">
            <h2>{t("supportRequests")}</h2>
            <span className="count-label">{visible.length} / {threads.length}</span>
          </div>
          <div className="support-toolbar">
            <label className="support-search">
              <span className="sr-only">{t("supportSearch")}</span>
              <span className="search-field"><Search size={16} aria-hidden="true" /><input type="search" value={search} placeholder={t("supportSearch")} onChange={(event) => setSearch(event.target.value)} /></span>
            </label>
            <label className="support-filter"><span className="sr-only">{t("status")}</span>
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="">{t("all")}</option>
                {["new", "in_progress", "closed"].map((value) => <option key={value} value={value}>{t(value)}</option>)}
              </select>
            </label>
          </div>
          {loading && <LoadingState label={t("supportLoading")} compact />}
          {visible.map((thread) => (
            <button
              className={`thread-item${active === thread.id ? " active" : ""}`}
              key={thread.id}
              aria-pressed={active === thread.id}
              onClick={() => {
                setActive(thread.id);
                requestAnimationFrame(() => {
                  conversation.current?.focus({ preventScroll: true });
                  conversation.current?.scrollIntoView({ block: "start" });
                });
              }}
            >
              <span className="thread-item-title"><MessageSquare size={16} aria-hidden="true" /><strong>{thread.subject}</strong></span>
              <span className="thread-item-meta">
              <span className={`badge${thread.status === "closed" ? " success" : thread.status === "in_progress" ? " warn" : ""}`}>
                {t(thread.status)}
              </span>
              <small>
                {timestampLabel(thread.created_at, lang)}
              </small>
              </span>
            </button>
          ))}
          {!loading && !error && !threads.length && (
            <p className="empty">{t("supportEmptyTitle")}</p>
          )}
          {!loading && threads.length > 0 && !visible.length && <EmptyState icon={Search} title={t("supportNoMatches")} description={t("supportNoMatchesHelp")} />}
        </aside>
        <section className="panel conversation-panel section-target" ref={conversation} tabIndex={-1} aria-label={selected?.subject || t("feedback")}>
          {selected ? (
            <>
              <div className="toolbar conversation-heading">
                <div><p className="eyebrow">{t("supportRequests")} · #{selected.id}</p><h2>{selected.subject}</h2></div>
                {account.role === "admin" ? (
                  <select
                    aria-label={t("status")}
                    value={selected.status}
                    disabled={busy}
                    onChange={(e) =>
                      void run(async () => {
                        const updated = await api<Row>(`/feedback/${selected.id}/status`, "PUT", {
                          status: e.target.value,
                        });
                        updateThread(updated);
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
              <div className="messages" ref={messages} tabIndex={0} role="region" aria-label={t("feedback")}>
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
                      {timestampLabel(message.created_at, lang, true)}
                    </small>
                    <p>{message.content}</p>
                  </article>
                ))}
              </div>
              {selected.status !== "closed" && (
                <form
                  className="form-stack reply-composer"
                  aria-busy={busy}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const threadId = selected.id;
                    const content = drafts[threadId] || "";
                    void run(async () => {
                      const updated = await api<Row>(`/feedback/${threadId}/messages`, "POST", {
                        content,
                      });
                      updateThread(updated);
                      setDrafts((current) => current[threadId] === content
                        ? { ...current, [threadId]: "" } : current);
                    });
                  }}
                >
                  <label>
                    {t("content")}
                    <textarea
                      required
                      maxLength={10000}
                      value={drafts[selected.id] || ""}
                      onChange={(e) => {
                        const content = e.target.value;
                        const threadId = selected.id;
                        setDrafts((current) => ({ ...current, [threadId]: content }));
                      }}
                    />
                  </label>
                  <button disabled={busy}><Send size={16} aria-hidden="true" />{t(busy ? "supportSending" : "reply")}</button>
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
        <Dialog labelledBy="feedback-title" closeDisabled={busy} onClose={() => setCompose(false)}>
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
                updateThread(thread);
                setActive(thread.id);
                setSearch("");
                setStatus("");
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
                disabled={busy}
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
