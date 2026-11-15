export type UserRole = 'student' | 'lecturer' | 'admin';

export type Language = 'en' | 'hy' | 'ru';

export interface User {
  email: string;
  role: UserRole;
  name?: string;
}

export type WeekType = 'numerator' | 'denominator' | 'both';

export type DayOfWeek = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday';

export interface ClassSession {
  id: number;
  subject: string;
  lecturer: string;
  classroom: string;
  time: string;
  day: DayOfWeek;
  groups: string[];
  duration: string;
  week: WeekType;
  teachingGroup?: string;
}

export type ClassNotes = Record<number, string>;

export type AdminSection = 
  | 'users' 
  | 'subjects' 
  | 'groups' 
  | 'places' 
  | 'reports';

export interface UserData {
  id: number;
  email: string;
  role: UserRole;
  status: 'active' | 'inactive';
  registeredDate: string;
}

export interface Subject {
  id: number;
  name: string;
  code: string;
  credits: number;
  department: string;
}

export interface Group {
  id: number;
  name: string;
  department: string;
  year: number;
  students: number;
}

export interface Classroom {
  id: number;
  number: string;
  campus: number;
  floor: number;
  room: number;
  capacity: number;
}

export interface ScheduleAssignment {
  id: number;
  day: DayOfWeek;
  time: string;
  week: WeekType;
  subject: string;
  lecturer: string;
  groups: string[];
  classroom: string;
}

export interface Translations {
  universityPortal: string;
  studentDashboard: string;
  lecturerDashboard: string;
  adminDashboard: string;
  logout: string;
  language: string;
  logoutConfirmTitle: string;
  logoutConfirmMessage: string;
  confirmLogout: string;
  classTimetable: string;
  manageUniversityTimetable: string;
  viewScheduleAndNotes: string;
  viewTeachingSchedule: string;
  adminAccess: string;
  numerator: string;
  denominator: string;
  numeratorShort: string;
  denominatorShort: string;
  monday: string;
  tuesday: string;
  wednesday: string;
  thursday: string;
  friday: string;
  mondayShort: string;
  tuesdayShort: string;
  wednesdayShort: string;
  thursdayShort: string;
  fridayShort: string;
  time: string;
  classroom: string;
  lecturer: string;
  group: string;
  noClassesScheduled: string;
  classNotes: string;
  addNotesPlaceholder: string;
  cancel: string;
  saveNote: string;
  editNote: string;
  addNote: string;
  deleteNote: string;
  viewNote: string;
  noNotes: string;
  mySchedule: string;
  groupSchedule: string;
  selectGroup: string;
  viewMode: string;
  notes: string;
  newNote: string;
  editingNote: string;
  searchNotes: string;
  category: string;
  pinNote: string;
  unpinNote: string;
  deleteConfirm: string;
  noteDeleted: string;
  noteSaved: string;
  created: string;
  updated: string;
  pinned: string;
  showAll: string;
  filterByCategory: string;
  characterCount: string;
  saveAndAddAnother: string;
}

export type TranslationDict = Record<Language, Translations>;