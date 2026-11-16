import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { outputFiles } = buildSync({ stdin: { contents: 'export { SemesterTemplateContent } from "./src/system/SemesterTimetable"; export { ChangeDrawer, publishedChanges, notificationKey } from "./src/system/ChangeNotifications"; export { LanguageProvider } from "./src/system/i18n"; export { useScheduleView } from "./src/system/WeekGrid";', resolveDir: root, loader: "tsx" }, bundle: true, write: false, platform: "node", format: "cjs", jsx: "automatic", external: ["react", "react-dom", "lucide-react"] });
const bundle = { exports: {} };
new Function("require", "module", "exports", outputFiles[0].text)(createRequire(import.meta.url), bundle, bundle.exports);
const { SemesterTemplateContent, ChangeDrawer, publishedChanges, notificationKey, LanguageProvider, useScheduleView } = bundle.exports;
test("semester is the personal default; weekly preference remains independent", () => {
  globalThis.window = { localStorage: { getItem: () => null } };
  function Preference() { return React.createElement("span", null, useScheduleView(true)[0]); }
  try { assert.equal(renderToStaticMarkup(React.createElement(Preference)), "<span>semester</span>"); }
  finally { delete globalThis.window; }
});
test("semester grid shows parity, changes and explicit irregular dates in all languages", () => {
  const base = { subject: "Calculus", lesson_type: "lecture", teacher: "Teacher", room: "101", group: "Group 1", weekday: 1, slot: 1 };
  const semester = { term_id: 1, version_id: 1, term: "Autumn", grid: { weekdays: [0,1,2,3,4], slots: [] }, template_rows: [{ ...base, parity: "numerator" }, { ...base, weekday: 2, parity: "every" }], exceptions: [{ ...base, occurrence_id: 1, day: "2026-09-21", reason: "holiday_cancelled" }, { ...base, occurrence_id: 3, day: "2026-10-22", reason: "one_time_move", original: {day: "2026-09-01", slot: 1}, change_reason: "Conference" }, { ...base, occurrence_id: 4, day: "2026-10-23", reason: "makeup_pending", unresolved: true, change_reason: "Closure" }], irregular: [{ ...base, occurrence_id: 2, day: "2026-10-15" }] };
  for (const lang of ["ru", "hy", "en"]) {
    globalThis.localStorage = { getItem: () => lang };
    try {
      const html = renderToStaticMarkup(React.createElement(LanguageProvider, null, React.createElement(SemesterTemplateContent, { semesters: [semester] })));
      assert.match(html, /Calculus/);
      assert.match(html, /semester-half numerator/);
      assert.match(html, /semester-half denominator/);
      assert.match(html, /semester-every/);
      assert.ok(html.indexOf('semester-half numerator') < html.indexOf('semester-half denominator'));
      const everyCell = html.match(/class="semester-cell only-every"[\s\S]*?<\/td>/)?.[0];
      assert.ok(everyCell);
      assert.doesNotMatch(everyCell, /semester-half/);
      assert.match(html, /semester-changes/);
      // Change details live in the notification drawer instead of squeezing the grid.
      assert.doesNotMatch(html, /<aside/);
      if (lang === "hy") assert.match(html, /Երկուշաբթի/);
      const drawer = renderToStaticMarkup(React.createElement(LanguageProvider, null, React.createElement(ChangeDrawer, { rows: semester.exceptions, onClose() {} })));
      assert.match(drawer, /Conference/);
      assert.match(drawer, /Closure/);
      assert.match(drawer, /notification-item/);
      assert.doesNotMatch(html, /template_one_time_move|template_makeup_pending/);
      assert.match(html, /semester-irregular/);
      assert.doesNotMatch(html, /template_holiday_cancelled|semesterTimetable|semesterIrregularHelp/);
    } finally { delete globalThis.localStorage; }
  }
});


test("notifications exclude unresolved drafts, keep publication identities and do not mutate data", () => {
  const row = { occurrence_id: 2, day: "2026-11-18", slot: 1, room_id: 4, reason: "one_time_move" };
  const semesters = [{ version_id: 5, term: "Autumn", exceptions: [row, {...row, occurrence_id: 3, unresolved: true}] }, { version_id: 6, term: "Autumn", exceptions: [{...row, day: "2026-11-19"}] }];
  const before = JSON.stringify(semesters);
  const changes = publishedChanges(semesters);
  assert.equal(changes.length, 2);
  assert.equal(changes[0].day, "2026-11-19");
  assert.notEqual(notificationKey(changes[0]), notificationKey(changes[1]));
  assert.equal(JSON.stringify(semesters), before);
});
