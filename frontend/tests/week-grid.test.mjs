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
    contents: 'export { localDay, addDays, weekStart } from "./src/system/common"; export { WeekGrid, useScheduleView } from "./src/system/WeekGrid"; export { LessonList } from "./src/system/Schedule"; export { LanguageProvider } from "./src/system/i18n";',
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
const { localDay, addDays, weekStart, WeekGrid, useScheduleView, LessonList, LanguageProvider } = bundled.exports;

test("timeline defaults on desktop and mobile while remembering an explicit grid choice", () => {
  function Preference() { return React.createElement("span", null, useScheduleView()[0]); }
  try {
    for (const matches of [true, false]) {
      globalThis.window = { localStorage: { getItem: () => null }, matchMedia: () => ({ matches }) };
      assert.equal(renderToStaticMarkup(React.createElement(Preference)), "<span>list</span>");
    }
    globalThis.window.localStorage.getItem = () => "grid";
    assert.equal(renderToStaticMarkup(React.createElement(Preference)), "<span>grid</span>");
    globalThis.window.localStorage.getItem = () => "overview";
    assert.equal(renderToStaticMarkup(React.createElement(Preference)), "<span>overview</span>");
    globalThis.window.localStorage.getItem = () => { throw new Error("storage unavailable"); };
    assert.equal(renderToStaticMarkup(React.createElement(Preference)), "<span>list</span>");
  } finally { delete globalThis.window; }
});

test("server-page timelines order lessons by day and time without mutating their input", () => {
  const rows = [
    { occurrence_id: 2, day: "2026-11-17", slot: 1, starts_at: "09:30", ends_at: "10:50", subject: "Later day", lesson_type: "lecture" },
    { occurrence_id: 3, day: "2026-11-16", slot: 2, starts_at: "11:00", ends_at: "12:20", subject: "Later slot", lesson_type: "lab" },
    { occurrence_id: 1, day: "2026-11-16", slot: 1, starts_at: "09:30", ends_at: "10:50", subject: "First lesson", lesson_type: "lecture", cancelled: true },
  ];
  globalThis.localStorage = { getItem: () => "en" };
  try {
    const html = renderToStaticMarkup(React.createElement(LanguageProvider, null,
      React.createElement(LessonList, { rows, serverPage: true })));
    assert.ok(html.indexOf("First lesson") < html.indexOf("Later slot"));
    assert.ok(html.indexOf("Later slot") < html.indexOf("Later day"));
    assert.equal((html.match(/timeline-dot/g) || []).length, 3);
    assert.match(html, /Cancelled/);
    assert.deepEqual(rows.map(row => row.occurrence_id), [2, 3, 1]);
  } finally { delete globalThis.localStorage; }
});

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

test("long Armenian lesson details and badges stay available in the grid", () => {
  const subject = "Համակարգչային ճարտարագիտություն և տեղեկատվական համակարգեր";
  const teacher = "Աննա Հարությունյան-Հովհաննիսյան";
  const html = render([{ ...lesson, subject, teacher, room: "Լաբորատորիա-համակարգչային-204" }], "hy", {
    decorations: () => ({ badges: React.createElement("span", { className: "badge" }, "Առաջարկից հետո դասը փոխվել է") }),
  });
  assert.ok(html.includes(subject));
  assert.ok(html.includes(teacher));
  assert.match(html, /class="grid-lesson-text"/);
  assert.match(html, /class="week-grid-slot-column"/);
  assert.match(html, /--week-grid-days:2/);
  assert.ok(html.includes("Առաջարկից հետո դասը փոխվել է"));
});

test("cohort overview keeps parallel subgroup teachers and Armenian room codes together", () => {
  const html = render([
    { ...lesson, subject: "Հայոց լեզու", lesson_type: "practical", small_group_id: 1, small_group: "1", teacher: "Հայրապետյան Լ.", room: "9907ա" },
    { ...lesson, id: 2, occurrence_id: 102, subject: "Ֆիզիկա", lesson_type: "lab", small_group_id: 2, small_group: "2", lab_group_id: 3, lab_group: "3", teacher: "Մովսեսյան Ռ.", room: "9204" },
    { ...lesson, id: 3, occurrence_id: 103, course_group_id: 6, group: "T2", subject: "Other cohort" },
    { ...lesson, id: 4, occurrence_id: 104, day: "2026-11-23", subject: "Next week" },
  ], "hy", { layout: "overview" });
  assert.match(html, /university-overview/);
  assert.equal((html.match(/scope="row"/g) || []).length, 2);
  assert.equal((html.match(/scope="colgroup" colSpan="2"/g) || []).length, 1);
  const cards = html.match(/<button\b[\s\S]*?<\/button>/g) || [];
  assert.equal(cards.length, 3);
  const armenian = cards.find(card => card.includes("Հայոց լեզու"));
  assert.match(armenian, /Հայրապետյան Լ\./);
  assert.match(armenian, /9907ա/);
  assert.doesNotMatch(armenian, /Մովսեսյան/);
  const lab = cards.find(card => card.includes("Ֆիզիկա"));
  assert.match(lab, /Մովսեսյան Ռ\./);
  assert.match(lab, /9204/);
  assert.match(lab, /Լաբ/);
  assert.doesNotMatch(html, /Next week/);
  assert.match(html, /08:15–09:25/);
  assert.doesNotMatch(html, /09:30–10:50/);
});

test("cohort overview retains occupied weekend and extra slots and comparison decorations", () => {
  const html = render([{ ...lesson, day: "2026-11-22", slot: 3, cancelled: true }], "en", {
    layout: "overview", perspective: "lecturer", disabled: true,
    decorations: () => ({ badges: React.createElement("span", null, "Removed lesson"), className: "diff-removed-lesson" }),
  });
  assert.match(html, /2026-11-22/);
  assert.match(html, /11:05–12:15/);
  assert.match(html, /Hakobyan/);
  assert.match(html, /R-204/);
  assert.match(html, /diff-removed-lesson/);
  assert.match(html, /Removed lesson/);
  assert.match(html, /disabled=""/);
  assert.match(html, /Cancelled/);
});

test("cohort overview has translated captions and does not invent enrollment counts", () => {
  for (const [lang, caption] of [["en", "Cohort overview"], ["ru", "По группам"], ["hy", "Ըստ խմբերի"]]) {
    const html = render([lesson], lang, { layout: "overview" });
    assert.ok(html.includes(caption));
    assert.doesNotMatch(html, /overviewScope|compact_lecture|undefined|NaN/);
    assert.match(html, /<th scope="row">T1<\/th>/);
  }
});


test("roomless Physical Education stays visible in the grid and timeline without empty filters", () => {
  const pe = { ...lesson, subject: "Ֆիզիկական դաստիարակություն", lesson_type: "pe", teacher: null, teacher_id: null, room: null, room_id: null };
  for (const [language, label, compact] of [["en", "Physical Education", "PE"], ["ru", "Физкультура", "Физ-ра"], ["hy", "Ֆիզիկական դաստիարակություն", "Ֆիզ. դաստ."]]) {
    const regular = render([pe], language);
    const overview = render([pe], language, { layout: "overview" });
    assert.ok(regular.includes(`>${label}</span>`), language);
    assert.ok(overview.includes(`>${compact}</span>`), language);
    assert.doesNotMatch(regular, /lucide-map-pin|lucide-user-round/);
  }
  globalThis.localStorage = { getItem: () => "en" };
  try {
    const timeline = renderToStaticMarkup(React.createElement(LanguageProvider, null, React.createElement(LessonList, { rows: [pe] })));
    assert.match(timeline, /<option value="pe">Physical Education<\/option>/);
    assert.doesNotMatch(timeline, /<option value="(?:null|undefined)"|lucide-map-pin|lucide-user-round/);
  } finally { delete globalThis.localStorage; }
});
