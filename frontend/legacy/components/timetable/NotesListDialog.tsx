import { useState } from 'react';
import { Search, Plus, Pin, Edit, Trash2, X, PinOff } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import { ClassSession, Translations, Language } from '../../types';
import { Note, NoteCategory, NoteFilters } from '../../types/notes';
import { getCategoryMeta, filterNotes, sortNotes, formatNoteDate } from '../../utils/noteHelpers';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';

interface NotesListDialogProps {
  isOpen: boolean;
  selectedClass: ClassSession | null;
  notes: Note[];
  translations: Translations;
  language: Language;
  onClose: () => void;
  onAddNote: () => void;
  onEditNote: (note: Note) => void;
  onDeleteNote: (noteId: string) => void;
  onTogglePin: (noteId: string) => void;
}

export function NotesListDialog({
  isOpen,
  selectedClass,
  notes,
  translations,
  language,
  onClose,
  onAddNote,
  onEditNote,
  onDeleteNote,
  onTogglePin
}: NotesListDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<NoteCategory | undefined>();
  const [deleteConfirmNote, setDeleteConfirmNote] = useState<string | null>(null);

  const categoryMeta = getCategoryMeta(language);

  // Filter and sort notes
  const filters: NoteFilters = {
    searchQuery,
    category: selectedCategory
  };
  const filteredAndSorted = sortNotes(filterNotes(notes, filters));

  /**
   * Handle delete with confirmation
   */
  const handleDeleteClick = (noteId: string) => {
    setDeleteConfirmNote(noteId);
  };

  const confirmDelete = () => {
    if (deleteConfirmNote) {
      onDeleteNote(deleteConfirmNote);
      setDeleteConfirmNote(null);
    }
  };

  if (!selectedClass) return null;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[700px] max-w-[calc(100%-2rem)] h-[90vh] flex flex-col p-0 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          {/* Header */}
          <DialogHeader className="px-4 sm:px-6 pt-6 pb-3">
            <DialogTitle className="text-gray-900 dark:text-gray-100">{translations.notes}</DialogTitle>
            <DialogDescription className="text-gray-600 dark:text-gray-400">
              {selectedClass.subject} - {selectedClass.time}
            </DialogDescription>
          </DialogHeader>

          {/* Search and filters */}
          <div className="px-4 sm:px-6 py-3 space-y-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 flex-shrink-0">
            {/* Search bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={translations.searchNotes}
                className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900/50 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Category filter */}
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
              <button
                onClick={() => setSelectedCategory(undefined)}
                className={`
                  px-3 py-1.5 rounded-full text-xs whitespace-nowrap flex-shrink-0 transition-colors touch-manipulation
                  ${!selectedCategory 
                    ? 'bg-[#225b73] dark:bg-blue-600 text-white shadow-sm' 
                    : 'bg-white dark:bg-gray-900/50 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50'
                  }
                `}
              >
                {translations.showAll}
              </button>
              {(Object.keys(categoryMeta) as NoteCategory[]).map((cat) => {
                const meta = categoryMeta[cat];
                const isSelected = selectedCategory === cat;
                const count = notes.filter(n => n.category === cat).length;
                
                if (count === 0) return null;
                
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`
                      px-3 py-1.5 rounded-full text-xs whitespace-nowrap flex-shrink-0 transition-colors touch-manipulation
                      flex items-center gap-1.5
                      ${isSelected 
                        ? `${meta.bgColor} ${meta.color} border-2 border-current shadow-sm` 
                        : 'bg-white dark:bg-gray-900/50 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50'
                      }
                    `}
                  >
                    <span>{meta.icon}</span>
                    <span>{meta.label}</span>
                    <span className="opacity-60">({count})</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notes list - scrollable area */}
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
            {filteredAndSorted.length > 0 ? (
              <div className="space-y-3 pb-4">
                {filteredAndSorted.map((note) => {
                  const meta = categoryMeta[note.category];
                  
                  return (
                    <div
                      key={note.id}
                      className="bg-white dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-3 sm:p-4 hover:shadow-md dark:hover:shadow-xl transition-shadow"
                    >
                      {/* Note header */}
                      <div className="flex items-start gap-2 mb-2">
                        <Badge
                          className={`${meta.bgColor} ${meta.color} text-xs flex items-center gap-1 flex-shrink-0`}
                        >
                          <span>{meta.icon}</span>
                          <span className="hidden sm:inline">{meta.label}</span>
                        </Badge>
                        
                        {note.isPinned && (
                          <Badge variant="secondary" className="text-xs flex items-center gap-1 dark:bg-gray-700 dark:text-gray-200">
                            <Pin className="w-3 h-3 fill-current" />
                            <span className="hidden sm:inline">{translations.pinned}</span>
                          </Badge>
                        )}
                        
                        <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">
                          {formatNoteDate(note.updatedAt, language)}
                        </span>
                      </div>

                      {/* Note content */}
                      <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words mb-2">
                        {note.content}
                      </p>

                      {/* Actions */}
                      <div className="flex gap-1 pt-2 border-t border-gray-100 dark:border-gray-700">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onTogglePin(note.id)}
                          className="text-xs h-8 dark:text-gray-300 dark:hover:bg-gray-700/50"
                        >
                          {note.isPinned ? (
                            <>
                              <PinOff className="w-3.5 h-3.5 mr-1" />
                              {translations.unpinNote}
                            </>
                          ) : (
                            <>
                              <Pin className="w-3.5 h-3.5 mr-1" />
                              {translations.pinNote}
                            </>
                          )}
                        </Button>
                        
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onEditNote(note)}
                          className="text-xs h-8 dark:text-gray-300 dark:hover:bg-gray-700/50"
                        >
                          <Edit className="w-3.5 h-3.5 mr-1" />
                          {translations.editNote}
                        </Button>
                        
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteClick(note.id)}
                          className="text-xs h-8 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-1" />
                          {translations.deleteNote}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              // Empty state
              <div className="flex flex-col items-center justify-center h-full py-12 text-center">
                <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-700/50 flex items-center justify-center mb-4">
                  <Search className="w-8 h-8 text-gray-400 dark:text-gray-500" />
                </div>
                <p className="text-gray-600 dark:text-gray-400 mb-2">
                  {searchQuery || selectedCategory ? 'No notes found' : translations.noNotes}
                </p>
                {!searchQuery && !selectedCategory && (
                  <Button
                    onClick={onAddNote}
                    variant="outline"
                    size="sm"
                    className="mt-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:bg-gray-900/30"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    {translations.addNote}
                  </Button>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteConfirmNote} onOpenChange={() => setDeleteConfirmNote(null)}>
        <AlertDialogContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-900 dark:text-gray-100">{translations.deleteNote}</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-600 dark:text-gray-400">
              {translations.deleteConfirm}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:bg-gray-900/30">
              {translations.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700 text-white"
            >
              {translations.deleteNote}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}