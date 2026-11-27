import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Play, Search } from "lucide-react";
import { api, ApiError, type Row } from "./api";
import { type CatalogData, rowLabel } from "./Catalogs";
import { draftInputs, eligibleDraftGroups } from "./adminFlow";
import { Dialog, ErrorBox, LoadingState, useAction } from "./common";
import { useLanguage } from "./i18n";

export interface DraftIntent { version?: Row; key?: string; uncertain?: boolean }
export interface DraftSelection { termId: string; groups: number[]; name: string; algorithm: string; seed: number; roomStability?: boolean }

// Save the server-returned draft before enqueueing. A generation retry must use
// that same draft, revision and idempotency key, even after a lost response.
export async function launchDraft(request: typeof api, intent: DraftIntent, values: DraftSelection, onCreated: (version: Row) => void) {
  if (intent.uncertain) throw new Error("draftCreationUncertain");
  if (!intent.version) {
    try {
      intent.version = await request<Row>("/admin/schedule/versions", "POST", {
        term_id: Number(values.termId), cohort_ids: values.groups, name: values.name.trim(),
      });
      if (!Number.isInteger(intent.version?.id) || !Number.isInteger(intent.version?.revision)) {
        intent.version = undefined;
        throw new Error("draftCreationUncertain");
      }
    } catch (failure) {
      intent.uncertain = !(failure instanceof ApiError) || failure.status >= 500;
      throw failure;
    }
    onCreated(intent.version);
  }
  intent.key ??= crypto.randomUUID();
  const result = await request<Row>(`/admin/schedule/versions/${intent.version.id}/generate`, "POST", {
    revision: intent.version.revision, algorithm: values.algorithm, seed: values.seed, room_stability: values.roomStability ?? true, idempotency_key: intent.key,
  });
  if (!result.id) throw new Error("runResponseMissing");
  return { version: intent.version, run: result };
}

export function DraftWizard({ data, initialTermId = "", onClose, onCreated, onStarted, onOpenVersion, onOpenSetup }: {
  data: CatalogData; initialTermId?: string; onClose: () => void;
  onCreated: (version: Row) => void; onStarted: (version: Row, run: Row) => void;
  onOpenVersion: (id: number) => void; onOpenSetup?: () => void;
}) {
  const { t } = useLanguage();
  const [step, setStep] = useState(0);
  const [termId, setTermId] = useState(data.terms?.some(row => String(row.id) === initialTermId) ? initialTermId : "");
  const [groups, setGroups] = useState<number[]>([]);
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [algorithm, setAlgorithm] = useState("cp_sat");
  const [seed, setSeed] = useState(1);
  const [roomStability, setRoomStability] = useState(true);
  const [created, setCreated] = useState<Row | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const intent = useRef<DraftIntent>({});
  const { busy, error, run } = useAction();
  const eligible = eligibleDraftGroups(data, termId);
  const selected = groups.filter(id => eligible.some(group => group.id === id));
  const inputs = draftInputs(data, termId, selected);
  const visibleGroups = eligible.filter(group => rowLabel(group).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const valid = !!inputs.term && !!inputs.calendar && !!name.trim() && selected.length > 0 && selected.length <= 100 && Number.isInteger(seed) && seed >= 0 && seed <= 2147483647;
  const close = () => created ? onOpenVersion(created.id) : onClose();

  return <Dialog labelledBy="draft-wizard-title" className="draft-wizard-modal" closeDisabled={busy} onClose={close}>
    <div className="draft-wizard-heading"><p className="eyebrow">{t("planner")}</p><h2 id="draft-wizard-title">{t("createDraft")}</h2><p>{t("draftWizardIntro")}</p></div>
    <ol className="draft-wizard-steps" aria-label={t("draftSteps")}>
      {["draftSemesterStep", "draftGroupsStep", "draftReviewStep", "draftGenerateStep"].map((label, index) => <li key={label} aria-current={index === (busy ? 3 : step) ? "step" : undefined} className={index < step ? "done" : ""}>
        <span>{index < step ? <CheckCircle2 size={16} aria-hidden="true" /> : index + 1}</span>{t(label)}
      </li>)}
    </ol>
    <ErrorBox error={error} />
    {uncertain && <p className="notice warning" role="alert">{t("draftCreationUncertain")}</p>}
    {created && !busy && <p className="notice" role="status">{t("draftSavedRetry")}</p>}
    <form onSubmit={event => { event.preventDefault(); if (step < 2) setStep(step + 1); else if (valid && !uncertain) void run(async () => {
      try {
        const result = await launchDraft(api, intent.current, { termId, groups: selected, name, algorithm, seed, roomStability }, version => { setCreated(version); onCreated(version); });
        onStarted(result.version, result.run);
      } finally { setUncertain(!!intent.current.uncertain); }
    }); }}>
      <fieldset disabled={busy || !!created || uncertain} className="draft-wizard-fields">
        {step === 0 && <div className="form-stack">
          <h3>{t("draftChooseSemester")}</h3>
          <label>{t("term_id")}<select required value={termId} onChange={event => { setTermId(event.target.value); setGroups([]); }}>
            <option value="">{t("select")}</option>{(data.terms || []).map(term => <option key={term.id} value={term.id}>{term.name} · {term.starts_on}–{term.ends_on}</option>)}
          </select></label>
          <label>{t("draftName")}<input required maxLength={150} value={name} onChange={event => setName(event.target.value)} /></label>
          {!data.terms?.length && <p className="notice warning">{t("semesterFirst")}</p>}
          {inputs.term && !inputs.calendar && <p className="notice warning">{t("draftMissingCalendar")}</p>}
        </div>}
        {step === 1 && <div className="form-stack">
          <h3>{t("draftChooseGroups")}</h3><p>{inputs.term?.name} · {t(inputs.calendar?.study_form || "present")}</p>
          <label className="search-field"><span className="sr-only">{t("searchGroups")}</span><Search size={16} aria-hidden="true" /><input type="search" value={search} placeholder={t("searchGroups")} onChange={event => setSearch(event.target.value)} /></label>
          <div className="draft-group-list">{visibleGroups.map(group => {
            const major = data.majors?.find(row => row.id === group.major_id);
            const workloadCount = (data.workloads || []).filter(row => row.term_id === inputs.term?.id && row.course_group_id === group.id).length;
            return <label className="draft-group-option" key={group.id}><input type="checkbox" checked={selected.includes(group.id)} disabled={!selected.includes(group.id) && selected.length >= 100}
              onChange={event => setGroups(event.target.checked ? [...selected, group.id] : selected.filter(id => id !== group.id))} /><span><strong>{group.group_code}</strong><small>{major?.name} · {group.admission_year}</small><small>{t("workloads")}: {workloadCount}</small></span></label>;
          })}</div>
          {!visibleGroups.length && <p>{t(eligible.length ? "catalogSearchEmptyTitle" : "draftNoEligibleGroups")}</p>}
          <p className="count-label" role="status">{t("selectedGroups")}: {selected.length} / 100</p>
        </div>}
        {step === 2 && <div className="form-stack">
          <h3>{t("draftReviewTitle")}</h3>
          <dl className="draft-input-summary"><dt>{t("term_id")}</dt><dd>{inputs.term?.name}</dd><dt>{t("name")}</dt><dd>{name}</dd><dt>{t("groups")}</dt><dd>{eligible.filter(group => selected.includes(group.id)).map(rowLabel).join(", ")}</dd><dt>{t("calendar_id")}</dt><dd>{inputs.calendar?.name}</dd><dt>{t("workloads")}</dt><dd>{inputs.workloads.length}</dd><dt>{t("semester_hours")}</dt><dd>{inputs.hours}</dd></dl>
          <p className="notice">{t("draftValidationHelp")}</p>
          {(inputs.unconfirmed || !inputs.workloads.length) && <p className="notice warning">{t(inputs.unconfirmed ? "draftUnconfirmedInputs" : "draftNoWorkload")}</p>}
          {!!inputs.missingPeGroups.length && <p className="notice warning" role="status">
            {t("pe_missing")} {inputs.missingPeGroups.map(rowLabel).join(", ")}
          </p>}
          <details className="draft-advanced"><summary>{t("advancedGeneration")}</summary><div className="form-grid">
            <label>{t("algorithm")}<select value={algorithm} onChange={event => setAlgorithm(event.target.value)}><option value="cp_sat">{t("cp_sat")}</option><option value="greedy_local">{t("greedy_local")}</option></select></label>
            <label>{t("seed")}<input type="number" min={0} max={2147483647} required value={seed} onChange={event => setSeed(Number(event.target.value))} /></label>
            <label><input type="checkbox" checked={roomStability} onChange={e => setRoomStability(e.target.checked)} />{t("room_stability")}</label>
          </div></details>
        </div>}
      </fieldset>
      {busy && <LoadingState label={t("draftStarting")} />}
      <div className="draft-wizard-actions">
        {step > 0 && !created && !uncertain && <button type="button" className="secondary" disabled={busy} onClick={() => setStep(step - 1)}><ArrowLeft size={16} aria-hidden="true" />{t("back")}</button>}
        {onOpenSetup && !created && !uncertain && <button type="button" className="link" disabled={busy} onClick={onOpenSetup}>{t("reviewSemesterSetup")}</button>}
        {created && <button type="button" className="secondary" disabled={busy} onClick={() => onOpenVersion(created.id)}>{t("openSavedDraft")}</button>}
        {uncertain ? <button type="button" disabled={busy} onClick={onClose}>{t("checkExistingDrafts")}</button> : <button type="submit" disabled={busy || (step === 0 ? !inputs.term || !inputs.calendar || !name.trim() : step === 1 ? !selected.length : !valid)}>
          {step === 2 ? <Play size={16} aria-hidden="true" /> : <ArrowRight size={16} aria-hidden="true" />}{t(step === 2 ? created ? "retryGeneration" : "generate" : step === 1 ? "draftReviewStep" : "continue")}
        </button>}
      </div>
    </form>
  </Dialog>;
}
