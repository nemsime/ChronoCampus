import { useState } from 'react';
import { Users, BookOpen, UsersRound, MapPin, MessageSquare, BarChart3, ArrowLeft, GraduationCap } from 'lucide-react';
import { Button } from '../ui/button';
import { BurgerMenu } from '../BurgerMenu';
import { UserManagement } from './UserManagement';
import { SubjectsManagement } from './SubjectsManagement';
import { GroupsManagement } from './GroupsManagement';
import { PlaceManagement } from './PlaceManagement';
import { FeedbackManagement } from './FeedbackManagement';

const translations = {
  en: {
    adminPanel: 'Admin Panel',
    dashboard: 'Dashboard',
    userManagement: 'User Management',
    subjects: 'Subjects',
    semesters: 'Semesters',
    groupsClassrooms: 'Groups & Classrooms',
    placeManagement: 'Schedule & Place Management',
    feedbackManagement: 'Feedback Management',
    logout: 'Logout',
    language: 'Language',
    welcome: 'Welcome to Admin Dashboard',
    manageUniversity: 'Manage all aspects of the university system',
    darkMode: 'Dark',
    lightMode: 'Light',
    backToDashboard: 'Back to Dashboard',
    logoutConfirmTitle: 'Confirm Logout',
    logoutConfirmMessage: 'Are you sure you want to log out?',
    cancel: 'Cancel',
    confirmLogout: 'Yes, Logout',
    usersDesc: 'Manage students, teachers, and administrators',
    subjectsDesc: 'Add and manage subjects and assign teachers',
    groupsDesc: 'Manage student groups and classrooms',
    placeDesc: 'Create and edit class schedules and places',
    feedbackDesc: 'Manage user feedback and suggestions'
  },
  hy: {
    adminPanel: 'Ադմինի Վահանակ',
    dashboard: 'Վահանկ',
    userManagement: 'Օգտատերերի Կառավարում',
    subjects: 'Առարկաներ',
    semesters: 'Կիսամյակներ',
    groupsClassrooms: 'Խմբեր և Լսարաններ',
    placeManagement: 'Ժամանակացույցի և Տեղանքի Կառավարում',
    feedbackManagement: 'Մեկնաբանությունների Կառավարում',
    logout: 'Ելք',
    language: 'Լեզու',
    welcome: 'Բարի գալուստ Ադմինի Վահանակ',
    manageUniversity: 'Կառավարեք համալսարանի համակարգի բոլոր ասպեկտները',
    darkMode: 'Մութ',
    lightMode: 'Լուսավոր',
    backToDashboard: 'Վերադառնալ Վահանակ',
    logoutConfirmTitle: 'Հաստատել Ելքը',
    logoutConfirmMessage: 'Համոզվա՞ծ եք, որ ուզում եք դուրս գալ:',
    cancel: 'Չեղարկել',
    confirmLogout: 'Այո, Դուրս Գալ',
    usersDesc: 'Կառավարել ուսանողներին, ուսուցիչներին և ադմինիստրատորներին',
    subjectsDesc: 'Ավելացնել և կառավարել առարկաները և նշանակել ուսուցիչներ',
    groupsDesc: 'Կառավարել ուսանողական խմբերը և լսարանները',
    placeDesc: 'Ստեղծել և խմբագրել դասացուցակը և տեղանքը',
    feedbackDesc: 'Կառավարել օգտատերերի կարծիքները և առաջարկությունները'
  },
  ru: {
    adminPanel: 'Панель Администратора',
    dashboard: 'Панель управления',
    userManagement: 'Управление Пользователями',
    subjects: 'Предметы',
    semesters: 'Семестры',
    groupsClassrooms: 'Группы и Аудитории',
    placeManagement: 'Управление Расписанием и Местами',
    feedbackManagement: 'Управление Отзывами',
    logout: 'Выйти',
    language: 'Язык',
    welcome: 'Добро пожаловать в Панель Администратора',
    manageUniversity: 'Управляйте всеми аспектами университетской системы',
    darkMode: 'Темная',
    lightMode: 'Светлая',
    backToDashboard: 'Назад к Панели',
    logoutConfirmTitle: 'Подтверждение Выхода',
    logoutConfirmMessage: 'Вы уверены, что хотите выйти?',
    cancel: 'Отмена',
    confirmLogout: 'Да, Выйти',
    usersDesc: 'Управляйте студентами, преподавателями и администраторами',
    subjectsDesc: 'Добавляйте и управляйте предметами и назначайте преподавателей',
    groupsDesc: 'Управляйте студенческими группами и аудиториями',
    placeDesc: 'Создавайте и редактируйте расписание занятий и места',
    feedbackDesc: 'Управляйте отзывами и предложениями пользователей'
  }
};

interface AdminDashboardProps {
  onLogout: () => void;
  language: 'en' | 'hy' | 'ru';
  onLanguageChange: (language: 'en' | 'hy' | 'ru') => void;
  userName?: string;
}

type ActiveTab = 'dashboard' | 'users' | 'subjects' | 'groups' | 'place' | 'feedback';

export function AdminDashboard({ onLogout, language, onLanguageChange, userName }: AdminDashboardProps) {
  const t = translations[language];
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');

  const menuItems = [
    { id: 'dashboard' as const, label: t.dashboard, icon: BarChart3, desc: '' },
    { id: 'users' as const, label: t.userManagement, icon: Users, desc: t.usersDesc },
    { id: 'subjects' as const, label: t.subjects, icon: BookOpen, desc: t.subjectsDesc },
    { id: 'groups' as const, label: t.groupsClassrooms, icon: UsersRound, desc: t.groupsDesc },
    { id: 'place' as const, label: t.placeManagement, icon: MapPin, desc: t.placeDesc },
    { id: 'feedback' as const, label: t.feedbackManagement, icon: MessageSquare, desc: t.feedbackDesc }
  ];

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100 dark:from-gray-950 dark:via-slate-950 dark:to-gray-950 relative overflow-hidden">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none"></div>

      {/* Top Header Bar */}
      <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-2xl border-b border-gray-200/60 dark:border-gray-800/60 px-4 sm:px-6 lg:px-8 py-4 sticky top-0 z-20 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[14px] bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 dark:from-slate-800 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center shadow-lg">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-gray-900 dark:text-gray-100 font-semibold tracking-tight">
                {t.adminPanel}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">ChronoCampus</p>
            </div>
          </div>
          <BurgerMenu
            language={language}
            onLanguageChange={onLanguageChange}
            onLogout={onLogout}
            userName={userName}
            userRole="admin"
            translations={t}
          />
        </div>
      </div>

      {/* Main Content */}
      <main className="relative z-10">
        {activeTab === 'dashboard' && (
          <div className="p-4 sm:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto">
              {/* Welcome Section */}
              <div className="mb-8">
                <h1 className="text-[28px] font-semibold text-gray-900 dark:text-gray-100 mb-2.5 tracking-tight">
                  {t.welcome}
                </h1>
                <p className="text-[15px] text-gray-600 dark:text-gray-400 leading-relaxed">
                  {t.manageUniversity}
                </p>
              </div>
              
              {/* Menu Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {menuItems.slice(1).map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id)}
                      className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-2xl p-6 rounded-2xl border border-gray-200/60 dark:border-gray-800/60 hover:shadow-[0_12px_48px_rgba(0,0,0,0.16)] dark:hover:shadow-[0_12px_48px_rgba(0,0,0,0.5)] transition-all duration-300 text-left group hover:scale-[1.02]"
                    >
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-700/10 to-slate-900/10 dark:from-slate-700/20 dark:to-slate-900/20 flex items-center justify-center mb-4 group-hover:from-slate-700 group-hover:to-slate-900 dark:group-hover:from-slate-700 dark:group-hover:to-slate-900 transition-all duration-300">
                        <Icon className="w-6 h-6 text-slate-700 dark:text-slate-300 group-hover:text-white transition-colors duration-300" />
                      </div>
                      <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">
                        {item.label}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                        {item.desc}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div>
            <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-2xl border-b border-gray-200/60 dark:border-gray-800/60 px-4 sm:px-6 lg:px-8 py-4 shadow-sm">
              <Button
                onClick={() => setActiveTab('dashboard')}
                variant="outline"
                className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-gray-200/50 dark:border-gray-800/50 hover:bg-white dark:hover:bg-gray-900 transition-all duration-300"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                {t.backToDashboard}
              </Button>
            </div>
            <UserManagement language={language} />
          </div>
        )}

        {activeTab === 'subjects' && (
          <div>
            <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-2xl border-b border-gray-200/60 dark:border-gray-800/60 px-4 sm:px-6 lg:px-8 py-4 shadow-sm">
              <Button
                onClick={() => setActiveTab('dashboard')}
                variant="outline"
                className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-gray-200/50 dark:border-gray-800/50 hover:bg-white dark:hover:bg-gray-900 transition-all duration-300"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                {t.backToDashboard}
              </Button>
            </div>
            <SubjectsManagement language={language} />
          </div>
        )}

        {activeTab === 'groups' && (
          <div>
            <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-2xl border-b border-gray-200/60 dark:border-gray-800/60 px-4 sm:px-6 lg:px-8 py-4 shadow-sm">
              <Button
                onClick={() => setActiveTab('dashboard')}
                variant="outline"
                className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-gray-200/50 dark:border-gray-800/50 hover:bg-white dark:hover:bg-gray-900 transition-all duration-300"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                {t.backToDashboard}
              </Button>
            </div>
            <GroupsManagement language={language} />
          </div>
        )}

        {activeTab === 'place' && (
          <div>
            <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-2xl border-b border-gray-200/60 dark:border-gray-800/60 px-4 sm:px-6 lg:px-8 py-4 shadow-sm">
              <Button
                onClick={() => setActiveTab('dashboard')}
                variant="outline"
                className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-gray-200/50 dark:border-gray-800/50 hover:bg-white dark:hover:bg-gray-900 transition-all duration-300"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                {t.backToDashboard}
              </Button>
            </div>
            <PlaceManagement language={language} />
          </div>
        )}

        {activeTab === 'feedback' && (
          <div>
            <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-2xl border-b border-gray-200/60 dark:border-gray-800/60 px-4 sm:px-6 lg:px-8 py-4 shadow-sm">
              <Button
                onClick={() => setActiveTab('dashboard')}
                variant="outline"
                className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-gray-200/50 dark:border-gray-800/50 hover:bg-white dark:hover:bg-gray-900 transition-all duration-300"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                {t.backToDashboard}
              </Button>
            </div>
            <FeedbackManagement language={language} />
          </div>
        )}
      </main>
    </div>
  );
}