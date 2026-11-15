import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { outputFiles } = buildSync({
  stdin: {
    contents: `
      export { navigationForRole, pageForRole, defaultPageForRole } from "./src/system/Application";
      export { ScheduleFilters, PersonalSchedule } from "./src/system/Schedule";
      export { DeanTimetables } from "./src/system/Dean";
      export { SuggestionForm, SuggestionStatus } from "./src/system/Suggestions";
      export { deanWords } from "./src/system/deanWords";
      export { catalogSchema } from "./src/system/catalogSchema";
      export { LanguageProvider } from "./src/system/i18n";
    `,
    resolveDir: root, loader: "tsx",
  },
  loader: { ".css": "empty" },
  bundle: true, write: false, platform: "node", format: "cjs", jsx: "automatic",
  external: ["react", "react-dom", "lucide-react"],
});
const bundled = { exports: {} };
new Function("require", "module", "exports", outputFiles[0].text)(createRequire(import.meta.url), bundled, bundled.exports);
const { navigationForRole, pageForRole, defaultPageForRole, ScheduleFilters, PersonalSchedule, DeanTimetables, SuggestionForm, SuggestionStatus, LanguageProvider, deanWords, catalogSchema } = bundled.exports;

function render(component, props = {}, language = "en") {
  globalThis.localStorage = { getItem: key => key === "chronocampus.language" ? language : null };
  globalThis.window = { localStorage: globalThis.localStorage, matchMedia: () => ({ matches: true }) };
  try {
    return renderToStaticMarkup(React.createElement(LanguageProvider, null, React.createElement(component, props)));
  } finally { delete globalThis.localStorage; delete globalThis.window; }
}

test("dean navigation has review and suggestions without administrator pages or personal notes", () => {
  const navigation = navigationForRole("dean");
  assert.deepEqual(navigation.map(item => item.id), ["overview", "timetables", "suggestions", "feedback", "account"]);
  assert.ok(navigation.every(item => item.group !== "navigationAdmin"));
  for (const role of ["student", "lecturer"])
    assert.deepEqual(navigationForRole(role).map(item => item.id), ["overview", "schedule", "feedback", "account"]);
  const admin = navigationForRole("admin");
  assert.ok(admin.some(item => item.id === "suggestions" && item.group === "navigationAdmin"));
  assert.ok(admin.some(item => item.id === "planner"));
});

test("unknown and unauthorized pages resolve to Overview for every role", () => {
  for (const role of ["student", "lecturer", "dean", "admin"]) {
    assert.equal(pageForRole("unknown-page", role), "overview");
    for (const item of navigationForRole(role)) assert.equal(pageForRole(item.id, role), item.id);
  }
  assert.equal(pageForRole("planner", "dean"), "overview");
  assert.equal(pageForRole("schedule", "dean"), "overview");
  assert.equal(pageForRole("timetables", "student"), "overview");
  assert.equal(pageForRole("suggestions", "lecturer"), "overview");
});

test("lecturers open their timetable by default and have no lecturer picker", () => {
  assert.equal(defaultPageForRole("lecturer"), "schedule");
  for (const role of ["student", "admin", "dean"]) assert.equal(defaultPageForRole(role), "overview");
  const props = {
    choices: { teacher_id: [{ id: 8, label: "Another lecturer" }], course_group_id: [{ id: 3, label: "T1" }],
      subject_id: [{ id: 2, label: "Physics" }], lesson_type: [{ id: "lab", label: "lab" }] },
    values: {}, onChange() {},
  };
  const personal = render(ScheduleFilters, { ...props, role: "lecturer" });
  assert.doesNotMatch(personal, /name="teacher_id"|Another lecturer/);
  assert.match(personal, /name="course_group_id"/);
  assert.match(personal, /Physics/);
  assert.match(personal, /name="lesson_type"/);
  assert.match(render(ScheduleFilters, { ...props, role: "admin" }), /name="teacher_id"/);
});

test("personal lecturer timetable explains its scope in all three languages", () => {
  for (const [language, text] of [["en", "Only lessons assigned to you"], ["ru", "только занятия, назначенные вам"], ["hy", "միայն ձեզ նշանակված դասերը"]]) {
    const html = render(PersonalSchedule, { account: { id: 8, role: "lecturer", display_name: "Lecturer" } }, language);
    assert.ok(html.includes(text), language);
    assert.doesNotMatch(html, /lecturerScheduleIntro/);
  }
});

test("dean timetable labels and read-only notice render in RU, HY and EN", () => {
  for (const [language, title, notice] of [["ru", "Расписания", "Режим просмотра"], ["hy", "Դասացուցակներ", "Դիտման ռեժիմ"], ["en", "Timetables", "Read-only"]]) {
    const html = render(DeanTimetables, {}, language);
    assert.ok(html.includes(title));
    assert.ok(html.includes(notice));
    assert.match(html, /role="note"/);
    assert.doesNotMatch(html, /readOnlyBanner|deanIntro/);
    assert.doesNotMatch(html, />Publish<|>Generate<|>Pin</);
  }
});

const version = { id: 12, name: "Faculty draft", term_id: 4, starts_on: "2026-09-01", ends_on: "2026-12-31" };
const facets = {
  filters: { room_id: [{ id: 9, label: "R-240" }], course_group_id: [{ id: 3, label: "T1" }] },
  grid: { 4: { weekdays: [0, 1], slots: [{ slot: 1, starts_at: "08:15:00", ends_at: "09:25:00" }, { slot: 2, starts_at: "09:40:00", ends_at: "10:50:00" }] } },
};
const lesson = { occurrence_id: 103, day: "2026-11-16", slot: 2, room_id: 9, course_group_id: 3 };
test("lesson proposal uses server calendar slots, term boundaries and bounded free text", () => {
  const html = render(SuggestionForm, { version, facets, lesson, onSaved() {}, onCancel() {} });
  assert.match(html, /min="2026-09-01" max="2026-12-31"/);
  assert.match(html, /08:15–09:25/);
  assert.match(html, /09:40–10:50/);
  assert.doesNotMatch(html, /09:30–10:50/);
  assert.match(html, /maxLength="150"/);
  assert.match(html, /maxLength="5000"/);
  assert.match(html, /Move lesson/);
  assert.match(html, /Change room/);
  assert.match(html, /Cancel lesson/);
  assert.match(html, /R-240/);
});

test("general suggestions have no lesson move fields and status badges contain readable text", () => {
  const html = render(SuggestionForm, { version, facets, onSaved() {}, onCancel() {} });
  assert.match(html, /Other/);
  assert.match(html, /T1/);
  assert.doesNotMatch(html, /Proposed date|Proposed slot|Move lesson|Change room|Cancel lesson/);
  for (const [status, text] of [["open", "Open"], ["accepted", "Accepted"], ["rejected", "Rejected"], ["implemented", "Implemented"], ["withdrawn", "Withdrawn"]]) {
    assert.ok(render(SuggestionStatus, { status }).includes(text));
  }
});

test("dean account scope is a conditional faculty field; every new translation has three texts", () => {
  const users = catalogSchema.users;
  assert.ok(users.find(field => field.key === "role").options.includes("dean"));
  assert.deepEqual(users.find(field => field.key === "faculty_id").visibleWhen, { key: "role", value: "dean" });
  for (const [key, value] of Object.entries(deanWords)) {
    assert.equal(value.length, 3, key);
    assert.ok(value.every(text => typeof text === "string" && text.trim()), key);
  }
});

test("dean review has no planner mutation paths and only uses the read-only version API", () => {
  const source = readFileSync(path.join(root, "src/system/Dean.tsx"), "utf8");
  assert.doesNotMatch(source, /\/admin\/schedule|from ["']\.\/Planner["']|["'](?:PUT|DELETE|PATCH|POST)["']/);
  assert.match(source, /\/dean\/versions/);
});
