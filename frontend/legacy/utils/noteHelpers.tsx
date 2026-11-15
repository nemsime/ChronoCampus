import { Note, NoteCategory, NoteFilters, CategoryMetaMap } from '../types/notes';

export function generateNoteId(): string {
  return `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function createNote(content: string, category: NoteCategory = 'general'): Note {
  const now = Date.now();
  return {
    id: generateNoteId(),
    content,
    category,
    createdAt: now,
    updatedAt: now,
    isPinned: false
  };
}

export function updateNote(note: Note, updates: Partial<Note>): Note {
  return {
    ...note,
    ...updates,
    updatedAt: Date.now()
  };
}

export function filterNotes(notes: Note[], filters: NoteFilters): Note[] {
  let filtered = [...notes];

  if (filters.category) {
    filtered = filtered.filter(note => note.category === filters.category);
  }

  if (filters.searchQuery && filters.searchQuery.trim()) {
    const query = filters.searchQuery.toLowerCase();
    filtered = filtered.filter(note => 
      note.content.toLowerCase().includes(query)
    );
  }

  if (filters.showPinnedOnly) {
    filtered = filtered.filter(note => note.isPinned);
  }

  return filtered;
}

export function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    
    return b.updatedAt - a.updatedAt;
  });
}

export function formatNoteDate(timestamp: number, language: string = 'en'): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) {
    return language === 'en' ? 'Just now' : 
           language === 'hy' ? 'Հենց նոր' : 
           'Только что';
  }

  if (diffMins < 60) {
    return language === 'en' ? `${diffMins}m ago` : 
           language === 'hy' ? `${diffMins}ր առաջ` : 
           `${diffMins}м назад`;
  }

  if (diffHours < 24) {
    return language === 'en' ? `${diffHours}h ago` : 
           language === 'hy' ? `${diffHours}ժ առաջ` : 
           `${diffHours}ч назад`;
  }

  if (diffDays < 7) {
    return language === 'en' ? `${diffDays}d ago` : 
           language === 'hy' ? `${diffDays}օ առաջ` : 
           `${diffDays}д назад`;
  }

  const options: Intl.DateTimeFormatOptions = { 
    month: 'short', 
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  };
  
  return date.toLocaleDateString(
    language === 'hy' ? 'hy-AM' : language === 'ru' ? 'ru-RU' : 'en-US',
    options
  );
}

export function formatFullDate(timestamp: number, language: string = 'en'): string {
  const date = new Date(timestamp);
  const locale = language === 'hy' ? 'hy-AM' : language === 'ru' ? 'ru-RU' : 'en-US';
  
  return date.toLocaleString(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function getCategoryMeta(language: string = 'en'): CategoryMetaMap {
  const labels = {
    en: {
      general: 'General',
      homework: 'Homework',
      exam: 'Exam',
      important: 'Important',
      reminder: 'Reminder',
      question: 'Question'
    },
    hy: {
      general: 'Ընդհանուր',
      homework: 'Տնային',
      exam: 'Քննություն',
      important: 'Կարևոր',
      reminder: 'Հիշեցում',
      question: 'Հարց'
    },
    ru: {
      general: 'Общее',
      homework: 'Дом. работа',
      exam: 'Экзамен',
      important: 'Важное',
      reminder: 'Напоминание',
      question: 'Вопрос'
    }
  };

  const currentLabels = labels[language as keyof typeof labels] || labels.en;

  return {
    general: {
      label: currentLabels.general,
      icon: '📝',
      color: 'text-gray-700',
      bgColor: 'bg-gray-100'
    },
    homework: {
      label: currentLabels.homework,
      icon: '📚',
      color: 'text-blue-700',
      bgColor: 'bg-blue-100'
    },
    exam: {
      label: currentLabels.exam,
      icon: '📋',
      color: 'text-red-700',
      bgColor: 'bg-red-100'
    },
    important: {
      label: currentLabels.important,
      icon: '⭐',
      color: 'text-amber-700',
      bgColor: 'bg-amber-100'
    },
    reminder: {
      label: currentLabels.reminder,
      icon: '⏰',
      color: 'text-purple-700',
      bgColor: 'bg-purple-100'
    },
    question: {
      label: currentLabels.question,
      icon: '❓',
      color: 'text-green-700',
      bgColor: 'bg-green-100'
    }
  };
}

export function getNoteStats(notes: Note[]) {
  return {
    total: notes.length,
    pinned: notes.filter(n => n.isPinned).length,
    byCategory: notes.reduce((acc, note) => {
      acc[note.category] = (acc[note.category] || 0) + 1;
      return acc;
    }, {} as Record<NoteCategory, number>)
  };
}