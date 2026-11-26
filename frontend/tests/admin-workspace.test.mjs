import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { outputFiles } = buildSync({
  stdin: { contents: `export { adminAreas, catalogScope, eligibleDraftGroups, draftInputs } from './src/system/adminFlow'; export { launchDraft, DraftWizard } from './src/system/DraftWizard'; export { Catalogs } from './src/system/Catalogs'; export { ApiError } from './src/system/api'; export { RunCard } from './src/system/Diagnostics'; export { adminWords } from './src/system/adminWords'; export { catalogSchema, isCatalogFieldVisible, resourceNames } from './src/system/catalogSchema'; export { navigationForRole, pageForRole } from './src/system/Application'; export { LanguageProvider } from './src/system/i18n';`, resolveDir: root, loader: 'tsx' },
  loader: { '.css': 'empty' }, bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom', 'lucide-react'],
});
const compiled = { exports: {} };
new Function('require', 'module', 'exports', outputFiles[0].text)(createRequire(import.meta.url), compiled, compiled.exports);
const { adminAreas, catalogScope, eligibleDraftGroups, draftInputs, launchDraft, DraftWizard, Catalogs, ApiError, RunCard, adminWords, catalogSchema, isCatalogFieldVisible, resourceNames, navigationForRole, pageForRole, LanguageProvider } = compiled.exports;
const data = {
  terms: [{ id: 1, name: 'Autumn', calendar_id: 4, starts_on: '2026-09-01', ends_on: '2026-12-18', confirmed: true }, { id: 2, name: 'Spring', calendar_id: 5 }],
  calendars: [{ id: 4, name: 'Day classes', study_form: 'present', confirmed: true, academic_hours_per_lesson: 2 }],
  majors: [{ id: 8, study_form: 'present' }, { id: 9, study_form: 'remote' }],
  groups: [{ id: 10, major_id: 8, group_code: 'T1' }, { id: 11, major_id: 9, group_code: 'R1' }],
  workloads: [{ id: 1, term_id: 1, course_group_id: 10, semester_hours: 32 }, { id: 2, term_id: 2, course_group_id: 10, semester_hours: 48 }],
};
const selection = { termId: '1', groups: [10], name: ' Autumn candidate ', algorithm: 'cp_sat', seed: 7 };

function render(component, props, language) {
  globalThis.localStorage = { getItem: () => language };
  globalThis.window = { localStorage: globalThis.localStorage, matchMedia: () => ({ matches: true }) };
  try { return renderToStaticMarkup(React.createElement(LanguageProvider, null, React.createElement(component, props))); }
  finally { delete globalThis.localStorage; delete globalThis.window; }
}

test('admin navigation separates management and setup while preserving role guards and old links', () => {
  const pages = navigationForRole('admin').map(item => item.id);
  assert.ok(pages.includes('university') && pages.includes('semester'));
  assert.ok(!pages.includes('catalogs'));
  assert.equal(pages.filter(page => page === 'feedback').length, 1);
  assert.equal(pageForRole('catalogs', 'admin'), 'university');
  for (const role of ['dean', 'lecturer', 'student']) for (const page of ['university', 'semester', 'catalogs'])
    assert.equal(pageForRole(page, role), 'overview');
});

test('every catalog resource remains reachable in exactly one clearly defined area', () => {
  const resources = Object.values(adminAreas).flatMap(areas => areas.flatMap(area => area.resources));
  assert.deepEqual([...resources].sort(), [...resourceNames].sort());
  assert.equal(new Set(resources).size, resources.length);
  assert.equal(adminAreas.university.length, 4);
  assert.equal(adminAreas.semester.length, 3);
});

test('semester-specific rows cannot mix terms; shared calendars and overlapping availability stay explicit', () => {
  for (const resource of ['workloads', 'periods', 'holidays', 'extra-permissions']) {
    assert.deepEqual(catalogScope(resource, data.workloads, data.terms[0]), [data.workloads[0]]);
    assert.deepEqual(catalogScope(resource, data.workloads), []);
  }
  const intervals = [{ starts_on: '2026-08-01', ends_on: '2026-09-01' }, { starts_on: '2027-01-01', ends_on: '2027-02-01' }];
  assert.deepEqual(catalogScope('availability', intervals, data.terms[0]), [intervals[0]]);
  assert.deepEqual(catalogScope('calendars', data.calendars, data.terms[0]), data.calendars);
});

test('draft review uses compatible groups and the selected term workload only', () => {
  assert.deepEqual(eligibleDraftGroups(data, '1').map(row => row.id), [10]);
  assert.deepEqual(eligibleDraftGroups(data, '2'), []);
  assert.deepEqual(eligibleDraftGroups(data, 'missing'), []);
  const review = draftInputs(data, '1', [10]);
  assert.equal(review.hours, 32);
  assert.equal(review.workloads.length, 1);
  assert.equal(review.unconfirmed, false);
  assert.equal(draftInputs(data, '1', []).hours, 0);
  assert.equal(draftInputs(data, '2', [10]).unconfirmed, true);
});

test('lost generation response retries the same saved draft and idempotency key without publishing', async () => {
  const intent = {}, calls = [], created = [];
  const request = async (url, method, body) => {
    calls.push({ url, method, body });
    if (url === '/admin/schedule/versions') return { id: 15, revision: 4 };
    if (calls.length === 2) throw new TypeError('connection lost');
    return { id: 22, version_id: 15, status: 'queued' };
  };
  await assert.rejects(launchDraft(request, intent, selection, row => created.push(row)), /connection lost/);
  const result = await launchDraft(request, intent, selection, row => created.push(row));
  assert.equal(result.run.id, 22);
  assert.equal(created.length, 1);
  assert.equal(calls.filter(call => call.url === '/admin/schedule/versions').length, 1);
  assert.deepEqual(calls[0].body, { term_id: 1, cohort_ids: [10], name: 'Autumn candidate' });
  assert.deepEqual(calls[1], calls[2]);
  assert.equal(calls[1].body.revision, 4);
  assert.equal(calls[1].body.seed, 7);
  assert.ok(calls[1].body.idempotency_key);
  assert.ok(calls.every(call => !call.url.includes('publish')));
});

test('uncertain draft creation blocks blind retries while definite validation failures remain correctable', async () => {
  for (const failure of [new TypeError('connection lost'), new ApiError(503, 'database_unavailable')]) {
    const intent = {}; let calls = 0;
    const request = async () => { calls++; throw failure; };
    await assert.rejects(launchDraft(request, intent, selection, () => {}));
    await assert.rejects(launchDraft(request, intent, selection, () => {}), /draftCreationUncertain/);
    assert.equal(calls, 1);
  }
  const intent = {};
  await assert.rejects(launchDraft(async () => { throw new ApiError(422, 'invalid_reference'); }, intent, selection, () => {}));
  assert.equal(intent.uncertain, false);
  const result = await launchDraft(async url => url.endsWith('/generate') ? { id: 99 } : { id: 8, revision: 1 }, intent, selection, () => {});
  assert.equal(result.run.id, 99);
});

test('malformed creation response cannot be treated as a saved draft or enqueue generation', async () => {
  const intent = {}; let calls = 0;
  await assert.rejects(launchDraft(async () => { calls++; return {}; }, intent, selection, () => assert.fail('must not report saved')), /draftCreationUncertain/);
  assert.equal(calls, 1);
  assert.equal(intent.uncertain, true);
});

test('management areas and guided draft labels render in RU, HY and EN', () => {
  for (const [language, university, semester] of [['en', 'University', 'Semester setup'], ['ru', 'Университет', 'Подготовка семестра'], ['hy', 'Համալսարան', 'Կիսամյակի կարգավորում']]) {
    assert.ok(render(Catalogs, { mode: 'university' }, language).includes(university));
    assert.ok(render(Catalogs, { mode: 'semester' }, language).includes(semester));
    const wizard = render(DraftWizard, { data, initialTermId: '1', onClose() {}, onCreated() {}, onStarted() {}, onOpenVersion() {} }, language);
    assert.ok(wizard.includes('Autumn'));
    assert.doesNotMatch(wizard, />draftWizardIntro<|>draftSemesterStep<|>draftChooseSemester</);
  }
  for (const [key, texts] of Object.entries(adminWords)) assert.ok(texts.length === 3 && texts.every(text => text.trim()), key);
});


test('a finished generation is not labelled as a complete timetable when lessons remain unplaced', () => {
  const html = render(RunCard, { run: { id: 1, status: 'complete', algorithm: 'cp_sat', seed: 1, summary: { placed: 1, total: 2 }, result: {}, progress: {} } }, 'en');
  assert.match(html, /Generation finished/);
  assert.doesNotMatch(html, /All lessons placed/);
});


test('Physical Education workload has a cohort but no lecturer, subgroup or equipment controls', () => {
  const fields = catalogSchema.workloads;
  const pe = { lesson_type: 'pe' };
  const practical = { lesson_type: 'practical' };
  assert.ok(fields.find(field => field.key === 'lesson_type').options.includes('pe'));
  for (const key of ['small_group_id', 'lab_group_id', 'teacher_id', 'equipment_ids']) {
    const field = fields.find(field => field.key === key);
    assert.equal(isCatalogFieldVisible(field, pe), false, key);
    assert.equal(isCatalogFieldVisible(field, practical), true, key);
  }
  assert.equal(isCatalogFieldVisible(fields.find(field => field.key === 'course_group_id'), pe), true);
  assert.equal(fields.find(field => field.key === 'teacher_id').optional, false);
});
