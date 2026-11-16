import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { outputFiles } = buildSync({ stdin: { contents: 'export { SemesterTemplateContent } from "./src/system/SemesterTimetable"; export { LanguageProvider } from "./src/system/i18n"; export { useScheduleView } from "./src/system/WeekGrid";', resolveDir: root, loader: "tsx" }, bundle: true, write: false, platform: "node", format: "cjs", jsx: "automatic", external: ["react", "react-dom", "lucide-react"] });
const bundle = { exports: {} };
new Function("require", "module", "exports", outputFiles[0].text)(createRequire(import.meta.url), bundle, bundle.exports);
const { SemesterTemplateContent, LanguageProvider, useScheduleView } = bundle.exports;
test("semester is the personal default; weekly preference remains independent", () => {
  globalThis.window = { localStorage: { getItem: () => null } };
  function Preference() { return React.createElement("span", null, useScheduleView(true)[0]); }
  try { assert.equal(renderToStaticMarkup(React.createElement(Preference)), "<span>semester</span>"); }
  finally { delete globalThis.window; }
});
test("semester grid shows parity, changes and explicit irregular dates in all languages", () => {
  const base = { subject: "Calculus", lesson_type: "lecture", teacher: "Teacher", room: "101", group: "Group 1", weekday: 1, slot: 1 };
  const semester = { term_id: 1, version_id: 1, term: "Autumn", grid: { weekdays: [0,1,2,3,4], slots: [] }, template_rows: [{ ...base, parity: "numerator" }, { ...base, weekday: 2, parity: "every" }], exceptions: [{ ...base, occurrence_id: 1, day: "2026-09-21", reason: "holiday_cancelled" }], irregular: [{ ...base, occurrence_id: 2, day: "2026-10-15" }] };
  for (const lang of ["ru", "hy", "en"]) {
    globalThis.localStorage = { getItem: () => lang };
    try {
      const html = renderToStaticMarkup(React.createElement(LanguageProvider, null, React.createElement(SemesterTemplateContent, { semesters: [semester] })));
      assert.match(html, /Calculus/);
      assert.match(html, /semester-half numerator/);
      assert.match(html, /semester-half denominator/);
      assert.match(html, /semester-every/);
      assert.match(html, /semester-changes/);
      assert.match(html, /semester-irregular/);
      assert.doesNotMatch(html, /template_holiday_cancelled|semesterTimetable|semesterIrregularHelp/);
    } finally { delete globalThis.localStorage; }
  }
});
