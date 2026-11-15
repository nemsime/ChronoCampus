/*
 * Displays a group selector dropdown to view full group schedules.
 */

import { Translations } from '../../types';

interface ViewModeSelectorProps {
  viewMode: 'my' | 'group';
  selectedGroup: string;
  availableGroups: string[];
  onViewModeChange: (mode: 'my' | 'group') => void;
  onGroupChange: (group: string) => void;
  translations: Translations;
}

export function ViewModeSelector({
  selectedGroup,
  availableGroups,
  onGroupChange,
  translations
}: ViewModeSelectorProps) {
  return (
    <div className="mb-3 sm:mb-4">
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
        {/* Group selector dropdown - always visible */}
        <select
          value={selectedGroup}
          onChange={(e) => onGroupChange(e.target.value)}
          className="w-full max-w-sm md:max-w-md h-9 sm:h-10 px-3 text-xs sm:text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 focus:outline-none focus:ring-2 focus:ring-[#225b73] dark:focus:ring-violet-500 focus:border-transparent transition-all touch-manipulation"
        >
          <option value="">{translations.selectGroup}</option>
          {availableGroups.map((group) => (
            <option key={group} value={group}>
              {group}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}