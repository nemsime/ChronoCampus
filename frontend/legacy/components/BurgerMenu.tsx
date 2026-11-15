import { useState, useEffect, useRef } from 'react';
import { Globe, LogOut, Moon, Sun, Check, ChevronDown, User } from 'lucide-react';
import { useTheme } from 'next-themes@0.4.6';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';

interface BurgerMenuProps {
  language: 'en' | 'hy' | 'ru';
  onLanguageChange: (language: 'en' | 'hy' | 'ru') => void;
  onLogout: () => void;
  userName?: string;
  userRole?: 'student' | 'lecturer' | 'admin';
  translations: {
    language: string;
    logout: string;
    darkMode?: string;
    lightMode?: string;
    logoutConfirmTitle: string;
    logoutConfirmMessage: string;
    cancel: string;
    confirmLogout: string;
  };
}

export function BurgerMenu({ language, onLanguageChange, onLogout, userName, userRole, translations }: BurgerMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showLanguageSubmenu, setShowLanguageSubmenu] = useState(false);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const { theme, setTheme } = useTheme();
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowLanguageSubmenu(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const toggleMenu = () => {
    setIsOpen(!isOpen);
    setShowLanguageSubmenu(false);
  };

  const handleLanguageClick = () => {
    setShowLanguageSubmenu(!showLanguageSubmenu);
  };

  const handleLanguageSelect = (lang: 'en' | 'hy' | 'ru') => {
    onLanguageChange(lang);
    setShowLanguageSubmenu(false);
    setIsOpen(false);
  };

  const handleThemeToggle = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const handleLogoutClick = () => {
    setShowLogoutDialog(true);
  };

  const confirmLogout = () => {
    setShowLogoutDialog(false);
    setIsOpen(false);
    onLogout();
  };

  const getLanguageLabel = () => {
    switch (language) {
      case 'en':
        return 'English';
      case 'hy':
        return 'Հայերեն';
      case 'ru':
        return 'Русский';
    }
  };

  const getUserInitials = () => {
    if (!userName) return '?';
    const names = userName.split(' ');
    if (names.length >= 2) {
      return (names[0][0] + names[1][0]).toUpperCase();
    }
    return userName.substring(0, 2).toUpperCase();
  };

  const getRoleColor = () => {
    switch (userRole) {
      case 'admin':
        return 'bg-violet-600 dark:bg-violet-500';
      case 'lecturer':
        return 'bg-blue-600 dark:bg-blue-500';
      case 'student':
        return 'bg-green-600 dark:bg-green-500';
      default:
        return 'bg-gray-600 dark:bg-gray-500';
    }
  };

  return (
    <>
      {/* Backdrop overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-30 bg-black/20 dark:bg-black/40 transition-opacity duration-300"
          onClick={() => {
            setIsOpen(false);
            setShowLanguageSubmenu(false);
          }}
        />
      )}

      {/* User Menu Button */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={toggleMenu}
          className="flex items-center space-x-2 sm:space-x-3 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-all duration-200 group touch-manipulation"
          aria-label="User menu"
        >
          {/* User Avatar */}
          <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full ${getRoleColor()} flex items-center justify-center flex-shrink-0 shadow-md group-hover:shadow-lg transition-shadow duration-200`}>
            {userName ? (
              <span className="text-white text-sm sm:text-base font-semibold">{getUserInitials()}</span>
            ) : (
              <User className="w-5 h-5 text-white" />
            )}
          </div>

          {/* User Info (hidden on mobile) */}
          <div className="hidden md:flex flex-col items-start min-w-0">
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate max-w-[120px]">
              {userName || 'User'}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">
              {userRole || 'User'}
            </span>
          </div>

          {/* Dropdown Icon */}
          <ChevronDown 
            className={`w-4 h-4 text-gray-500 dark:text-gray-400 transition-transform duration-200 flex-shrink-0 ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        {/* Dropdown Menu */}
        <div
          className={`absolute right-0 top-full mt-2 w-72 sm:w-80 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden transition-all duration-300 origin-top-right ${
            isOpen
              ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto'
              : 'opacity-0 scale-95 -translate-y-2 pointer-events-none'
          }`}
          style={{ zIndex: 40 }}
        >
          {/* User Info Header */}
          {userName && (
            <div className="px-4 py-4 border-b border-gray-100 dark:border-gray-700 bg-gradient-to-br from-gray-50 to-white dark:from-gray-800 dark:to-gray-800/50">
              <div className="flex items-center space-x-3">
                <div className={`w-12 h-12 rounded-full ${getRoleColor()} flex items-center justify-center shadow-md`}>
                  <span className="text-white font-semibold">{getUserInitials()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{userName}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{userRole}</p>
                </div>
              </div>
            </div>
          )}

          {/* Language Selection */}
          <div className="border-b border-gray-100 dark:border-gray-700">
            <button
              onClick={handleLanguageClick}
              className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150 group"
            >
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center group-hover:bg-violet-200 dark:group-hover:bg-violet-800/40 transition-colors duration-150">
                  <Globe className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{translations.language}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {getLanguageLabel()}
                  </p>
                </div>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform duration-200 ${
                  showLanguageSubmenu ? 'rotate-180' : ''
                }`}
              />
            </button>

            {/* Language Submenu */}
            <div
              className={`overflow-hidden transition-all duration-300 bg-gray-50 dark:bg-gray-900/50 ${
                showLanguageSubmenu ? 'max-h-44 opacity-100' : 'max-h-0 opacity-0'
              }`}
            >
              <button
                onClick={() => handleLanguageSelect('en')}
                className="w-full px-4 py-3 pl-14 text-left hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors duration-150 flex items-center justify-between"
              >
                <span className="text-sm text-gray-700 dark:text-gray-300">English</span>
                {language === 'en' && <Check className="w-5 h-5 text-violet-600 dark:text-violet-400" />}
              </button>
              <button
                onClick={() => handleLanguageSelect('hy')}
                className="w-full px-4 py-3 pl-14 text-left hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors duration-150 flex items-center justify-between"
              >
                <span className="text-sm text-gray-700 dark:text-gray-300">Հայերեն</span>
                {language === 'hy' && <Check className="w-5 h-5 text-violet-600 dark:text-violet-400" />}
              </button>
              <button
                onClick={() => handleLanguageSelect('ru')}
                className="w-full px-4 py-3 pl-14 text-left hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors duration-150 flex items-center justify-between"
              >
                <span className="text-sm text-gray-700 dark:text-gray-300">Русский</span>
                {language === 'ru' && <Check className="w-5 h-5 text-violet-600 dark:text-violet-400" />}
              </button>
            </div>
          </div>

          {/* Theme Toggle */}
          <button
            onClick={handleThemeToggle}
            className="w-full px-4 py-3.5 flex items-center space-x-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150 border-b border-gray-100 dark:border-gray-700 group"
          >
            <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-gray-700 flex items-center justify-center group-hover:bg-amber-200 dark:group-hover:bg-gray-600 transition-colors duration-150">
              {theme === 'dark' ? (
                <Sun className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              ) : (
                <Moon className="w-5 h-5 text-gray-700" />
              )}
            </div>
            <div className="text-left flex-1">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {theme === 'dark' ? translations.lightMode || 'Light Mode' : translations.darkMode || 'Dark Mode'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              </p>
            </div>
          </button>

          {/* Logout */}
          <button
            onClick={handleLogoutClick}
            className="w-full px-4 py-3.5 flex items-center space-x-3 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors duration-150 group"
          >
            <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center group-hover:bg-red-200 dark:group-hover:bg-red-800/40 transition-colors duration-150">
              <LogOut className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-red-600 dark:text-red-400">{translations.logout}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Sign out of your account</p>
            </div>
          </button>
        </div>
      </div>

      {/* Logout Confirmation Dialog */}
      <Dialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <DialogContent className="sm:max-w-[425px] dark:bg-gray-800 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="dark:text-gray-100">{translations.logoutConfirmTitle}</DialogTitle>
            <DialogDescription className="dark:text-gray-400">
              {translations.logoutConfirmMessage}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowLogoutDialog(false)}
              className="dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              {translations.cancel}
            </Button>
            <Button variant="destructive" onClick={confirmLogout}>
              {translations.confirmLogout}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}