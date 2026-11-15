export type NoteCategory = 'general' | 'homework' | 'exam' | 'important' | 'reminder' | 'question';

export interface Note {
  id: string;
  content: string;
  category: NoteCategory;
  createdAt: number;
  updatedAt: number;
  isPinned: boolean;
}

export type ClassNotesMap = Record<number, Note[]>;

export interface NoteFilters {
  category?: NoteCategory;
  searchQuery?: string;
  showPinnedOnly?: boolean;
}

export interface CategoryMeta {
  label: string;
  icon: string;
  color: string;
  bgColor: string;
}

export type CategoryMetaMap = Record<NoteCategory, CategoryMeta>;
