import { type FormEvent, useEffect, useState } from "react";
import { RefreshCw, UsersRound } from "lucide-react";
import { api } from "./api";
import { ErrorBox, LoadingState, useAction } from "./common";
import { useLanguage } from "./i18n";

type Subgroup = { id: number; label: string; capacity: number };
type Transfer = { id: number; status: "pending" | "approved" | "rejected"; reason: string; target_label: string };
type Grouping = {
  enabled: boolean;
  confirmed: boolean;
  needs_subgroup: boolean;
  pending: boolean;
  current_group_id: number | null;
  current_group_label: string | null;
  groups: Subgroup[];
  requests: Transfer[];
};
type RosterOptions = {
  enabled: boolean;
  terms: { id: number; name: string }[];
  groups: { id: number; group_code: string }[];
  subgroups: (Subgroup & { course_group_id: number })[];
};
type RosterRequests = {
  enrollments: { id: number; display_name: string; email: string; course_group_id: number }[];
  transfers: { id: number; display_name: string; course_group_id: number; target_label: string; reason: string }[];
};
type ImportIssue = { line: number; code: string };
type ImportReport = { imported: number; errors: ImportIssue[]; warnings: ImportIssue[] };

function useStudentGrouping(refreshSignal = 0) {
  const [state, setState] = useState<Grouping>();
  const [failure, setFailure] = useState<unknown>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setFailure(null);
    void api<Grouping>("/student-groups/me")
      .then(data => { if (active) setState(data); })
      .catch(error => { if (active) setFailure(error); });
    return () => { active = false; };
  }, [revision, refreshSignal]);
  return { state, failure, refresh: () => setRevision(value => value + 1) };
}

export function StudentGroupingNotice({ state }: { state?: Grouping }) {
  const { t } = useLanguage();
  if (!state?.enabled) return null;
  if (!state.confirmed) return <p className="notice warning" role="status">{t("rosterEnrollmentPending")}</p>;
  if (state.needs_subgroup) return <p className="notice warning" role="status">{t("rosterSubgroupUnassigned")}</p>;
  return null;
}

export function StudentGroupingStatus({ refreshSignal }: { refreshSignal: number }) {
  const { state, failure } = useStudentGrouping(refreshSignal);
  return <><ErrorBox error={failure} /><StudentGroupingNotice state={state} /></>;
}

function GroupingHeader({ title, refresh, busy }: { title: string; refresh: () => void; busy: boolean }) {
  const { t } = useLanguage();
  return <header className="page-heading page-hero">
    <div className="page-hero-copy"><h1 className="inline"><UsersRound size={26} aria-hidden="true" />{t(title)}</h1></div>
    <button className="secondary" disabled={busy} onClick={refresh}><RefreshCw size={16} aria-hidden="true" />{t("refresh")}</button>
  </header>;
}

export function StudentGroups() {
  const { t } = useLanguage();
  const { state, failure, refresh } = useStudentGrouping();
  const { busy, error, run } = useAction();
  const [submittedFrom, setSubmittedFrom] = useState<Grouping>();
  const groups = state?.groups.filter(group => group.id !== state.current_group_id) ?? [];
  const hasPending = state?.requests.some(request => request.status === "pending");
  const awaitingRefresh = Boolean(submittedFrom && submittedFrom === state);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setSubmittedFrom(undefined);
    void run(async () => {
      await api("/student-groups/transfers", "POST", {
        small_group_id: Number(values.get("small_group_id")),
        reason: String(values.get("reason") ?? "").trim(),
      });
      form.reset();
      setSubmittedFrom(state);
      refresh();
    });
  }

  return <>
    <GroupingHeader title="studentGroups" refresh={refresh} busy={busy} />
    <ErrorBox error={failure} />
    {!state && !failure && <LoadingState />}
    {state?.enabled && <>
      <StudentGroupingNotice state={state} />
      {state.confirmed && <section className="panel">
        <h2>{t("rosterCurrentSubgroup")}</h2>
        {state.current_group_label && <p>{state.current_group_label}</p>}
        {state.current_group_id !== null && groups.length > 0 && !hasPending && !awaitingRefresh && <form className="form-stack" onSubmit={submit} aria-busy={busy}>
          <label>{t("rosterTransferTarget")}
            <select name="small_group_id" required defaultValue="">
              <option value="" disabled>{t("rosterSelectSubgroup")}</option>
              {groups.map(group => <option key={group.id} value={group.id}>{group.label}</option>)}
            </select>
          </label>
          <label>{t("rosterTransferReason")}<textarea name="reason" required maxLength={500} /></label>
          <button disabled={busy}>{t("rosterSubmitTransfer")}</button>
        </form>}
        {!state.current_group_label && !state.needs_subgroup && <p>{t("rosterNoSubgroups")}</p>}
        <ErrorBox error={error} />
        {awaitingRefresh && <p className="notice" role="status">{t("rosterTransferSubmitted")}</p>}
      </section>}
      <section className="panel">
        <h2>{t("rosterTransferHistory")}</h2>
        {state.requests.length === 0 ? <p>{t("rosterNoTransfers")}</p> : <ul>
          {state.requests.map(request => <li key={request.id}>
            <div className="inline"><strong>{request.target_label}</strong><span className="badge">{t("rosterTransfer_" + request.status)}</span></div>
            <p>{request.reason}</p>
          </li>)}
        </ul>}
      </section>
    </>}
  </>;
}

function RosterImportReport({ report }: { report: ImportReport }) {
  const { t } = useLanguage();
  return <div className="notice" role="status">
    <p>{t("rosterImported")} {report.imported}</p>
    {([
      ["rosterImportErrors", report.errors],
      ["rosterImportWarnings", report.warnings],
    ] as const).map(([title, issues]) => issues.length > 0 && <div key={title}>
      <strong>{t(title)}</strong>
      <ul>{issues.map((issue, index) => <li key={index}>
        {issue.line > 0 && <>{t("rosterCsvLine")} {issue.line} · </>}
        {t(issue.code) === issue.code ? t("request_failed") : t(issue.code)}
      </li>)}</ul>
    </div>)}
  </div>;
}

function EnrollmentForm({ enrollment, subgroups, busy, assign }: {
  enrollment: RosterRequests["enrollments"][number];
  subgroups: Subgroup[];
  busy: boolean;
  assign: (id: number, subgroup: number) => void;
}) {
  const { t } = useLanguage();
  return <form className="form-stack" onSubmit={event => {
    event.preventDefault();
    assign(enrollment.id, Number(new FormData(event.currentTarget).get("small_group_id")));
  }}>
    <label>{t("rosterSelectSubgroup")}
      <select name="small_group_id" required defaultValue="" disabled={busy || subgroups.length === 0}>
        <option value="" disabled>{t("rosterSelectSubgroup")}</option>
        {subgroups.map(group => <option key={group.id} value={group.id}>{group.label}</option>)}
      </select>
    </label>
    <button disabled={busy || subgroups.length === 0}>{t("rosterAssign")}</button>
    {subgroups.length === 0 && <p>{t("rosterNoSubgroups")}</p>}
  </form>;
}

export function StudentRoster({ role }: { role: "admin" | "dean" }) {
  const { t } = useLanguage();
  const dean = role === "dean";
  const [options, setOptions] = useState<RosterOptions>();
  const [requests, setRequests] = useState<RosterRequests>();
  const [failure, setFailure] = useState<unknown>(null);
  const [revision, setRevision] = useState(0);
  const [report, setReport] = useState<ImportReport>();
  const [selected, setSelected] = useState<number[]>([]);
  const { busy, error, run } = useAction();
  const refresh = () => setRevision(value => value + 1);

  useEffect(() => {
    let active = true;
    setFailure(null);
    void api<RosterOptions>("/student-roster/options")
      .then(data => { if (active) setOptions(data); })
      .catch(error => { if (active) setFailure(error); });
    if (dean) {
      void api<RosterRequests>("/student-roster/requests")
        .then(data => { if (active) setRequests(data); })
        .catch(error => { if (active) setFailure(error); });
    }
    return () => { active = false; };
  }, [dean, revision]);

  function importRoster(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const file = values.get("csv");
    if (!(file instanceof File)) return;
    setReport(undefined);
    void run(async () => {
      const result = await api<ImportReport>("/student-roster/import", "POST", {
        term_id: Number(values.get("term_id")),
        csv: await file.text(),
      });
      setReport(result);
      refresh();
    });
  }

  function assign(id: number, subgroup: number) {
    void run(async () => {
      await api("/student-roster/enrollments/" + id, "POST", { small_group_id: subgroup });
      setRequests(data => data && { ...data, enrollments: data.enrollments.filter(row => row.id !== id) });
      refresh();
    });
  }

  function decide(approve: boolean) {
    if (!selected.length) return;
    void run(async () => {
      await api("/student-roster/transfers/decision", "POST", { ids: selected, approve });
      setRequests(data => data && { ...data, transfers: data.transfers.filter(row => !selected.includes(row.id)) });
      setSelected([]);
      refresh();
    });
  }

  const cohortLabel = (id: number) => options?.groups.find(group => group.id === id)?.group_code ?? String(id);

  return <>
    <GroupingHeader title="studentRoster" refresh={refresh} busy={busy} />
    <ErrorBox error={failure} />
    <ErrorBox error={error} />
    {!options && !failure && <LoadingState />}
    {options?.enabled && <>
      <section className="panel">
        <h2>{t("rosterImport")}</h2>
        <p>{t("rosterCsvHelp")}</p>
        <p><code className="break-code">group_code,surname,given_name,patronymic,email</code></p>
        <form className="form-stack" onSubmit={importRoster} aria-busy={busy}>
          <label>{t("term_id")}
            <select name="term_id" defaultValue="" required>
              <option value="" disabled>{t("rosterSelectTerm")}</option>
              {options.terms.map(term => <option key={term.id} value={term.id}>{term.name}</option>)}
            </select>
          </label>
          <label>{t("rosterCsvFile")}<input type="file" name="csv" accept=".csv,text/csv" required /></label>
          <button disabled={busy || !options.terms.length}>{t("rosterImport")}</button>
        </form>
        {report && <RosterImportReport report={report} />}
      </section>
      {dean && !requests && !failure && <LoadingState />}
      {dean && requests && <>
        <section className="panel">
          <h2>{t("rosterEnrollments")}</h2>
          {requests.enrollments.length === 0 ? <p>{t("rosterNoEnrollments")}</p> : <ul>
            {requests.enrollments.map(enrollment => <li key={enrollment.id}>
              <p><strong>{enrollment.display_name}</strong> · {cohortLabel(enrollment.course_group_id)} · {enrollment.email}</p>
              <EnrollmentForm enrollment={enrollment} subgroups={options.subgroups.filter(group => group.course_group_id === enrollment.course_group_id)} busy={busy} assign={assign} />
            </li>)}
          </ul>}
        </section>
        <section className="panel">
          <h2>{t("rosterTransferQueue")}</h2>
          {requests.transfers.length === 0 ? <p>{t("rosterNoTransfers")}</p> : <>
            <ul>{requests.transfers.map(request => <li key={request.id}>
              <label className="inline">
                <input type="checkbox" checked={selected.includes(request.id)} disabled={busy}
                  onChange={event => {
                    const checked = event.currentTarget.checked;
                    setSelected(ids => checked ? [...ids, request.id] : ids.filter(id => id !== request.id));
                  }} />
                <span>{request.display_name} · {cohortLabel(request.course_group_id)} · {request.target_label}</span>
              </label>
              <p>{request.reason}</p>
            </li>)}</ul>
            <div className="actions">
              <button type="button" disabled={busy || !selected.length} onClick={() => decide(true)}>{t("rosterApproveSelected")}</button>
              <button type="button" className="secondary" disabled={busy || !selected.length} onClick={() => decide(false)}>{t("rosterRejectSelected")}</button>
            </div>
          </>}
        </section>
      </>}
    </>}
  </>;
}
