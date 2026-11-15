import { useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { BookOpen, CalendarDays, ChevronLeft, ChevronRight, FlaskConical, LayoutGrid, List, MapPin, Pin, Users, UserRound } from "lucide-react";
import { type Row } from "./api";
import { addDays, dateLabel, localDay, weekStart as mondayOf } from "./common";
import { useLanguage } from "./i18n";

export interface GridConfiguration {
  weekdays: number[];
  ordinary_slots?: number;
  slots: { slot: number; starts_at: string; ends_at: string }[];
}
export type GridConfig = GridConfiguration;
export type ScheduleView = "grid" | "list";
export interface WeekGridProps {
  weekStart: string;
  lessons: Row[];
  grid: GridConfiguration;
  perspective: "group" | "lecturer" | "room";
  parityMode?: "this-week" | "both";
  decorations?: (row: Row) => { badges?: ReactNode; className?: string };
  disabled?: boolean;
  onSelect(row: Row): void;
}

// A new preference key gives the redesigned timeline its own default while
// continuing to remember an explicit grid choice within this design.
const preferenceKey = "chronocampus.schedule-view.v2";
export function useScheduleView(): [ScheduleView, (view: ScheduleView) => void] {
  const [view, setView] = useState<ScheduleView>(() => {
    try {
      const saved = window.localStorage.getItem(preferenceKey);
      if (saved === "grid" || saved === "list") return saved;
    } catch { /* Storage is optional in private browsing. */ }
    return "list";
  });
  return [view, (next) => {
    setView(next);
    try { window.localStorage.setItem(preferenceKey, next); } catch { /* optional */ }
  }];
}

export function ScheduleViewToggle({ value, onChange }: { value: ScheduleView; onChange: (view: ScheduleView) => void }) {
  const { t } = useLanguage();
  return <div className="schedule-view-toggle" role="group" aria-label={t("scheduleView")}>
    <button type="button" className="secondary" aria-pressed={value === "list"} onClick={() => onChange("list")}>
      <List size={16} aria-hidden="true" />{t("listView")}
    </button>
    <button type="button" className="secondary" aria-pressed={value === "grid"} onClick={() => onChange("grid")}>
      <LayoutGrid size={16} aria-hidden="true" />{t("gridView")}
    </button>
  </div>;
}

export function WeekSelector({ weekStart, onChange, min, max }: {
  weekStart: string; onChange: (day: string) => void; min?: string; max?: string;
}) {
  const { t, lang } = useLanguage();
  return <div className="schedule-week-selector">
    <button type="button" className="secondary icon-button" aria-label={t("previousWeek")}
      disabled={!!min && addDays(weekStart, -1) < min} onClick={() => onChange(addDays(weekStart, -7))}>
      <ChevronLeft size={18} aria-hidden="true" />
    </button>
    <label><span className="sr-only">{t("weekOf")}</span>
      <input type="date" value={weekStart} min={min ? mondayOf(min) : undefined} max={max ? mondayOf(max) : undefined} onChange={(event) => {
        if (event.target.value) onChange(mondayOf(event.target.value));
      }} />
    </label>
    <span className="schedule-week-label">{dateLabel(weekStart, lang)} – {dateLabel(addDays(weekStart, 6), lang)}</span>
    <button type="button" className="secondary icon-button" aria-label={t("nextWeek")}
      disabled={!!max && addDays(weekStart, 7) > max} onClick={() => onChange(addDays(weekStart, 7))}>
      <ChevronRight size={18} aria-hidden="true" />
    </button>
  </div>;
}

export function WeekGrid({ weekStart, lessons, grid, perspective, parityMode = "this-week", decorations, onSelect, disabled = false }: WeekGridProps) {
  const { t, lang } = useLanguage();
  const table = useRef<HTMLTableElement>(null);
  const end = addDays(weekStart, parityMode === "both" ? 13 : 6);
  const rows = lessons.filter((row) => row.day >= weekStart && row.day <= end);
  const weekday = (day: string) => (new Date(`${day}T12:00:00`).getDay() + 6) % 7;
  const weekdays = Array.from(new Set([...grid.weekdays, ...rows.map((row) => weekday(row.day))])).sort((a, b) => a - b);
  const ordinary = grid.ordinary_slots ?? Math.max(0, ...grid.slots.map((slot) => slot.slot));
  const slots = new Map(grid.slots.filter((slot) => slot.slot <= ordinary || rows.some((row) => row.slot === slot.slot)).map((slot) => [slot.slot, slot]));
  for (const row of rows) {
    if (!slots.has(row.slot)) slots.set(row.slot, { slot: row.slot, starts_at: row.starts_at, ends_at: row.ends_at });
  }
  const orderedSlots = Array.from(slots.values()).sort((a, b) => a.slot - b.slot);
  const severalTeachers = new Set(rows.map((row) => row.teacher_id)).size > 1;
  const severalRooms = new Set(rows.map((row) => row.room_id)).size > 1;
  const severalGroups = new Set(rows.map((row) => row.course_group_id)).size > 1;
  const today = localDay();
  function navigate(event: KeyboardEvent<HTMLTableElement>) {
    const delta = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[event.key];
    if (!delta) return;
    const cell = (event.target as HTMLElement).closest<HTMLElement>("td[data-grid-row]");
    if (!cell) return;
    const row = Math.max(0, Math.min(orderedSlots.length - 1, Number(cell.dataset.gridRow) + delta[0]));
    const column = Math.max(0, Math.min(weekdays.length - 1, Number(cell.dataset.gridCol) + delta[1]));
    const target = table.current?.querySelector<HTMLElement>(`td[data-grid-row="${row}"][data-grid-col="${column}"]`);
    if (target) {
      event.preventDefault();
      (target.querySelector<HTMLButtonElement>("button:not(:disabled)") || target).focus();
    }
  }
  function card(row: Row) {
    const extra = decorations?.(row);
    const Icon = row.lesson_type === "lab" ? FlaskConical : row.lesson_type === "practical" ? Users : BookOpen;
    return <button type="button" key={`${row.version_id ?? ""}:${row.occurrence_id}:${row.id ?? ""}`}
      className={`grid-lesson grid-lesson-${row.lesson_type}${row.cancelled ? " cancelled" : ""}${extra?.className ? ` ${extra.className}` : ""}`}
      disabled={disabled} onClick={() => onSelect(row)}>
      <span className="grid-lesson-line grid-lesson-kind"><Icon size={14} aria-hidden="true" /><span className="grid-lesson-text">{t(row.lesson_type)}</span></span>
      <strong>{row.subject}</strong>
      {(perspective !== "lecturer" || severalTeachers) && <span className="grid-lesson-line"><UserRound size={13} aria-hidden="true" /><span className="grid-lesson-text">{row.teacher}</span></span>}
      {(perspective !== "room" || severalRooms) && <span className="grid-lesson-line"><MapPin size={13} aria-hidden="true" /><span className="grid-lesson-text">{t("room_id")} {row.room}</span></span>}
      {(perspective !== "group" || severalGroups) && <span className="grid-lesson-line"><Users size={13} aria-hidden="true" /><span className="grid-lesson-text">{row.group}</span></span>}
      {(row.small_group_id || row.lab_group_id) && <small>{[
        row.small_group_id ? `${t("small_group_id")} ${row.small_group ?? row.small_group_id}` : "",
        row.lab_group_id ? `${t("lab_group_id")} ${row.lab_group ?? row.lab_group_id}` : "",
      ].filter(Boolean).join(" · ")}</small>}
      {row.parity && row.parity !== "every" && <small>{t(row.parity)}</small>}
      <span className="grid-lesson-flags">
        {row.pinned && <span className="badge"><Pin size={12} aria-hidden="true" />{t("pinned")}</span>}
        {row.cancelled && <span className="badge warn">{t("cancelled")}</span>}
        {extra?.badges}
      </span>
    </button>;
  }
  return <div className="table-scroll week-grid-region" tabIndex={0} role="region" aria-label={t("weekGridCaption")}>
    <table className="week-grid" style={{ "--week-grid-days": weekdays.length } as CSSProperties} ref={table} onKeyDown={navigate}>
      <caption>{t("weekGridCaption")} · {dateLabel(weekStart, lang)} – {dateLabel(addDays(weekStart, 6), lang)}</caption>
      <colgroup><col className="week-grid-slot-column" />{weekdays.map(day => <col key={day} />)}</colgroup>
      <thead><tr><th scope="col"><span className="week-grid-slot-heading"><CalendarDays size={15} aria-hidden="true" /><span>{t("slot")}</span></span></th>
        {weekdays.map((day) => <th key={day} scope="col" className={addDays(weekStart, day) === today ? "grid-today" : undefined}>
          <time dateTime={addDays(weekStart, day)}>{dateLabel(addDays(weekStart, day), lang)}</time>
        </th>)}
      </tr></thead>
      <tbody>{orderedSlots.map((slot, rowIndex) => <tr key={slot.slot}>
        <th scope="row"><strong>{t("slot")} {slot.slot}</strong><small>{slot.starts_at.slice(0, 5)}–{slot.ends_at.slice(0, 5)}</small></th>
        {weekdays.map((day, columnIndex) => {
          const items = rows.filter((row) => row.slot === slot.slot && weekday(row.day) === day);
          return <td key={day} data-grid-row={rowIndex} data-grid-col={columnIndex} tabIndex={rowIndex === 0 && columnIndex === 0 ? 0 : -1}
            className={addDays(weekStart, day) === today ? "grid-today" : undefined}>
            {parityMode === "both" ? <>
              {items.filter((row) => row.parity === "every" || !row.parity).map(card)}
              <div className="grid-parity-pair">{["numerator", "denominator"].map((parity) => <div key={parity}>
                <span className="grid-parity-label">{t(parity)}</span>
                {items.filter((row) => row.parity === parity).map(card)}
              </div>)}</div>
            </> : items.map(card)}
            {!items.length && <span className="grid-empty" aria-label={t("noLessonInSlot")}>—</span>}
          </td>;
        })}
      </tr>)}</tbody>
    </table>
    <p className="grid-keyboard-hint">{t("gridKeyboardHint")}</p>
  </div>;
}
