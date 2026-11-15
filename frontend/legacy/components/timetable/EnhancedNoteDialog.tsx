import { useEffect, useRef } from 'react';
import { Pin, PinOff } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { ClassSession, DayOfWeek, Translations, Language } from '../../types';
import { Note, NoteCategory } from '../../types/notes';
import { getCategoryMeta, formatFullDate } from '../../utils/noteHelpers';

interface EnhancedNoteDialogProps {
  isOpen: boolean;
  selectedClass: ClassSession | null;
  editingNote: Note | null;
  noteContent: string;
  noteCategory: NoteCategory;
  isPinned: boolean;
  translations: Translations;
  language: Language;
  onClose: () => void;
  onNoteChange: (note: string) => void;
  onCategoryChange: (category: NoteCategory) => void;
  onPinnedChange: (pinned: boolean) => void;
  onSave: () => void;
  //onSaveAndAddAnother: () => void;
}

export function EnhancedNoteDialog({
  isOpen,
  selectedClass,
  editingNote,
  noteContent,
  noteCategory,
  isPinned,
  translations,
  language,
  onClose,
  onNoteChange,
  onCategoryChange,
  onPinnedChange,
  onSave,
  //onSaveAndAddAnother
}: EnhancedNoteDialogProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const categoryMeta = getCategoryMeta(language);

  /**
   * Helper to get day label in current language
   */
  const getDayLabel = (day: DayOfWeek): string => {
    const dayMap: Record<DayOfWeek, keyof Translations> = {
      'Monday': 'monday',
      'Tuesday': 'tuesday',
      'Wednesday': 'wednesday',
      'Thursday': 'thursday',
      'Friday': 'friday'
    };
    return translations[dayMap[day]];
  };

  /**
   * Auto-focus textarea when dialog opens
   */
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      setTimeout(() => {
        textareaRef.current?.focus();
        const length = textareaRef.current?.value.length || 0;
        textareaRef.current?.setSelectionRange(length, length);
      }, 100);
    }
  }, [isOpen]);

  if (!selectedClass) return null;

  const isEditing = !!editingNote;
  const charCount = noteContent.length;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-w-[calc(100%-2rem)] max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        {/* Dialog header with class information */}
        <DialogHeader>
          <DialogTitle className="text-gray-900 dark:text-gray-100">
            {editingNote ? translations.editingNote : translations.newNote}
          </DialogTitle>
          <DialogDescription className="text-gray-600 dark:text-gray-400">
            {selectedClass.subject} - {selectedClass.time} ({selectedClass.day})
          </DialogDescription>
        </DialogHeader>

        {/* Note editor */}
        <div className="space-y-3 py-1">
          {/* Category selector */}
          <div className="space-y-1.5">
            <label className="text-xs text-gray-700 dark:text-gray-300 font-medium">
              {translations.category}
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {(Object.keys(categoryMeta) as NoteCategory[]).map((cat) => {
                const meta = categoryMeta[cat];
                const isSelected = noteCategory === cat;
                
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => onCategoryChange(cat)}
                    className={`
                      px-2 py-1.5 rounded-md border-2 transition-all text-[10px]
                      flex flex-col items-center justify-center gap-0.5 touch-manipulation 
                      h-[42px] w-full
                      ${isSelected 
                        ? `${meta.bgColor} border-current ${meta.color} shadow-md dark:shadow-lg font-medium` 
                        : 'bg-white dark:bg-gray-900/50 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                      }
                    `}
                  >
                    <span className="text-sm leading-none">{meta.icon}</span>
                    <span className="text-center leading-tight whitespace-nowrap" lang={language}>{meta.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Note content */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="note-content" className="text-xs text-gray-700 dark:text-gray-300 font-medium">
                {translations.classNotes}
              </label>
              <span className="text-[10px] text-gray-500 dark:text-gray-400">
                {charCount} {translations.characterCount}
              </span>
            </div>
            <Textarea
              ref={textareaRef}
              id="note-content"
              placeholder={translations.addNotesPlaceholder}
              value={noteContent}
              onChange={(e) => onNoteChange(e.target.value)}
              className="min-h-[80px] max-h-[80px] resize-none text-sm bg-white dark:bg-gray-900/50 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-blue-500 dark:focus:border-blue-500 focus:ring-blue-500/20 dark:focus:ring-blue-500/20"
            />
          </div>
        </div>

        {/* Action buttons */}
        <DialogFooter className="flex-col sm:flex-row gap-2">
          {/* Pin/Unpin button */}
          <Button
            variant="outline"
            onClick={() => onPinnedChange(!isPinned)}
            className="w-full sm:w-auto text-sm touch-manipulation flex items-center justify-center gap-1 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-900/30"
          >
            {isPinned ? (
              <>
                <PinOff className="w-4 h-4" />
                {translations.unpinNote}
              </>
            ) : (
              <>
                <Pin className="w-4 h-4" />
                {translations.pinNote}
              </>
            )}
          </Button>
          
          <div className="flex-1" />
          
          <Button
            variant="outline"
            onClick={onClose}
            className="w-full sm:w-auto text-sm touch-manipulation border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-900/30"
          >
            {translations.cancel}
          </Button>
          
          <Button
            className="text-white w-full sm:w-auto text-sm touch-manipulation bg-[#225b73] hover:bg-[#1a4659] dark:bg-gradient-to-r dark:from-blue-600 dark:to-blue-600 dark:hover:from-blue-500 dark:hover:to-blue-500 shadow-md dark:shadow-blue-900/30"
            onClick={onSave}
            disabled={!noteContent.trim()}
          >
            {translations.saveNote}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}