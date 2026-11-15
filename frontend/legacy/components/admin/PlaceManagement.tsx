import { useState, useMemo } from 'react';
import { Plus, Search, Edit, Trash2, AlertTriangle, Calendar, Clock, MapPin, Users, BookOpen, CheckCircle2, XCircle, Filter, Building2, GraduationCap } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Card } from '../ui/card';
import { Alert, AlertDescription } from '../ui/alert';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { useAdmin } from '../../contexts/AdminContext';
import type { Schedule } from '../../contexts/AdminContext';

const translations = {
  en: {
    placeManagement: 'Schedule & Place Management',
    subtitle: 'Create and manage class schedules with intelligent conflict detection',
    addSchedule: 'Add Schedule',
    searchSchedules: 'Search by subject, teacher, group...',
    subject: 'Subject',
    teacher: 'Teacher',
    classroom: 'Classroom',
    group: 'Group',
    day: 'Day',
    time: 'Time',
    week: 'Week',
    capacity: 'Capacity',
    actions: 'Actions',
    edit: 'Edit',
    delete: 'Delete',
    cancel: 'Cancel',
    save: 'Save',
    editSchedule: 'Edit Schedule',
    addNewSchedule: 'Add New Schedule',
    confirmDelete: 'Confirm Deletion',
    confirmDeleteMessage: 'Are you sure you want to delete this schedule? This action cannot be undone.',
    selectSubject: 'Select subject',
    selectTeacher: 'Select teacher',
    selectClassroom: 'Select classroom',
    selectGroup: 'Select group',
    selectDay: 'Select day',
    selectTime: 'Select time slot',
    selectWeek: 'Select week',
    monday: 'Monday',
    tuesday: 'Tuesday',
    wednesday: 'Wednesday',
    thursday: 'Thursday',
    friday: 'Friday',
    numerator: 'Week 1 (Numerator)',
    denominator: 'Week 2 (Denominator)',
    both: 'Both Weeks',
    conflictsDetected: 'Conflicts Detected!',
    warningsDetected: 'Warnings',
    teacherConflict: 'Teacher is already scheduled at this time',
    classroomConflict: 'Classroom is already booked',
    groupConflict: 'Group already has a class',
    capacityWarning: 'Classroom capacity insufficient',
    cannotSave: 'Cannot save due to conflicts',
    canSaveWithWarning: 'You can save with warnings',
    noConflicts: 'No conflicts detected',
    allFieldsRequired: 'Please fill in all required fields',
    students: 'students',
    seats: 'seats',
    overcapacity: 'Overcapacity',
    okCapacity: 'OK',
    all: 'All Days',
    filterByDay: 'Filter by Day',
    totalSchedules: 'Total Schedules',
    noResults: 'No schedules found',
    viewByDay: 'View by Day',
    viewAll: 'View All',
    campus: 'Campus'
  },
  hy: {
    placeManagement: 'Ժամանակացույցի և Տեղանքի Կառավարում',
    subtitle: 'Ստեղծեք և կառավարեք դասերի ժամանակացույցը խելացի հակասությունների հայտնաբերմամբ',
    addSchedule: 'Ավելացնել Ժամանակացույց',
    searchSchedules: 'Փնտրել ըստ առարկայի, դասախոսի, խմբի...',
    subject: 'Առարկա',
    teacher: 'Դասախոս',
    classroom: 'Լսարան',
    group: 'Խումբ',
    day: 'Օր',
    time: 'Ժամ',
    week: 'Շաբաթ',
    capacity: 'Տարողություն',
    actions: 'Գործողություններ',
    edit: 'Խմբագրել',
    delete: 'Ջնջել',
    cancel: 'Չեղարկել',
    save: 'Պահպանել',
    editSchedule: 'Խմբագրել Ժամանակացույցը',
    addNewSchedule: 'Ավելացնել Նոր Ժամանակացույց',
    confirmDelete: 'Հաստատել Ջնջումը',
    confirmDeleteMessage: 'Վստա՞հ եք, որ ցանկանում եք ջնջել այս ժամանակացույցը:',
    selectSubject: 'Ընտրել առարկա',
    selectTeacher: 'Ընտրել դասախոս',
    selectClassroom: 'Ընտրել լսարան',
    selectGroup: 'Ընտրել խումբ',
    selectDay: 'Ընտրել օր',
    selectTime: 'Ընտրել ժամը',
    selectWeek: 'Ընտրել շաբաթ',
    monday: 'Երկուշաբթի',
    tuesday: 'Երեքշաբթի',
    wednesday: 'Չորեքշաբթի',
    thursday: 'Հինգշաբթի',
    friday: 'Ուրբաթ',
    numerator: 'Շաբաթ 1 (Համարիչ)',
    denominator: 'Շաբաթ 2 (Հայտարար)',
    both: 'Երկու Շաբաթներ',
    conflictsDetected: 'Հայտնաբերված են Հակասություններ',
    warningsDetected: 'Նախազգուշացումներ',
    teacherConflict: 'Դասախոսը արդեն զբաղված է այս ժամին',
    classroomConflict: 'Լսարանը արդեն զբաղված է',
    groupConflict: 'Խումբն արդեն ունի դաս',
    capacityWarning: 'Լսարանի տարողությունը անբավարար է',
    cannotSave: 'Հնարավոր չէ պահպանել հակասությունների պատճառով',
    canSaveWithWarning: 'Կարող եք պահպանել նախազգուշացումներով',
    noConflicts: 'Հակասություններ չեն հայտնաբերվել',
    allFieldsRequired: 'Խնդրում ենք լրացնել բոլոր դաշտերը',
    students: 'ուսանողներ',
    seats: 'նստատեղեր',
    overcapacity: 'Գերազանց',
    okCapacity: 'Լավ',
    all: 'Բոլոր Օրերը',
    filterByDay: 'Ֆիլտրել ըստ օրվա',
    totalSchedules: 'Ընդհանուր Ժամանակացույցեր',
    noResults: 'Ժամանակացույցեր չեն գտնվել',
    viewByDay: 'Դիտել ըստ օրվա',
    viewAll: 'Դիտել Բոլորը',
    campus: 'Քեմփուս'
  },
  ru: {
    placeManagement: 'Управление Расписанием и Местами',
    subtitle: 'Создавайте и управляйте расписанием занятий с умным обнаружением конфликтов',
    addSchedule: 'Добавить Расписание',
    searchSchedules: 'Поиск по предмету, преподавателю, группе...',
    subject: 'Предмет',
    teacher: 'Преподаватель',
    classroom: 'Аудитория',
    group: 'Группа',
    day: 'День',
    time: 'Время',
    week: 'Неделя',
    capacity: 'Вместимость',
    actions: 'Действия',
    edit: 'Редактировать',
    delete: 'Удалить',
    cancel: 'Отмена',
    save: 'Сохранить',
    editSchedule: 'Редактировать Расписание',
    addNewSchedule: 'Добавить Новое Расписание',
    confirmDelete: 'Подтвердить Удаление',
    confirmDeleteMessage: 'Вы уверены, что хотите удалить это расписание?',
    selectSubject: 'Выберите предмет',
    selectTeacher: 'Выберите преподавателя',
    selectClassroom: 'Выберите аудиторию',
    selectGroup: 'Выберите группу',
    selectDay: 'Выберите день',
    selectTime: 'Выберите время',
    selectWeek: 'Выберите неделю',
    monday: 'Понедельник',
    tuesday: 'Вторник',
    wednesday: 'Среда',
    thursday: 'Четверг',
    friday: 'Пятница',
    numerator: 'Неделя 1 (Числитель)',
    denominator: 'Неделя 2 (Знаменатель)',
    both: 'Обе Недели',
    conflictsDetected: 'Обнаружены Конфликты',
    warningsDetected: 'Предупреждения',
    teacherConflict: 'Преподаватель уже занят в это время',
    classroomConflict: 'Аудитория уже занята',
    groupConflict: 'У группы уже есть занятие',
    capacityWarning: 'Недостаточная вместимость аудитории',
    cannotSave: 'Невозможно сохранить из-за конфликтов',
    canSaveWithWarning: 'Можно сохранить с предупреждениями',
    noConflicts: 'Конфликтов не обнаружено',
    allFieldsRequired: 'Пожалуйста, заполните все обязательные поля',
    students: 'студентов',
    seats: 'мест',
    overcapacity: 'Превышение',
    okCapacity: 'OK',
    all: 'Все Дни',
    filterByDay: 'Фильтр по дню',
    totalSchedules: 'Всего Расписаний',
    noResults: 'Расписания не найдены',
    viewByDay: 'Просмотр по дням',
    viewAll: 'Все',
    campus: 'Кампус'
  }
};

interface PlaceManagementProps {
  language: 'en' | 'hy' | 'ru';
}

interface ConflictCheck {
  hasTimeConflicts: boolean;
  hasCapacityWarning: boolean;
  timeConflicts: string[];
  capacityWarning?: string;
}

const timeSlots = [
  '09:30 - 10:50',
  '11:00 - 12:20',
  '12:30 - 13:50',
  '14:00 - 15:20',
  '15:30 - 16:50',
  '17:00 - 18:20'
];

// Format time for better readability
const formatTime = (timeSlot: string) => {
  return timeSlot.replace(' - ', ' – '); // Use en-dash for better typography
};

export function PlaceManagement({ language }: PlaceManagementProps) {
  const t = translations[language];
  const {
    schedules,
    subjects,
    users,
    groups,
    classrooms,
    addSchedule,
    updateSchedule,
    deleteSchedule,
    getUsersByRole
  } = useAdmin();
  
  const teachers = getUsersByRole('teacher');
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDay, setSelectedDay] = useState<string>('All');
  const [viewMode, setViewMode] = useState<'all' | 'day'>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [scheduleToDelete, setScheduleToDelete] = useState<Schedule | null>(null);
  const [conflictCheck, setConflictCheck] = useState<ConflictCheck>({
    hasTimeConflicts: false,
    hasCapacityWarning: false,
    timeConflicts: [],
  });
  const [formData, setFormData] = useState({
    subjectId: 0,
    teacherId: 0,
    classroomId: 0,
    groupId: 0,
    day: '',
    timeSlot: '',
    week: 'both' as Schedule['week']
  });

  const days = [
    { key: 'Monday', label: t.monday },
    { key: 'Tuesday', label: t.tuesday },
    { key: 'Wednesday', label: t.wednesday },
    { key: 'Thursday', label: t.thursday },
    { key: 'Friday', label: t.friday }
  ];

  const filteredSchedules = useMemo(() => {
    return schedules.filter((schedule) => {
      const matchesSearch = schedule.subjectName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        schedule.teacherName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        schedule.groupCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        schedule.classroomNumber.includes(searchTerm);
      
      const matchesDay = selectedDay === 'All' || schedule.day === selectedDay;
      
      return matchesSearch && matchesDay;
    });
  }, [schedules, searchTerm, selectedDay]);

  const checkAllConflicts = (data: typeof formData, currentScheduleId?: number): ConflictCheck => {
    const timeConflicts: string[] = [];
    let capacityWarning: string | undefined;
    
    const selectedClassroom = classrooms.find((c) => c.id === data.classroomId);
    const selectedGroup = groups.find((g) => g.id === data.groupId);
    
    if (selectedClassroom && selectedGroup) {
      if (selectedGroup.size > selectedClassroom.capacity) {
        capacityWarning = `${t.capacityWarning}: ${selectedGroup.size} ${t.students} > ${selectedClassroom.capacity} ${t.seats}`;
      }
    }
    
    schedules.forEach((schedule) => {
      if (currentScheduleId && schedule.id === currentScheduleId) return;
      if (schedule.day !== data.day || schedule.timeSlot !== data.timeSlot) return;
      
      const weeksOverlap = 
        data.week === 'both' || 
        schedule.week === 'both' || 
        data.week === schedule.week;
      
      if (!weeksOverlap) return;
      
      if (schedule.teacherId === data.teacherId) {
        timeConflicts.push(t.teacherConflict);
      }
      if (schedule.classroomId === data.classroomId) {
        timeConflicts.push(t.classroomConflict);
      }
      if (schedule.groupId === data.groupId) {
        timeConflicts.push(t.groupConflict);
      }
    });
    
    return {
      hasTimeConflicts: timeConflicts.length > 0,
      hasCapacityWarning: !!capacityWarning,
      timeConflicts: [...new Set(timeConflicts)],
      capacityWarning
    };
  };

  const handleFormChange = (field: string, value: any) => {
    const newData = { ...formData, [field]: value };
    setFormData(newData);
    
    if (newData.day && newData.timeSlot && newData.teacherId && newData.classroomId && newData.groupId) {
      const conflicts = checkAllConflicts(newData, editingSchedule?.id);
      setConflictCheck(conflicts);
    }
  };

  const handleAddSchedule = () => {
    setEditingSchedule(null);
    setFormData({
      subjectId: 0,
      teacherId: 0,
      classroomId: 0,
      groupId: 0,
      day: '',
      timeSlot: '',
      week: 'both'
    });
    setConflictCheck({
      hasTimeConflicts: false,
      hasCapacityWarning: false,
      timeConflicts: [],
    });
    setDialogOpen(true);
  };

  const handleEditSchedule = (schedule: Schedule) => {
    setEditingSchedule(schedule);
    setFormData({
      subjectId: schedule.subjectId,
      teacherId: schedule.teacherId,
      classroomId: schedule.classroomId,
      groupId: schedule.groupId,
      day: schedule.day,
      timeSlot: schedule.timeSlot,
      week: schedule.week
    });
    setConflictCheck({
      hasTimeConflicts: false,
      hasCapacityWarning: false,
      timeConflicts: [],
    });
    setDialogOpen(true);
  };

  const handleDeleteClick = (schedule: Schedule) => {
    setScheduleToDelete(schedule);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (scheduleToDelete) {
      deleteSchedule(scheduleToDelete.id);
      setDeleteDialogOpen(false);
      setScheduleToDelete(null);
    }
  };

  const handleSave = () => {
    if (!formData.subjectId || !formData.teacherId || !formData.classroomId || 
        !formData.groupId || !formData.day || !formData.timeSlot) {
      return;
    }

    if (conflictCheck.hasTimeConflicts) {
      return;
    }

    const subject = subjects.find((s) => s.id === formData.subjectId);
    const teacher = teachers.find((t) => t.id === formData.teacherId);
    const classroom = classrooms.find((c) => c.id === formData.classroomId);
    const group = groups.find((g) => g.id === formData.groupId);

    if (!subject || !teacher || !classroom || !group) return;

    const scheduleData: Omit<Schedule, 'id'> = {
      subjectId: formData.subjectId,
      subjectName: subject.name,
      subjectCode: subject.code,
      teacherId: formData.teacherId,
      teacherName: teacher.name,
      classroomId: formData.classroomId,
      classroomNumber: classroom.number,
      classroomCapacity: classroom.capacity,
      groupId: formData.groupId,
      groupCode: group.code,
      groupSize: group.size,
      day: formData.day,
      timeSlot: formData.timeSlot,
      week: formData.week,
      duration: 80,
      assignmentId: 0,
      semesterId: 1
    };

    if (editingSchedule) {
      updateSchedule(editingSchedule.id, scheduleData);
    } else {
      addSchedule(scheduleData);
    }
    setDialogOpen(false);
  };

  const getWeekBadgeColor = (week: Schedule['week']) => {
    switch (week) {
      case 'numerator':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
      case 'denominator':
        return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300';
      default:
        return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
    }
  };

  const getWeekLabel = (week: Schedule['week']) => {
    switch (week) {
      case 'numerator':
        return t.numerator;
      case 'denominator':
        return t.denominator;
      default:
        return t.both;
    }
  };

  return (
    <div className="p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl mb-2 text-gray-900 dark:text-gray-100">{t.placeManagement}</h1>
            <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">{t.subtitle}</p>
          </div>
          <Button onClick={handleAddSchedule} className="bg-[#225b73] hover:bg-[#1a4659] dark:bg-violet-600 dark:hover:bg-violet-700 w-full sm:w-auto">
            <Plus className="w-4 h-4 mr-2" />
            {t.addSchedule}
          </Button>
        </div>

        {/* Search & Filters */}
        <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <Input
              placeholder={t.searchSchedules}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
            />
          </div>
          <Select value={selectedDay} onValueChange={setSelectedDay}>
            <SelectTrigger className="dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="dark:bg-gray-700 dark:border-gray-600">
              <SelectItem value="All" className="dark:text-gray-100 dark:focus:bg-gray-600">{t.all}</SelectItem>
              {days.map((day) => (
                <SelectItem key={day.key} value={day.key} className="dark:text-gray-100 dark:focus:bg-gray-600">
                  {day.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* View Mode Tabs */}
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'all' | 'day')} className="mb-6">
          <TabsList className="dark:bg-gray-800">
            <TabsTrigger value="all" className="dark:data-[state=active]:bg-gray-700">{t.viewAll}</TabsTrigger>
            <TabsTrigger value="day" className="dark:data-[state=active]:bg-gray-700">{t.viewByDay}</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-6">
            {/* Desktop Table */}
            <Card className="overflow-hidden shadow-sm hidden lg:block dark:bg-gray-800 dark:border-gray-700">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t.subject}</th>
                      <th className="px-4 py-3 text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t.teacher}</th>
                      <th className="px-4 py-3 text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t.group}</th>
                      <th className="px-4 py-3 text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t.day}</th>
                      <th className="px-4 py-3 text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t.time}</th>
                      <th className="px-4 py-3 text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t.classroom}</th>
                      <th className="px-4 py-3 text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t.week}</th>
                      <th className="px-4 py-3 text-right text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t.actions}</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {filteredSchedules.map((schedule) => {
                      const isOvercapacity = schedule.groupSize > schedule.classroomCapacity;
                      return (
                        <tr key={schedule.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center">
                              <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center mr-2 flex-shrink-0">
                                <BookOpen className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                              </div>
                              <div className="min-w-0">
                                <div className="font-medium text-gray-900 dark:text-gray-100 text-sm truncate">{schedule.subjectName}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">{schedule.subjectCode}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center text-sm text-gray-900 dark:text-gray-100">
                              <GraduationCap className="w-4 h-4 mr-2 text-gray-400 flex-shrink-0" />
                              <span className="truncate">{schedule.teacherName}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className="text-[#225b73] dark:text-blue-400 border-[#225b73] dark:border-blue-400">
                              {schedule.groupCode}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center text-sm text-gray-900 dark:text-gray-100">
                              <Calendar className="w-4 h-4 mr-2 text-gray-400 flex-shrink-0" />
                              {days.find(d => d.key === schedule.day)?.label}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center text-sm text-gray-900 dark:text-gray-100 whitespace-nowrap">
                              <Clock className="w-4 h-4 mr-2 text-gray-400 flex-shrink-0" />
                              {formatTime(schedule.timeSlot)}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center space-x-2">
                              <div className="w-8 h-8 rounded-lg bg-orange-50 dark:bg-orange-900/30 flex items-center justify-center flex-shrink-0">
                                <MapPin className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                              </div>
                              <div className="min-w-0">
                                <div className="font-medium text-sm text-gray-900 dark:text-gray-100">{schedule.classroomNumber}</div>
                                <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                                  <Users className="w-3 h-3 mr-1" />
                                  <span className={isOvercapacity ? 'text-red-600 dark:text-red-400' : ''}>
                                    {schedule.groupSize}/{schedule.classroomCapacity}
                                  </span>
                                  {isOvercapacity && <AlertTriangle className="w-3 h-3 ml-1 text-red-600 dark:text-red-400" />}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Badge className={getWeekBadgeColor(schedule.week)}>
                              {getWeekLabel(schedule.week)}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end space-x-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditSchedule(schedule)}
                                className="dark:hover:bg-gray-700"
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteClick(schedule)}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Mobile/Tablet Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:hidden">
              {filteredSchedules.map((schedule) => {
                const isOvercapacity = schedule.groupSize > schedule.classroomCapacity;
                return (
                  <Card key={schedule.id} className="overflow-hidden hover:shadow-md transition-shadow dark:bg-gray-800 dark:border-gray-700">
                    <div className="p-4 sm:p-5">
                      {/* Header */}
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-start space-x-3 flex-1 min-w-0">
                          <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                            <BookOpen className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1 line-clamp-2">{schedule.subjectName}</h3>
                            <div className="flex items-center space-x-2">
                              <Badge variant="outline" className="text-xs text-[#225b73] dark:text-violet-400 border-[#225b73] dark:border-violet-400">
                                {schedule.subjectCode}
                              </Badge>
                              <Badge variant="outline" className="text-xs text-[#225b73] dark:text-violet-400 border-[#225b73] dark:border-violet-400">
                                {schedule.groupCode}
                              </Badge>
                            </div>
                          </div>
                        </div>
                        <Badge className={`${getWeekBadgeColor(schedule.week)} text-xs whitespace-nowrap ml-2`}>
                          {schedule.week === 'both' ? t.both : schedule.week === 'numerator' ? 'W1' : 'W2'}
                        </Badge>
                      </div>

                      {/* Details */}
                      <div className="space-y-2 mb-4">
                        <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                          <GraduationCap className="w-4 h-4 mr-2 flex-shrink-0" />
                          <span className="truncate">{schedule.teacherName}</span>
                        </div>
                        <div className="flex items-center text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                          <Calendar className="w-4 h-4 mr-2 flex-shrink-0" />
                          {days.find(d => d.key === schedule.day)?.label}
                          <span className="mx-2">•</span>
                          <Clock className="w-4 h-4 mr-2 flex-shrink-0" />
                          {formatTime(schedule.timeSlot)}
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center text-gray-600 dark:text-gray-400">
                            <MapPin className="w-4 h-4 mr-2 flex-shrink-0" />
                            {schedule.classroomNumber}
                          </div>
                          <div className={`flex items-center ${isOvercapacity ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'}`}>
                            <Users className="w-4 h-4 mr-1" />
                            {schedule.groupSize}/{schedule.classroomCapacity}
                            {isOvercapacity && <AlertTriangle className="w-4 h-4 ml-1" />}
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex space-x-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditSchedule(schedule)}
                          className="flex-1 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                        >
                          <Edit className="w-4 h-4 mr-2" />
                          {t.edit}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteClick(schedule)}
                          className="flex-1 text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          {t.delete}
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="day" className="mt-6">
            <div className="space-y-6">
              {days.map((day) => {
                const daySchedules = filteredSchedules.filter(s => s.day === day.key);
                if (daySchedules.length === 0) return null;
                
                return (
                  <Card key={day.key} className="dark:bg-gray-800 dark:border-gray-700">
                    <div className="p-4 sm:p-6">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center">
                        <Calendar className="w-5 h-5 mr-2 text-[#225b73] dark:text-blue-400" />
                        {day.label}
                        <Badge variant="secondary" className="ml-2 dark:bg-gray-700 dark:text-gray-200">
                          {daySchedules.length}
                        </Badge>
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {daySchedules.map((schedule) => {
                          const isOvercapacity = schedule.groupSize > schedule.classroomCapacity;
                          return (
                            <div key={schedule.id} className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                              <div className="flex items-start justify-between mb-2">
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">{schedule.subjectName}</div>
                                  <div className="text-xs text-gray-500 dark:text-gray-400">{schedule.groupCode}</div>
                                </div>
                                <Badge className={`${getWeekBadgeColor(schedule.week)} text-xs ml-2`}>
                                  {schedule.week === 'both' ? 'B' : schedule.week === 'numerator' ? 'N' : 'D'}
                                </Badge>
                              </div>
                              <div className="space-y-1 mb-3">
                                <div className="flex items-center text-xs text-gray-600 dark:text-gray-400">
                                  <Clock className="w-3 h-3 mr-1 flex-shrink-0" />
                                  {formatTime(schedule.timeSlot)}
                                </div>
                                <div className="flex items-center text-xs text-gray-600 dark:text-gray-400">
                                  <MapPin className="w-3 h-3 mr-1 flex-shrink-0" />
                                  {schedule.classroomNumber}
                                </div>
                              </div>
                              <div className="flex space-x-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEditSchedule(schedule)}
                                  className="flex-1 h-7 text-xs dark:hover:bg-gray-700"
                                >
                                  <Edit className="w-3 h-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteClick(schedule)}
                                  className="flex-1 h-7 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>

        {/* Empty State */}
        {filteredSchedules.length === 0 && (
          <Card className="p-12 text-center dark:bg-gray-800 dark:border-gray-700">
            <Calendar className="w-16 h-16 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">{t.noResults}</h3>
            <p className="text-gray-500 dark:text-gray-400">Try adjusting your search or filters</p>
          </Card>
        )}

        {/* Add/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="dark:bg-gray-800 dark:border-gray-700 max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="dark:text-gray-100">{editingSchedule ? t.editSchedule : t.addNewSchedule}</DialogTitle>
              <DialogDescription className="dark:text-gray-400">
                {editingSchedule ? 'Update schedule information' : 'Add a new class to the schedule'}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-5 py-4">
              {/* Subject & Teacher */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="subject" className="dark:text-gray-200">{t.subject} *</Label>
                  <Select
                    value={formData.subjectId.toString()}
                    onValueChange={(value) => handleFormChange('subjectId', parseInt(value))}
                  >
                    <SelectTrigger className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100">
                      <SelectValue placeholder={t.selectSubject} />
                    </SelectTrigger>
                    <SelectContent className="dark:bg-gray-700 dark:border-gray-600">
                      {subjects.map((subject) => (
                        <SelectItem key={subject.id} value={subject.id.toString()} className="dark:text-gray-100 dark:focus:bg-gray-600">
                          {subject.name} ({subject.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="teacher" className="dark:text-gray-200">{t.teacher} *</Label>
                  <Select
                    value={formData.teacherId.toString()}
                    onValueChange={(value) => handleFormChange('teacherId', parseInt(value))}
                  >
                    <SelectTrigger className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100">
                      <SelectValue placeholder={t.selectTeacher} />
                    </SelectTrigger>
                    <SelectContent className="dark:bg-gray-700 dark:border-gray-600">
                      {teachers.map((teacher) => (
                        <SelectItem key={teacher.id} value={teacher.id.toString()} className="dark:text-gray-100 dark:focus:bg-gray-600">
                          {teacher.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Group & Classroom */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="group" className="dark:text-gray-200">{t.group} *</Label>
                  <Select
                    value={formData.groupId.toString()}
                    onValueChange={(value) => handleFormChange('groupId', parseInt(value))}
                  >
                    <SelectTrigger className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100">
                      <SelectValue placeholder={t.selectGroup} />
                    </SelectTrigger>
                    <SelectContent className="dark:bg-gray-700 dark:border-gray-600">
                      {groups.map((group) => (
                        <SelectItem key={group.id} value={group.id.toString()} className="dark:text-gray-100 dark:focus:bg-gray-600">
                          {group.code} ({group.size} students)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="classroom" className="dark:text-gray-200">{t.classroom} *</Label>
                  <Select
                    value={formData.classroomId.toString()}
                    onValueChange={(value) => handleFormChange('classroomId', parseInt(value))}
                  >
                    <SelectTrigger className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100">
                      <SelectValue placeholder={t.selectClassroom} />
                    </SelectTrigger>
                    <SelectContent className="dark:bg-gray-700 dark:border-gray-600">
                      {classrooms.map((classroom) => (
                        <SelectItem key={classroom.id} value={classroom.id.toString()} className="dark:text-gray-100 dark:focus:bg-gray-600">
                          {classroom.number} - {classroom.campus} (Cap: {classroom.capacity})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Day, Time & Week */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="day" className="dark:text-gray-200">{t.day} *</Label>
                  <Select
                    value={formData.day}
                    onValueChange={(value) => handleFormChange('day', value)}
                  >
                    <SelectTrigger className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100">
                      <SelectValue placeholder={t.selectDay} />
                    </SelectTrigger>
                    <SelectContent className="dark:bg-gray-700 dark:border-gray-600">
                      {days.map((day) => (
                        <SelectItem key={day.key} value={day.key} className="dark:text-gray-100 dark:focus:bg-gray-600">
                          {day.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="time" className="dark:text-gray-200">{t.time} *</Label>
                  <Select
                    value={formData.timeSlot}
                    onValueChange={(value) => handleFormChange('timeSlot', value)}
                  >
                    <SelectTrigger className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100">
                      <SelectValue placeholder={t.selectTime} />
                    </SelectTrigger>
                    <SelectContent className="dark:bg-gray-700 dark:border-gray-600">
                      {timeSlots.map((slot) => (
                        <SelectItem key={slot} value={slot} className="dark:text-gray-100 dark:focus:bg-gray-600">
                          {slot}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="week" className="dark:text-gray-200">{t.week} *</Label>
                  <Select
                    value={formData.week}
                    onValueChange={(value) => handleFormChange('week', value)}
                  >
                    <SelectTrigger className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="dark:bg-gray-700 dark:border-gray-600">
                      <SelectItem value="both" className="dark:text-gray-100 dark:focus:bg-gray-600">{t.both}</SelectItem>
                      <SelectItem value="numerator" className="dark:text-gray-100 dark:focus:bg-gray-600">{t.numerator}</SelectItem>
                      <SelectItem value="denominator" className="dark:text-gray-100 dark:focus:bg-gray-600">{t.denominator}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Conflict Alerts */}
              {conflictCheck.hasTimeConflicts && (
                <Alert variant="destructive" className="dark:border-red-800 dark:bg-red-900/20">
                  <AlertTriangle className="w-4 h-4" />
                  <AlertDescription>
                    <div className="font-semibold mb-1">{t.conflictsDetected}</div>
                    <ul className="text-sm space-y-1">
                      {conflictCheck.timeConflicts.map((conflict, idx) => (
                        <li key={idx}>• {conflict}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {conflictCheck.hasCapacityWarning && !conflictCheck.hasTimeConflicts && (
                <Alert className="border-yellow-600 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20">
                  <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                  <AlertDescription className="text-yellow-800 dark:text-yellow-300">
                    <div className="font-semibold mb-1">{t.warningsDetected}</div>
                    <div className="text-sm">{conflictCheck.capacityWarning}</div>
                  </AlertDescription>
                </Alert>
              )}

              {!conflictCheck.hasTimeConflicts && !conflictCheck.hasCapacityWarning && formData.day && formData.timeSlot && (
                <Alert className="border-green-600 bg-green-50 dark:border-green-800 dark:bg-green-900/20">
                  <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                  <AlertDescription className="text-green-800 dark:text-green-300">
                    {t.noConflicts}
                  </AlertDescription>
                </Alert>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700">
                {t.cancel}
              </Button>
              <Button 
                onClick={handleSave} 
                disabled={conflictCheck.hasTimeConflicts || !formData.subjectId || !formData.teacherId || !formData.classroomId || !formData.groupId || !formData.day || !formData.timeSlot}
                className="bg-[#225b73] hover:bg-[#1a4659] dark:bg-violet-600 dark:hover:bg-violet-700 disabled:opacity-50"
              >
                {t.save}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent className="dark:bg-gray-800 dark:border-gray-700">
            <AlertDialogHeader>
              <AlertDialogTitle className="dark:text-gray-100">{t.confirmDelete}</AlertDialogTitle>
              <AlertDialogDescription className="dark:text-gray-400">{t.confirmDeleteMessage}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700">{t.cancel}</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteConfirm}
                className="bg-red-600 hover:bg-red-700"
              >
                {t.delete}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}