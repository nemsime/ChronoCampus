import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Reuse Vite's existing compiler and React; this suite needs no new dependencies.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { outputFiles } = buildSync({
  stdin: {
    contents: 'export { localDay, addDays, weekStart } from "./src/system/common"; export { WeekGrid } from "./src/system/WeekGrid"; export { LanguageProvider } from "./src/system/i18n";',
    resolveDir: root,
    loader: "tsx",
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
  jsx: "automatic",
  external: ["react", "react-dom", "lucide-react"],
});
const bundled = { exports: {} };
new Function("require", "module", "exports", outputFiles[0].text)(createRequire(import.meta.url), bundled, bundled.exports);
const { localDay, addDays, weekStart, WeekGrid, LanguageProvider } = bundled.exports;

test("local day at 01:00 in Yerevan uses the current date", () => {
  const OriginalDate = globalThis.Date;
  const originalTimezone = process.env.TZ;
  process.env.TZ = "Asia/Yerevan";
  globalThis.Date = class extends OriginalDate {
    constructor(...args) { super(...(args.length ? args : ["2026-11-15T21:00:00Z"])); }
  };
  try {
    assert.equal(new Date().getHours(), 1);
    assert.equal(new Date().toISOString().slice(0, 10), "2026-11-15");
    assert.equal(localDay(), "2026-11-16");
    assert.equal(weekStart(), "2026-11-16");
    assert.equal(addDays("2026-12-31", 1), "2027-01-01");
    assert.equal(weekStart("2026-11-15"), "2026-11-09");
  } finally {
    globalThis.Date = OriginalDate;
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  }
});

const lesson = {
  id: 1, occurrence_id: 101, version_id: 4, day: "2026-11-16", slot: 1,
  starts_at: "08:15:00", ends_at: "09:25:00", lesson_type: "lecture",
  subject: "Calculus", teacher: "Hakobyan", teacher_id: 3,
  room: "R-204", room_id: 7, group: "T1", course_group_id: 5,
  parity: "numerator", pinned: false, cancelled: false,
};
const grid = {
  weekdays: [0, 2], ordinary_slots: 2,
  slots: [
    { slot: 1, starts_at: "08:15:00", ends_at: "09:25:00" },
    { slot: 2, starts_at: "09:40:00", ends_at: "10:50:00" },
    { slot: 3, starts_at: "11:05:00", ends_at: "12:15:00" },
  ],
};
function render(lessons, language = "en", extras = {}) {
  globalThis.localStorage = { getItem: () => language };
  try {
    return renderToStaticMarkup(React.createElement(LanguageProvider, null,
      React.createElement(WeekGrid, {
        weekStart: "2026-11-16", lessons, grid, perspective: "group", onSelect: () => {}, ...extras,
      })));
  } finally { delete globalThis.localStorage; }
}

test("grid has table semantics, server slot times and only configured or occupied days", () => {
  const html = render([lesson]);
  assert.match(html, /<caption>Weekly timetable by day and slot/);
  assert.equal((html.match(/scope="col"/g) || []).length, 3);
  assert.equal((html.match(/scope="row"/g) || []).length, 2);
  assert.match(html, /08:15–09:25/);
  assert.doesNotMatch(html, /09:30–10:50/);
  assert.doesNotMatch(html, /11:05–12:15/);
  assert.match(html, /<button[^>]+class="grid-lesson/);
  assert.match(html, />Lecture<\/span>/);
  assert.match(html, /Calculus/);
  assert.match(html, /tabindex="0"/);
  assert.match(html, /data-grid-row="0" data-grid-col="0"/);
});

test("occupied extra slots and weekend lessons are retained; other weeks are excluded", () => {
  const extra = { ...lesson, id: 2, occurrence_id: 102, slot: 3, day: "2026-11-22", subject: "Weekend lab", lesson_type: "lab" };
  const outside = { ...lesson, id: 3, occurrence_id: 103, day: "2026-11-23", subject: "Next week only" };
  const html = render([lesson, extra, outside]);
  assert.equal((html.match(/scope="row"/g) || []).length, 3);
  assert.equal((html.match(/scope="col"/g) || []).length, 4);
  assert.match(html, /11:05–12:15/);
  assert.match(html, /Weekend lab/);
  assert.doesNotMatch(html, /Next week only/);
});

test("stacked subgroup lessons, cancellation, decorations and parity remain textual", () => {
  const html = render([lesson, { ...lesson, id: 2, occurrence_id: 102, subject: "Lab subgroup", small_group_id: 2, small_group: "A", parity: "denominator", pinned: true, cancelled: true }], "en", {
    parityMode: "both",
    decorations: () => ({ badges: React.createElement("span", null, "Moved") }),
  });
  assert.match(html, /Numerator/);
  assert.match(html, /Denominator/);
  assert.match(html, /Lab subgroup/);
  assert.match(html, /Subgroup A/);
  assert.match(html, /Pinned/);
  assert.match(html, /Cancelled/);
  assert.match(html, /Moved/);
});

test("grid labels render in all supported languages", () => {
  for (const [language, label] of [["en", "Weekly timetable"], ["ru", "Расписание по дням"], ["hy", "Դասացուցակ՝ ըստ օրերի"]]) {
    const html = render([lesson], language);
    assert.ok(html.includes(label), language);
    assert.doesNotMatch(html, />weekGridCaption</);
    assert.doesNotMatch(html, />gridKeyboardHint</);
  }
});
