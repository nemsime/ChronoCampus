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
  stdin: { contents: `export * from './src/system/Accounts'; export * from './src/system/Application'; export * from './src/system/StudentGrouping'; export { LanguageProvider } from './src/system/i18n';`, resolveDir: root, loader: 'tsx' },
  loader: { '.css': 'empty' }, bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom', 'lucide-react'],
});
const compiled = { exports: {} };
new Function('require', 'module', 'exports', outputFiles[0].text)(createRequire(import.meta.url), compiled, compiled.exports);
const { registrationPayload, navigationForRole, pageForRole, StudentGroupingNotice, LanguageProvider } = compiled.exports;

function render(component, props, language) {
  globalThis.localStorage = { getItem: () => language };
  globalThis.window = { localStorage: globalThis.localStorage, matchMedia: () => ({ matches: true }) };
  try { return renderToStaticMarkup(React.createElement(LanguageProvider, null, React.createElement(component, props))); }
  finally { delete globalThis.localStorage; delete globalThis.window; }
}

test('strict registration sends identity fields and the intake, while legacy registration retains its display name', () => {
  const form = new FormData();
  for (const [key, value] of Object.entries({ email: 'student@example.test', display_name: 'Display', course_group_id: '7', surname: 'Սարգսյան', given_name: 'Անի', patronymic: '' })) form.set(key, value);
  assert.deepEqual(registrationPayload(form, false), { email: 'student@example.test', display_name: 'Display', course_group_id: 7 });
  assert.deepEqual(registrationPayload(form, true), { email: 'student@example.test', surname: 'Սարգսյան', given_name: 'Անի', course_group_id: 7 });
  form.set('patronymic', 'Արամի');
  assert.equal(registrationPayload(form, true).patronymic, 'Արամի');
});

test('flag and role control access to the student subgroup and staff roster pages', () => {
  for (const role of ['admin', 'dean', 'lecturer', 'student']) {
    assert.ok(navigationForRole(role).every(item => item.id !== 'studentGroups' && item.id !== 'studentRoster'));
    assert.equal(pageForRole('studentGroups', role, true), role === 'student' ? 'studentGroups' : 'overview');
    assert.equal(pageForRole('studentRoster', role, true), ['admin', 'dean'].includes(role) ? 'studentRoster' : 'overview');
  }
});

test('schedule notice distinguishes pending enrollment and missing subgroup in all three languages', () => {
  const state = { enabled: true, confirmed: false, needs_subgroup: false, pending: true, groups: [], requests: [] };
  for (const [language, pending, unassigned] of [['en', 'awaiting confirmation', 'No subgroup has been assigned'], ['ru', 'ожидает подтверждения', 'Подгруппа не назначена'], ['hy', 'սպասում է հաստատման', 'Ենթախումբ նշանակված չէ']]) {
    assert.ok(render(StudentGroupingNotice, { state }, language).includes(pending));
    assert.ok(render(StudentGroupingNotice, { state: { ...state, confirmed: true, pending: false, needs_subgroup: true } }, language).includes(unassigned));
    assert.equal(render(StudentGroupingNotice, { state: { ...state, enabled: false } }, language), '');
    assert.equal(render(StudentGroupingNotice, { state: { ...state, confirmed: true, pending: false } }, language), '');
  }
});
