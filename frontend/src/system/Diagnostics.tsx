import { useEffect, useState } from "react";
import { api, Row } from "./api";
import { ErrorBox } from "./common";
import { useLanguage } from "./i18n";

function useMonitor(url: string | null, automatic = true) {
  const [data, setData] = useState<Row | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    setData(null);
    setError(null);
    setUpdated(null);
    if (!url) return;
    const read = async () => {
      try {
        const result = await api<Row>(url);
        if (alive) {
          setData(result);
          setError(null);
          setUpdated(new Date());
        }
      } catch (e) {
        if (alive) setError(e);
      } finally {
        if (alive && automatic) timer = setTimeout(read, 4000);
      }
    };
    void read();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [url, automatic, revision]);
  return { data, error, updated, refresh: () => setRevision((v) => v + 1) };
}

export function timestamp(value: string | undefined, lang: string) {
  if (!value) return "—";
  const date = new Date(
    /[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : value + "Z",
  );
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString(lang === "hy" ? "hy-AM" : lang);
}
const seconds = (value: unknown) =>
  typeof value === "number" ? `${value.toFixed(2)} s` : "—";

function Pager({
  data,
  offset,
  setOffset,
}: {
  data: Row;
  offset: number;
  setOffset: (n: number) => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="pagination">
      <button
        className="secondary"
        aria-label={t("previous_page")}
        disabled={offset === 0}
        onClick={() => setOffset(Math.max(0, offset - data.limit))}
      >
        ←
      </button>
      <span>
        {data.total ? offset + 1 : 0}–
        {Math.min(offset + data.limit, data.total)} / {data.total}
      </span>
      <button
        className="secondary"
        aria-label={t("next_page")}
        disabled={offset + data.limit >= data.total}
        onClick={() => setOffset(offset + data.limit)}
      >
        →
      </button>
    </div>
  );
}

export function RunCard({ run }: { run: Row }) {
  const { t, lang } = useLanguage();
  const [now, setNow] = useState(Date.now());
  const active = ["queued", "running"].includes(run.status);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  const progress = run.progress || {};
  const result = run.result || {};
  const summary = run.summary || {};
  const elapsed =
    active && run.started_at
      ? Math.max(0, (now - new Date(run.started_at + "Z").getTime()) / 1000)
      : run.elapsed_seconds;
  const queue =
    run.status === "queued"
      ? Math.max(0, (now - new Date(run.created_at + "Z").getTime()) / 1000)
      : run.queue_seconds;
  const metrics = Object.entries(result.metrics || {}).filter(
    ([, v]) => typeof v === "number",
  );
  const reasonGroups: [string, Record<string, number>][] = [
    ["reasons", summary.reason_counts || {}],
    ["validationFindings", summary.issue_counts || {}],
  ];
  return (
    <article className="run-card">
      <div className="toolbar">
        <h3>
          {t("run")} #{run.id}
        </h3>
        <span
          className={`badge ${run.status === "complete" ? "success" : "warn"}`}
        >
          {t(run.status)}
        </span>
        <span>
          {t(run.algorithm)} · {t("seed")}: {run.seed}
        </span>
      </div>
      <div className="diagnostic-cards">
        <div>
          <small>{t("stage")}</small>
          <strong>{t(progress.stage || run.status)}</strong>
        </div>
        <div>
          <small>{t("duration")}</small>
          <strong>{seconds(elapsed)}</strong>
        </div>
        <div>
          <small>{t("queueTime")}</small>
          <strong>{seconds(queue)}</strong>
        </div>
        <div>
          <small>{t("placedCount")}</small>
          <strong>
            {active
              ? `${progress.placed ?? "—"} / ${progress.total ?? "—"}`
              : `${summary.placed ?? "—"} / ${summary.total ?? "—"}`}
          </strong>
        </div>
      </div>
      <p>
        {t("updated")}:{" "}
        {timestamp(run.updated_at || run.finished_at || run.created_at, lang)}
      </p>
      <p>
        {t("requestId")}:{" "}
        <code className="break-code">{run.request_id || "—"}</code>
      </p>
      {result.error && <p className="notice error">{t(result.error)}</p>}
      <details>
        <summary>{t("details")}</summary>
        <p>
          {t("actor")}: {run.actor_id ?? "—"} · {t("draft")}: #{run.version_id}{" "}
          · revision {run.source_revision}
        </p>
        <p>
          {t("inputHash")}: <code className="break-code">{run.input_hash}</code>
        </p>
        <p>
          {t("comparisonHash")}:{" "}
          <code className="break-code">{run.comparison_hash || "—"}</code>
        </p>
        <p>
          {t("candidateCount")}: {progress.candidate_count ?? "—"} ·{" "}
          {t("preparationTime")}:{" "}
          {seconds(result.preparation_seconds ?? progress.preparation_seconds)}
        </p>
        <p>
          {t("solverStatus")}: <strong>{result.status || "—"}</strong>
        </p>
        <p>{t("solverHelp")}</p>
        {!!progress.events?.length && (
          <>
            <h3>{t("timeline")}</h3>
            <ol className="run-timeline">
              {progress.events.map((event: Row, index: number) => (
                <li key={index}>
                  {t(event.stage)}{" "}
                  <small>+{seconds(event.elapsed_seconds)}</small>
                </li>
              ))}
            </ol>
          </>
        )}
        {!!result.phases?.length && (
          <>
            <h3>{t("phases")}</h3>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{t("stage")}</th>
                    <th>{t("solverStatus")}</th>
                    <th>{t("duration")}</th>
                    <th>{t("quality")}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.phases.map((phase: Row, index: number) => (
                    <tr key={index}>
                      <td>{t(phase.objective)}</td>
                      <td>{phase.status}</td>
                      <td>{seconds(phase.seconds)}</td>
                      <td>{phase.value ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {!!metrics.length && (
          <>
            <h3>{t("quality")}</h3>
            <dl className="metric-list">
              {metrics.map(([key, value]) => (
                <div key={key}>
                  <dt>{t(key)}</dt>
                  <dd>{String(value)}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
        {reasonGroups.map(
          ([heading, reasons]) =>
            !!Object.keys(reasons).length && (
              <div key={heading}>
                <h3>{t(heading)}</h3>
                <ul>
                  {Object.entries(reasons).map(([code, count]) => (
                    <li key={code}>
                      {t(code)}: {count}
                    </li>
                  ))}
                </ul>
              </div>
            ),
        )}
      </details>
    </article>
  );
}

export function RunHistory({ versionId }: { versionId?: number }) {
  const { t, lang } = useLanguage();
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState("");
  const [automatic, setAutomatic] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [comparison, setComparison] = useState<Row[]>([]);
  useEffect(() => {
    setOffset(0);
    setSelected(null);
    setComparison([]);
  }, [versionId]);
  const query = new URLSearchParams({ limit: "20", offset: String(offset) });
  if (versionId) query.set("version_id", String(versionId));
  if (status) query.set("status", status);
  const monitor = useMonitor(`/admin/schedule/runs?${query}`, automatic);
  const detail = useMonitor(
    selected ? `/admin/schedule/runs/${selected}` : null,
    automatic,
  );
  const rows: Row[] = monitor.data?.items || [];
  return (
    <section className="run-history">
      <div className="toolbar">
        <h2>{t("runHistory")}</h2>
        <button
          className="secondary"
          onClick={() => {
            monitor.refresh();
            detail.refresh();
          }}
        >
          {t("refresh")}
        </button>
        <label className="check">
          <input
            type="checkbox"
            checked={automatic}
            onChange={(e) => setAutomatic(e.target.checked)}
          />
          {t("autoRefresh")}
        </label>
      </div>
      <label>
        {t("status")}
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setOffset(0);
          }}
        >
          <option value="">{t("all")}</option>
          {[
            "queued",
            "running",
            "complete",
            "partial",
            "failed",
            "rejected",
            "stale",
            "interrupted",
          ].map((s) => (
            <option key={s} value={s}>
              {t(s)}
            </option>
          ))}
        </select>
      </label>
      <ErrorBox error={monitor.error} />
      {!!monitor.error && monitor.data && <p>{t("staleData")}</p>}
      {!monitor.data && !monitor.error && <p role="status">{t("loading")}</p>}
      {monitor.data && (
        <>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("compare")}</th>
                  <th>{t("run")}</th>
                  <th>{t("day")}</th>
                  <th>{t("algorithm")}</th>
                  <th>{t("status")}</th>
                  <th>{t("placedCount")}</th>
                  <th>{t("duration")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`${t("compare")} #${row.id}`}
                        checked={comparison.some((r) => r.id === row.id)}
                        disabled={
                          ["queued", "running"].includes(row.status) ||
                          (comparison.length === 2 &&
                            !comparison.some((r) => r.id === row.id))
                        }
                        onChange={(e) =>
                          setComparison(
                            e.target.checked
                              ? [...comparison, row]
                              : comparison.filter((r) => r.id !== row.id),
                          )
                        }
                      />
                    </td>
                    <td>
                      <button
                        className="link"
                        onClick={() => setSelected(row.id)}
                      >
                        #{row.id}
                      </button>
                    </td>
                    <td>{timestamp(row.created_at, lang)}</td>
                    <td>
                      {t(row.algorithm)} · {row.seed}
                    </td>
                    <td>{t(row.status)}</td>
                    <td>
                      {["queued", "running"].includes(row.status)
                        ? `${row.progress?.placed ?? "—"} / ${row.progress?.total ?? "—"}`
                        : `${row.summary.placed ?? "—"} / ${row.summary.total ?? "—"}`}
                    </td>
                    <td>{seconds(row.elapsed_seconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!rows.length && <p className="empty">{t("empty")}</p>}
          <Pager data={monitor.data} offset={offset} setOffset={setOffset} />
        </>
      )}
      {comparison.length === 2 && (
        <div className="notice">
          <h3>
            {t("compare")}: #{comparison[0].id} / #{comparison[1].id}
          </h3>
          <p>{t("compareHelp")}</p>
          {(!comparison[0].comparison_hash ||
            comparison[0].comparison_hash !==
              comparison[1].comparison_hash) && (
            <p className="notice warning">{t("differentInputs")}</p>
          )}
          <div className="comparison-grid">
            {comparison.map((row) => (
              <RunCard key={row.id} run={row} />
            ))}
          </div>
        </div>
      )}
      <ErrorBox error={detail.error} />
      {detail.data && <RunCard run={detail.data} />}
    </section>
  );
}

export function Diagnostics() {
  const { t, lang } = useLanguage();
  const [tab, setTab] = useState("events");
  const [automatic, setAutomatic] = useState(true);
  const [offset, setOffset] = useState(0);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const system = useMonitor("/admin/diagnostics/system", automatic);
  const params = new URLSearchParams({
    limit: "50",
    offset: String(offset),
    ...filters,
  });
  const feed = useMonitor(
    tab === "runs"
      ? null
      : `/admin/diagnostics/${tab}${tab === "requests" ? "" : `?${params}`}`,
    automatic,
  );
  const data = system.data;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">CHRONOCAMPUS / OPERATIONS</p>
          <h1>{t("diagnostics")}</h1>
          <p>{t("diagnosticsHelp")}</p>
        </div>
        <button
          className="secondary"
          onClick={() => {
            system.refresh();
            feed.refresh();
          }}
        >
          {t("refresh")}
        </button>
      </div>
      <ErrorBox error={system.error} />
      {!!system.error && data && (
        <p className="notice warning">{t("staleData")}</p>
      )}
      <section className="panel diagnostic-panel">
        <div className="toolbar">
          <label className="check">
            <input
              type="checkbox"
              checked={automatic}
              onChange={(e) => setAutomatic(e.target.checked)}
            />
            {t("autoRefresh")}
          </label>
          <small>
            {t("updated")}: {system.updated?.toLocaleTimeString() || "—"}
          </small>
        </div>
        {data && (
          <div className="diagnostic-cards">
            <div className={data.database.ready ? "health-ok" : "health-error"}>
              <small>{t("database")}</small>
              <strong>
                {t(data.database.ready ? "healthy" : "unhealthy")}
              </strong>
              <small>
                {data.database.latency_ms} ms · {data.database.schema || "—"}
              </small>
            </div>
            <div>
              <small>{t("uptime")}</small>
              <strong>{seconds(data.process.uptime_seconds)}</strong>
              <small>PID {data.process.pid}</small>
            </div>
            <div>
              <small>{t("memoryUsage")}</small>
              <strong>
                {typeof data.process.memory_rss_bytes === "number"
                  ? `${(data.process.memory_rss_bytes / 1048576).toFixed(1)} MiB`
                  : "—"}
              </strong>
              <small>
                {t("cpuTime")}: {seconds(data.process.cpu_seconds)}
              </small>
            </div>
            <div>
              <small>{t("databaseQueries")}</small>
              <strong>{data.process.database_queries.count}</strong>
              <small>
                {t("errors")}: {data.process.database_queries.errors} ·{" "}
                {t("maximum")}:{" "}
                {seconds(data.process.database_queries.max_seconds)}
              </small>
            </div>
            <div>
              <small>{t("requests")}</small>
              <strong>{data.requests.total}</strong>
              <small>
                {t("serverErrors")}: {data.requests.server_errors}
              </small>
            </div>
            <div
              className={data.process.log_write_failures ? "health-error" : ""}
            >
              <small>{t("logFailures")}</small>
              <strong>{data.process.log_write_failures}</strong>
              <small>
                {data.retention.log_backups + 1} ×{" "}
                {Math.round(data.retention.log_file_bytes / 1000000)} MB
              </small>
            </div>
            <div>
              <small>
                {t("queued")} / {t("running")}
              </small>
              <strong>
                {data.generation.statuses.queued || 0} /{" "}
                {data.generation.statuses.running || 0}
              </strong>
              <small>
                {t("failed")}: {data.generation.statuses.failed || 0}
              </small>
            </div>
          </div>
        )}
        <p>{t("processScope")}</p>
      </section>
      <section className="panel diagnostic-panel">
        <div
          className="diagnostic-tabs"
          role="group"
          aria-label={t("diagnostics")}
        >
          {["events", "runs", "audit", "requests"].map((key) => (
            <button
              key={key}
              className={tab === key ? "" : "secondary"}
              aria-pressed={tab === key}
              onClick={() => {
                setTab(key);
                setOffset(0);
                setFilters({});
              }}
            >
              {t(key === "runs" ? "runHistory" : key)}
            </button>
          ))}
        </div>
        {tab === "runs" ? (
          <RunHistory />
        ) : (
          <>
            {tab !== "requests" && (
              <form
                className="diagnostic-filters"
                key={tab}
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = new FormData(e.currentTarget);
                  setFilters(
                    Object.fromEntries(
                      Array.from(form.entries())
                        .filter(([, v]) => v !== "")
                        .map(([k, v]) => [k, String(v)]),
                    ),
                  );
                  setOffset(0);
                }}
              >
                {tab === "events" ? (
                  <>
                    <label>
                      {t("level")}
                      <select name="level">
                        <option value="">{t("all")}</option>
                        {["INFO", "WARNING", "ERROR", "DEBUG"].map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {t("event")}
                      <input name="event" maxLength={80} />
                    </label>
                  </>
                ) : (
                  <>
                    <label>
                      {t("resource")}
                      <input name="resource" maxLength={50} />
                    </label>
                    <label>
                      {t("actor")}
                      <input type="number" min="1" name="actor_id" />
                    </label>
                  </>
                )}
                <label>
                  {t("requestId")}
                  <input name="request_id" maxLength={32} />
                </label>
                <button type="submit" className="secondary">
                  {t("filter")}
                </button>
              </form>
            )}
            <ErrorBox error={feed.error} />
            {!!feed.error && feed.data && <p>{t("staleData")}</p>}
            {tab === "audit" && <p>{t("privateFieldsOmitted")}</p>}
            {feed.data && (
              <>
                {tab === "events" && (
                  <p>
                    {t("buffer")}: {feed.data.capacity} · {t("evicted")}:{" "}
                    {feed.data.evicted}
                  </p>
                )}
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        {(tab === "requests"
                          ? [
                              "action",
                              "resource",
                              "status",
                              "count",
                              "average",
                              "maximum",
                            ]
                          : [
                              "day",
                              tab === "events" ? "level" : "actor",
                              tab === "events" ? "event" : "action",
                              "requestId",
                              "details",
                            ]
                        ).map((key) => (
                          <th key={key}>{t(key)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {feed.data.items.map((row: Row, i: number) =>
                        tab === "requests" ? (
                          <tr key={i}>
                            <td>{row.method}</td>
                            <td>
                              <code>{row.route}</code>
                            </td>
                            <td>{row.status}</td>
                            <td>{row.count}</td>
                            <td>{seconds(row.seconds / row.count)}</td>
                            <td>{seconds(row.max_seconds)}</td>
                          </tr>
                        ) : (
                          <tr key={row.id}>
                            <td>
                              {timestamp(row.timestamp || row.created_at, lang)}
                            </td>
                            <td>
                              {tab === "events"
                                ? row.level
                                : (row.actor_id ?? "—")}
                            </td>
                            <td>
                              <strong>{row.event || row.action}</strong>
                              {row.resource && (
                                <small className="block">
                                  {row.resource} #{row.entity_id}
                                </small>
                              )}
                            </td>
                            <td>
                              <code className="break-code">
                                {row.request_id || "—"}
                              </code>
                            </td>
                            <td>
                              <details>
                                <summary>{t("details")}</summary>
                                <pre className="diagnostic-json">
                                  {JSON.stringify(
                                    tab === "audit" ? row.changes : row,
                                    null,
                                    2,
                                  )}
                                </pre>
                              </details>
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
                {!feed.data.items.length && (
                  <p className="empty">{t("empty")}</p>
                )}
                {tab !== "requests" && (
                  <Pager
                    data={feed.data}
                    offset={offset}
                    setOffset={setOffset}
                  />
                )}
              </>
            )}
          </>
        )}
      </section>
    </>
  );
}
