// toggle between numerator and denominator weeks.


import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { WeekType, Translations } from '../../types';

interface WeekSelectorProps {
  selectedWeek: 'numerator' | 'denominator';
  onWeekChange: (week: 'numerator' | 'denominator') => void;
  translations: Translations;
}

export function WeekSelector({ selectedWeek, onWeekChange, translations }: WeekSelectorProps) {
  return (
    <div className="mb-3 sm:mb-4">
      <Tabs 
        value={selectedWeek} 
        onValueChange={(value) => onWeekChange(value as 'numerator' | 'denominator')}
      >
        <TabsList className="grid w-full max-w-sm md:max-w-md grid-cols-2 text-xs sm:text-sm h-9 sm:h-10 dark:bg-gray-800 dark:border-gray-700">
          <TabsTrigger value="numerator" className="text-xs sm:text-sm dark:data-[state=active]:bg-gray-700 dark:text-gray-300 dark:data-[state=active]:text-violet-300">
            {translations.numerator}
          </TabsTrigger>
          <TabsTrigger value="denominator" className="text-xs sm:text-sm dark:data-[state=active]:bg-gray-700 dark:text-gray-300 dark:data-[state=active]:text-violet-300">
            {translations.denominator}
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}