import { useState } from 'react';
import { Button } from './ui/button';
import { Globe } from 'lucide-react';

type Language = 'en' | 'hy' | 'ru';

interface LanguageSelectorProps {
  language: Language;
  onLanguageChange: (lang: Language) => void;
  className?: string;
}

const languageData = {
  en: { 
    name: 'English',
    code: 'EN',
    flagUrl: 'https://flagcdn.com/w40/gb.png'
  },
  hy: { 
    name: 'Հայերեն',
    code: 'ՀԱ',
    flagUrl: 'https://flagcdn.com/w40/am.png'
  },
  ru: { 
    name: 'Русский',
    code: 'РУ',
    flagUrl: 'https://flagcdn.com/w40/ru.png'
  }
};

export function LanguageSelector({ language, onLanguageChange, className }: LanguageSelectorProps) {
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);

  return (
    <div className={`${className}`}>
      <div className="relative">
        {/* Current Language Button - Matching theme toggle style */}
        <Button
          onClick={() => setShowLanguageMenu(!showLanguageMenu)}
          variant="outline"
          size="icon"
          className="h-9 w-9 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-gray-200/50 dark:border-gray-800/50 hover:bg-white dark:hover:bg-gray-900 hover:scale-110 hover:shadow-lg transition-all duration-300 hover:border-gray-300 dark:hover:border-gray-700"
        >
          <Globe className="w-[18px] h-[18px] text-slate-700 dark:text-gray-400 transition-transform duration-300" />
        </Button>

        {/* Dropdown Menu */}
        {showLanguageMenu && (
          <>
            {/* Backdrop to close menu when clicking outside */}
            <div 
              className="fixed inset-0 z-10" 
              onClick={() => setShowLanguageMenu(false)}
            />
            
            <div className="absolute right-0 mt-2 w-40 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md rounded-xl shadow-xl border border-gray-200/50 dark:border-gray-800/50 overflow-hidden z-20 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="p-1.5">
                {(Object.keys(languageData) as Language[]).map((lang) => (
                  <button
                    key={lang}
                    onClick={() => {
                      onLanguageChange(lang);
                      setShowLanguageMenu(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 ${
                      language === lang
                        ? 'bg-gradient-to-r from-[#225b73] to-[#2a6d87] dark:from-blue-600 dark:to-blue-700 shadow-sm text-white'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-800/60 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    <img 
                      src={languageData[lang].flagUrl} 
                      alt={languageData[lang].name} 
                      className="w-6 h-6 object-cover rounded-sm shadow-sm flex-shrink-0" 
                    />
                    <span className="text-sm font-medium">{languageData[lang].name}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}