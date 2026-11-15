import { Clock, MapPin, Users, StickyNote, Plus, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { ClassSession, UserRole, Translations, Language } from '../../types';
import { Note } from '../../types/notes';
import { getCategoryMeta, formatNoteDate } from '../../utils/noteHelpers';
import { getSubjectTranslation, getLecturerTranslation } from '../../constants/subjectTranslations';

interface EnhancedClassCardProps {
  session: ClassSession;
  userRole: UserRole;
  translations: Translations;
  language: Language;
  notes: Note[]; // note-eri masiv
  onOpenNotesList: () => void;
  onAddNote: () => void;
}

export function EnhancedClassCard({
  session,
  userRole,
  translations,
  language,
  notes,
  onOpenNotesList,
  onAddNote
}: EnhancedClassCardProps) {
  const categoryMeta = getCategoryMeta(language);
  const pinnedNotes = notes.filter(n => n.isPinned);
  const hasNotes = notes.length > 0;

  return (
    <Card className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-2xl border border-gray-200/60 dark:border-gray-800/60 hover:shadow-[0_12px_48px_rgba(0,0,0,0.16)] dark:hover:shadow-[0_12px_48px_rgba(0,0,0,0.5)] transition-all duration-300 overflow-hidden">
      {/* Card Header: Subject, Groups, Duration */}
      <CardHeader className="p-3 sm:p-4 md:p-6 pb-2 sm:pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0 flex flex-col">
            {/* Subject name with note indicator and week badge */}
            <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2 flex-wrap">
              <CardTitle className="text-[#225b73] dark:text-violet-300 text-sm sm:text-base md:text-lg lg:text-xl truncate">
                {getSubjectTranslation(session.subject, language)}
              </CardTitle>
              
              {/* Week badge (only shown if not 'both') */}
              {session.week !== 'both' && (
                <Badge variant="outline" className="text-xs flex-shrink-0 dark:border-gray-600 dark:text-gray-300">
                  {session.week === 'numerator' ? translations.numeratorShort : translations.denominatorShort}
                </Badge>
              )}
            </div>
            
            {/* Group badges */}
            <div className="flex flex-wrap gap-1 sm:gap-2">
              {session.groups.map((group) => (
                <Badge key={group} variant="secondary" className="text-xs dark:bg-gray-700 dark:text-gray-300">
                  {group}
                </Badge>
              ))}
            </div>
          </div>
          
          {/* Duration badge */}
          <Badge className="bg-[#225b73]/10 dark:bg-violet-500/20 text-[#225b73] dark:text-violet-300 hover:bg-[#225b73]/20 dark:hover:bg-violet-500/30 text-xs whitespace-nowrap flex-shrink-0 h-fit">
            {session.duration}
          </Badge>
        </div>
      </CardHeader>

      {/* Card Content: Time, Classroom, Lecturer/Group, Notes */}
      <CardContent className="p-3 sm:p-4 md:p-6 pt-0 space-y-3">
        {/* Class details grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
          {/* Time */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
              <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{translations.time}</p>
              <p className="text-xs sm:text-sm md:text-base text-gray-900 dark:text-gray-100 truncate">{session.time}</p>
            </div>
          </div>

          {/* Classroom */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 rounded-lg bg-green-50 dark:bg-green-900/20 flex items-center justify-center flex-shrink-0">
              <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 text-green-600 dark:text-green-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{translations.classroom}</p>
              <p className="text-xs sm:text-sm md:text-base text-gray-900 dark:text-gray-100 truncate">{session.classroom}</p>
            </div>
          </div>

          {/* Lecturer (for students) or Group (for lecturers) */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 rounded-lg bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center flex-shrink-0">
              <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                {userRole === 'lecturer' ? translations.group : translations.lecturer}
              </p>
              <p className="text-xs sm:text-sm md:text-base text-gray-900 dark:text-gray-100 truncate">
                {userRole === 'lecturer' ? session.teachingGroup : getLecturerTranslation(session.lecturer, language)}
              </p>
            </div>
          </div>
        </div>

        {/* Notes Section - Only visible for students */}
        {userRole === 'student' && (
          <div className="border-t border-gray-100 dark:border-gray-700 pt-2 sm:pt-3">
            {hasNotes ? (
              <div className="space-y-2">
                {/* Pinned notes preview */}
                {pinnedNotes.length > 0 && (
                  <div className="space-y-1.5">
                    {pinnedNotes.slice(0, 2).map((note) => {
                      const meta = categoryMeta[note.category];
                      return (
                        <div
                          key={note.id}
                          className={`${meta.bgColor} dark:opacity-90 border border-current ${meta.color} rounded-lg p-2.5 cursor-pointer hover:opacity-80 transition-opacity`}
                          onClick={onOpenNotesList}
                        >
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-sm">{meta.icon}</span>
                            <span className="text-xs opacity-75">{formatNoteDate(note.updatedAt, language)}</span>
                          </div>
                          <p className="text-xs line-clamp-2 break-words">
                            {note.content}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2">
                  {/* View all notes button */}
                  <button
                    onClick={onOpenNotesList}
                    className="flex-1 p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors flex items-center justify-between text-gray-700 dark:text-gray-300 touch-manipulation"
                    type="button"
                  >
                    <span className="text-xs sm:text-sm flex items-center gap-1.5">
                      <StickyNote className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      {translations.viewNote} ({notes.length})
                    </span>
                    <ChevronRight className="w-4 h-4" />
                  </button>

                  {/* Add new note button */}
                  <button
                    onClick={onAddNote}
                    className="p-2.5 border border-[#225b73] dark:border-violet-500 rounded-lg hover:bg-[#225b73] dark:hover:bg-violet-600 text-[#225b73] dark:text-violet-400 hover:text-white dark:hover:text-white transition-colors flex items-center justify-center touch-manipulation flex-shrink-0"
                    type="button"
                    title={translations.addNote}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              /* No notes yet - show add note button */
              <button
                onClick={onAddNote}
                className="w-full p-2.5 sm:p-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-[#225b73] dark:hover:border-violet-500 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors flex items-center justify-center gap-1.5 sm:gap-2 text-gray-500 dark:text-gray-400 hover:text-[#225b73] dark:hover:text-violet-400 touch-manipulation"
                type="button"
              >
                <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="text-xs sm:text-sm">{translations.addNote}</span>
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}