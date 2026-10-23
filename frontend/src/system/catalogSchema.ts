export interface Field {
  key: string;
  type?:
    | "number"
    | "date"
    | "time"
    | "boolean"
    | "password"
    | "select"
    | "reference"
    | "multi"
    | "days"
    | "numbers"
    | "breaks"
    | "weights"
    | "email";
  resource?: string;
  options?: string[];
  optional?: boolean;
  initial?: any;
  min?: number;
  max?: number;
  filter?: string;
}
const text = (key: string, optional = false): Field => ({ key, optional });
const num = (
  key: string,
  initial?: number,
  optional = false,
  min = 1,
): Field => ({ key, type: "number", initial, optional, min });
const ref = (
  key: string,
  resource: string,
  optional = false,
  filter?: string,
): Field => ({ key, type: "reference", resource, optional, filter });
const choice = (key: string, options: string[], initial?: string): Field => ({
  key,
  type: "select",
  options,
  initial: initial ?? options[0],
});
const date = (key: string): Field => ({ key, type: "date" });
const time = (key: string, initial?: string, optional = false): Field => ({
  key,
  type: "time",
  initial,
  optional,
});
const bool = (key: string, initial = false): Field => ({
  key,
  type: "boolean",
  initial,
});
const equipment: Field = {
  key: "equipment_ids",
  type: "multi",
  resource: "equipment",
  initial: [],
};
const membership = [
  ref("course_group_id", "groups"),
  ref("small_group_id", "subgroups", true),
  ref("lab_group_id", "lab-groups", true),
];
const range = [date("starts_on"), date("ends_on")];
const weekday: Field = {
  key: "weekday",
  type: "number",
  optional: true,
  min: 0,
  max: 6,
};
export const catalogSchema: Record<string, Field[]> = {
  faculties: [text("name"), text("code")],
  majors: [
    ref("faculty_id", "faculties"),
    text("name"),
    num("major_code"),
    choice("study_form", ["present", "remote"]),
    num("duration_yrs", 4),
  ],
  groups: [
    ref("major_id", "majors"),
    num("admission_year", new Date().getFullYear()),
    text("group_code"),
    num("capacity"),
  ],
  subgroups: [ref("course_group_id", "groups"), text("label"), num("capacity")],
  "lab-groups": [
    ref("small_group_id", "subgroups"),
    text("label"),
    num("capacity"),
  ],
  buildings: [num("building_number"), text("name"), text("address", true)],
  rooms: [
    ref("building_id", "buildings"),
    text("room_number"),
    num("floor_number", 1, false, -5),
    num("room_on_floor"),
    num("capacity"),
    choice("room_type", ["lecture_hall", "classroom", "lab", "language_lab"]),
    equipment,
  ],
  equipment: [text("name"), text("description", true)],
  subjects: [text("name")],
  users: [
    { key: "email", type: "email" },
    text("display_name"),
    choice("role", ["student", "lecturer", "admin"]),
    bool("is_active", true),
    { key: "password", type: "password", optional: true },
    ...membership.map((f) => ({ ...f, optional: true })),
  ],
  calendars: [
    text("name"),
    choice("study_form", ["present", "remote"]),
    time("first_start", "09:30"),
    num("lesson_minutes", 80),
    num("break_minutes", 10, false, 0),
    { key: "break_overrides", type: "breaks", initial: { "2": 30 } },
    { key: "weekdays", type: "days", initial: [0, 1, 2, 3, 4] },
    num("ordinary_slots", 4),
    time("operating_end", undefined, true),
    num("academic_hours_per_lesson", undefined, true),
    num("academic_hour_minutes", undefined, true),
    num("teaching_weeks", 16),
    choice("lecture_order", ["unconfirmed", "same_day", "off"]),
    {
      key: "quality_weights",
      type: "weights",
      initial: {
        teacher_gaps: 1,
        daily_overload: 1,
        lecture_order: 1,
        preferences: 1,
      },
    },
    bool("confirmed"),
  ],
  terms: [
    text("name"),
    text("academic_year"),
    ...range,
    ref("calendar_id", "calendars"),
    choice("holiday_policy", ["exempt", "strict", "unconfirmed"]),
    num("search_seconds", 60),
    bool("confirmed"),
  ],
  periods: [
    ref("term_id", "terms"),
    ref("course_group_id", "groups", true),
    ...range,
  ],
  holidays: [ref("term_id", "terms"), date("day"), text("name")],
  "extra-permissions": [
    ref("term_id", "terms"),
    ref("course_group_id", "groups", true),
    ...range,
    weekday,
    { key: "slots", type: "numbers", initial: [] },
    time("from_time", "15:50"),
    time("until_time", "18:40"),
    text("reason"),
  ],
  availability: [
    ref("teacher_id", "users", true, "lecturer"),
    ref("room_id", "rooms", true),
    ...range,
    weekday,
    choice("parity", ["every", "numerator", "denominator"]),
    time("from_time", "09:30"),
    time("until_time", "18:40"),
    choice("kind", ["unavailable", "preferred"]),
    text("reason"),
  ],
  workloads: [
    ref("term_id", "terms"),
    ...membership,
    ref("subject_id", "subjects"),
    ref("teacher_id", "users", false, "lecturer"),
    choice("lesson_type", ["lecture", "practical", "lab"]),
    num("semester_hours"),
    choice("assessment", ["none", "exam", "credit"]),
    equipment,
    num("preferred_daily_max", undefined, true),
  ],
};
export const resourceNames = Object.keys(catalogSchema);
