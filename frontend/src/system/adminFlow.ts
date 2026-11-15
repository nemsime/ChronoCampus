import type { Row } from "./api";

export type CatalogMode = "university" | "semester";
export const adminAreas = {
  university: [
    { id: "people", resources: ["users"] },
    { id: "academicStructure", resources: ["faculties", "majors", "groups", "subgroups", "lab-groups"] },
    { id: "spaces", resources: ["buildings", "rooms", "equipment"] },
    { id: "subjects", resources: ["subjects"] },
  ],
  semester: [
    { id: "calendarDates", resources: ["terms", "calendars", "periods", "holidays"] },
    { id: "teachingLoad", resources: ["workloads"] },
    { id: "availabilityExceptions", resources: ["availability", "extra-permissions"] },
  ],
};

export function catalogScope(resource: string, rows: Row[], term?: Row): Row[] {
  if (["periods", "holidays", "workloads", "extra-permissions"].includes(resource))
    return term ? rows.filter(row => row.term_id === term.id) : [];
  if (resource === "availability")
    return term ? rows.filter(row => row.starts_on <= term.ends_on && row.ends_on >= term.starts_on) : [];
  return rows;
}

export function eligibleDraftGroups(data: Record<string, Row[]>, termId: string): Row[] {
  const term = data.terms?.find(row => String(row.id) === termId);
  const calendar = data.calendars?.find(row => row.id === term?.calendar_id);
  if (!term || !calendar) return [];
  const majors = new Set((data.majors || []).filter(row => row.study_form === calendar.study_form).map(row => row.id));
  return (data.groups || []).filter(row => majors.has(row.major_id));
}

export function draftInputs(data: Record<string, Row[]>, termId: string, groups: number[]) {
  const term = data.terms?.find(row => String(row.id) === termId);
  const calendar = data.calendars?.find(row => row.id === term?.calendar_id);
  const workloads = (data.workloads || []).filter(row => row.term_id === term?.id && groups.includes(row.course_group_id));
  return { term, calendar, workloads, hours: workloads.reduce((sum, row) => sum + row.semester_hours, 0),
    unconfirmed: !term?.confirmed || !calendar?.confirmed || !calendar?.academic_hours_per_lesson };
}
