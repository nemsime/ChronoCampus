import { useState } from 'react';
import { Plus, Search, Edit, Trash2, BookOpen, GraduationCap, Clock, Building2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Card } from '../ui/card';
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
import { useAdmin } from '../../contexts/AdminContext';
import type { Subject } from '../../contexts/AdminContext';

const translations = {
  en: {
    subjectsManagement: 'Subjects Management',
    subtitle: 'Manage all subjects/courses in the university curriculum',
    addSubject: 'Add Subject',
    searchSubjects: 'Search subjects...',
    subjectName: 'Subject Name',
    code: 'Code',
    credits: 'Credits',
    hoursPerWeek: 'Hours/Week',
    department: 'Department',
    courseYear: 'Course Year',
    type: 'Type',
    actions: 'Actions',
    edit: 'Edit',
    delete: 'Delete',
    cancel: 'Cancel',
    save: 'Save',
    editSubject: 'Edit Subject',
    addNewSubject: 'Add New Subject',
    confirmDelete: 'Confirm Deletion',
    confirmDeleteMessage: 'Are you sure you want to delete this subject? This will affect course assignments.',
    subjectCode: 'Subject Code',
    selectDepartment: 'Select department',
    selectYear: 'Select year',
    selectType: 'Select type',
    year1: 'Year 1',
    year2: 'Year 2',
    year3: 'Year 3',
    year4: 'Year 4',
    lecture: 'Lecture',
    practice: 'Practice',
    lab: 'Laboratory',
    mixed: 'Mixed',
    computerScience: 'Computer Science',
    mathematics: 'Mathematics',
    engineering: 'Engineering',
    physics: 'Physics',
    allFieldsRequired: 'Please fill in all required fields',
    noResults: 'No subjects found',
    totalSubjects: 'Total Subjects'
  },
  hy: {
    subjectsManagement: 'Առարկաների Կառավարում',
    subtitle: 'Բարձրագույն դպրոցի ծրագրադասականության բոլոր առարկաների/դասերի կառավարում',
    addSubject: 'Ավելացնել Առարկա',
    searchSubjects: 'Փնտրել առարկաներ...',
    subjectName: 'Առարկայի Անվանում',
    code: 'Կոդ',
    credits: 'Վարկագույններ',
    hoursPerWeek: 'Ժամեր/շաբաթ',
    department: 'Բաժին',
    courseYear: 'Դասընթացի տարի',
    type: 'Տիպ',
    actions: 'Գործողություններ',
    edit: 'Խմբագրել',
    delete: 'Ջնջել',
    cancel: 'Չեղարկել',
    save: 'Պահպանել',
    editSubject: 'Խմբագրել Առարկան',
    addNewSubject: 'Ավելացնել Նոր Առարկա',
    confirmDelete: 'Հաստատել Ջնջումը',
    confirmDeleteMessage: 'Վստա՞հ եք, որ ցանկանում եք ջնջել այս առարկան: Այս գործողությունը ազդիկ կարող է դասերի առականում:',
    subjectCode: 'Առարկայի Կոդ',
    selectDepartment: 'Ընտրել բաժին',
    selectYear: 'Ընտրել տարի',
    selectType: 'Ընտրել տիպ',
    year1: 'Տարի 1',
    year2: 'Տարի 2',
    year3: 'Տարի 3',
    year4: 'Տարի 4',
    lecture: 'Դասախոսություն',
    practice: 'Պրակտիկա',
    lab: 'Լաբորատորիա',
    mixed: 'Բացառային',
    computerScience: 'Համակարգչայի գիտություն',
    mathematics: 'Մաթեմատիկա',
    engineering: 'Иնժեներականություն',
    physics: 'Ֆիզիկա',
    allFieldsRequired: 'Խնդրում ենք լրացնել բոլոր պահանջվող դաշտերը',
    noResults: 'Առարկաներ չի գտնվել',
    totalSubjects: 'Ընդհանուր Առարկաներ'
  },
  ru: {
    subjectsManagement: 'Управление Предметами',
    subtitle: 'Управление всеми предметами/курсами в учебном плане университета',
    addSubject: 'Добавить Предмет',
    searchSubjects: 'Искать предметы...',
    subjectName: 'Название Предмета',
    code: 'Код',
    credits: 'Кредиты',
    hoursPerWeek: 'Часы/Неделя',
    department: 'Кафедра',
    courseYear: 'Год Курса',
    type: 'Тип',
    actions: 'Действия',
    edit: 'Редактировать',
    delete: 'Удалить',
    cancel: 'Отмена',
    save: 'Сохранить',
    editSubject: 'Редактировать Предмет',
    addNewSubject: 'Добавить Новый Предмет',
    confirmDelete: 'Подтвердить Удаление',
    confirmDeleteMessage: 'Вы уверены, что хотите удалить этот предмет? Это повлияет на назначение курсов.',
    subjectCode: 'Код Предмета',
    selectDepartment: 'Выберите кафедру',
    selectYear: 'Выберите год',
    selectType: 'Выберите тип',
    year1: 'Год 1',
    year2: 'Год 2',
    year3: 'Год 3',
    year4: 'Год 4',
    lecture: 'Лекция',
    practice: 'Практика',
    lab: 'Лаборатория',
    mixed: 'Смешанный',
    computerScience: 'Компьютерные Науки',
    mathematics: 'Математика',
    engineering: 'Инженерия',
    physics: 'Физика',
    allFieldsRequired: 'Пожалуйста, заполните все обязательные поля',
    noResults: 'Предметы не найдены',
    totalSubjects: 'Всего Предметов'
  }
};

interface Subject {
  id: number;
  name: string;
  code: string;
  credits: number;
  department: string;
  courseYear: number;
  type: string;
}

interface SubjectsManagementProps {
  language: 'en' | 'hy' | 'ru';
}

const mockDepartments: { id: number; name: string }[] = [
  { id: 1, name: 'Computer Science' },
  { id: 2, name: 'Mathematics' },
  { id: 3, name: 'Engineering' },
  { id: 4, name: 'Physics' },
];

const initialSubjects: Subject[] = [
  { id: 1, name: 'Computer Science Fundamentals', code: 'IT101', credits: 3, department: 'Computer Science', courseYear: 1, type: 'Lecture' },
  { id: 2, name: 'Mathematics for Computing', code: 'MT205', credits: 4, department: 'Mathematics', courseYear: 1, type: 'Lecture' },
  { id: 3, name: 'Database Systems', code: 'DB319', credits: 3, department: 'Computer Science', courseYear: 2, type: 'Lecture' },
  { id: 4, name: 'Web Development', code: 'WD217', credits: 3, department: 'Computer Science', courseYear: 2, type: 'Lecture' },
  { id: 5, name: 'Software Engineering', code: 'SE401', credits: 4, department: 'Computer Science', courseYear: 3, type: 'Lecture' },
  { id: 6, name: 'Data Structures & Algorithms', code: 'DS228', credits: 3, department: 'Computer Science', courseYear: 3, type: 'Lecture' },
  { id: 7, name: 'Operating Systems', code: 'OS315', credits: 3, department: 'Computer Science', courseYear: 4, type: 'Lecture' },
  { id: 8, name: 'Network Security', code: 'NS419', credits: 3, department: 'Computer Science', courseYear: 4, type: 'Lecture' },
  { id: 9, name: 'Artificial Intelligence', code: 'AI502', credits: 3, department: 'Computer Science', courseYear: 4, type: 'Lecture' },
  { id: 10, name: 'Mobile App Development', code: 'MA334', credits: 3, department: 'Computer Science', courseYear: 4, type: 'Lecture' },
];

export function SubjectsManagement({ language }: SubjectsManagementProps) {
  const t = translations[language];
  const [subjects, setSubjects] = useState<Subject[]>(initialSubjects);
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [subjectToDelete, setSubjectToDelete] = useState<Subject | null>(null);
  const [formData, setFormData] = useState({ name: '', code: '', credits: 0, department: '', courseYear: 1, type: 'Lecture' });
  const [validationErrors, setValidationErrors] = useState<{
    name?: string;
    code?: string;
  }>({});

  const filteredSubjects = subjects.filter(
    (subject) =>
      subject.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      subject.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAddSubject = () => {
    setEditingSubject(null);
    setFormData({ name: '', code: '', credits: 0, department: '', courseYear: 1, type: 'Lecture' });
    setValidationErrors({});
    setDialogOpen(true);
  };

  const handleEditSubject = (subject: Subject) => {
    setEditingSubject(subject);
    setFormData({ name: subject.name, code: subject.code, credits: subject.credits, department: subject.department, courseYear: subject.courseYear, type: subject.type });
    setValidationErrors({});
    setDialogOpen(true);
  };

  const handleDeleteClick = (subject: Subject) => {
    setSubjectToDelete(subject);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (subjectToDelete) {
      setSubjects(subjects.filter((s) => s.id !== subjectToDelete.id));
      setDeleteDialogOpen(false);
      setSubjectToDelete(null);
    }
  };

  const validateForm = (): boolean => {
    const errors: { name?: string; code?: string } = {};

    // Validate subject name
    if (!formData.name.trim()) {
      errors.name = t.subjectNameRequired;
    } else if (formData.name.trim().length < 3) {
      errors.name = t.subjectNameMinLength;
    } else {
      // Check if name already exists (exclude current subject if editing)
      const nameExists = subjects.some(
        (s) => 
          s.name.toLowerCase() === formData.name.trim().toLowerCase() &&
          s.id !== editingSubject?.id
      );
      if (nameExists) {
        errors.name = t.subjectNameExists;
      }
    }

    // Validate subject code
    if (!formData.code.trim()) {
      errors.code = t.subjectCodeRequired;
    } else if (!/^[a-zA-Z0-9]+$/.test(formData.code.trim())) {
      errors.code = t.subjectCodeFormat;
    } else {
      // Check if code already exists (exclude current subject if editing)
      const codeExists = subjects.some(
        (s) => 
          s.code.toUpperCase() === formData.code.trim().toUpperCase() &&
          s.id !== editingSubject?.id
      );
      if (codeExists) {
        errors.code = t.subjectCodeExists;
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = () => {
    // Validate form before saving
    if (!validateForm()) {
      return;
    }

    // Trim whitespace from inputs
    const trimmedData = {
      ...formData,
      name: formData.name.trim(),
      code: formData.code.trim().toUpperCase(), // Store codes in uppercase
    };

    if (editingSubject) {
      setSubjects(
        subjects.map((s) =>
          s.id === editingSubject.id
            ? { ...s, ...trimmedData }
            : s
        )
      );
    } else {
      const newSubject: Subject = {
        id: Math.max(...subjects.map((s) => s.id), 0) + 1,
        ...trimmedData
      };
      setSubjects([...subjects, newSubject]);
    }
    setDialogOpen(false);
    setValidationErrors({});
  };

  return (
    <div className="p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl mb-2 text-gray-900 dark:text-gray-100">{t.subjectsManagement}</h1>
            <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">{t.subtitle}</p>
          </div>
          <Button onClick={handleAddSubject} className="bg-[#225b73] hover:bg-[#1a4659] dark:bg-violet-600 dark:hover:bg-violet-700 w-full sm:w-auto">
            <Plus className="w-4 h-4 mr-2" />
            {t.addSubject}
          </Button>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <Input
              placeholder={t.searchSubjects}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
            />
          </div>
        </div>

        {/* Desktop Table View */}
        <Card className="overflow-hidden shadow-sm hidden lg:block dark:bg-gray-800 dark:border-gray-700">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-6 py-4 text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t.code}
                  </th>
                  <th className="px-6 py-4 text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t.subjectName}
                  </th>
                  <th className="px-6 py-4 text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t.department}
                  </th>
                  <th className="px-6 py-4 text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t.type}
                  </th>
                  <th className="px-6 py-4 text-right text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t.actions}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {filteredSubjects.map((subject) => (
                  <tr key={subject.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant="outline" className="text-[#225b73] dark:text-blue-400 border-[#225b73] dark:border-blue-400">
                        {subject.code}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center mr-3">
                          <BookOpen className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div className="text-gray-900 dark:text-gray-100">{subject.name}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                        <Building2 className="w-4 h-4 mr-2" />
                        {subject.department}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <Badge className={`
                        ${subject.type === 'Lecture' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' : ''}
                        ${subject.type === 'Practice' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : ''}
                        ${subject.type === 'Laboratory' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' : ''}
                        ${subject.type === 'Mixed' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : ''}
                      `}>
                        {subject.type}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditSubject(subject)}
                        className="mr-2 dark:hover:bg-gray-700"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteClick(subject)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Mobile/Tablet Card View */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:hidden">
          {filteredSubjects.map((subject) => (
            <Card key={subject.id} className="overflow-hidden hover:shadow-md transition-shadow dark:bg-gray-800 dark:border-gray-700">
              <div className="p-5">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start space-x-3 flex-1">
                    <div className="w-12 h-12 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                      <BookOpen className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1 line-clamp-2">{subject.name}</h3>
                      <Badge variant="outline" className="text-[#225b73] dark:text-violet-400 border-[#225b73] dark:border-violet-400">
                        {subject.code}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t.department}</p>
                    <div className="flex items-center text-sm text-gray-900 dark:text-gray-100">
                      <Building2 className="w-3.5 h-3.5 mr-1.5 text-gray-400" />
                      <span className="truncate">{subject.department}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t.type}</p>
                    <Badge className={`text-xs
                      ${subject.type === 'Lecture' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' : ''}
                      ${subject.type === 'Practice' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : ''}
                      ${subject.type === 'Laboratory' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' : ''}
                      ${subject.type === 'Mixed' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : ''}
                    `}>
                      {subject.type}
                    </Badge>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex space-x-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEditSubject(subject)}
                    className="flex-1 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    {t.edit}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteClick(subject)}
                    className="flex-1 text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    {t.delete}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Add/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="dark:bg-gray-800 dark:border-gray-700 max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="dark:text-gray-100">{editingSubject ? t.editSubject : t.addNewSubject}</DialogTitle>
              <DialogDescription className="dark:text-gray-400">
                {editingSubject ? 'Update subject information' : 'Add a new subject to the system'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-5 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="code" className="dark:text-gray-200">{t.subjectCode} *</Label>
                  <Input
                    id="code"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    placeholder="CS101"
                    className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                  />
                  {validationErrors.code && <p className="text-red-500 dark:text-red-400 text-sm">{validationErrors.code}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="department" className="dark:text-gray-200">{t.department} *</Label>
                  <Select
                    value={formData.department}
                    onValueChange={(value) => setFormData({ ...formData, department: value })}
                  >
                    <SelectTrigger className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100">
                      <SelectValue placeholder={t.selectDepartment} />
                    </SelectTrigger>
                    <SelectContent className="dark:bg-gray-700 dark:border-gray-600">
                      {mockDepartments.map((department) => (
                        <SelectItem key={department.id} value={department.name} className="dark:text-gray-100 dark:focus:bg-gray-600">
                          {department.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="name" className="dark:text-gray-200">{t.subjectName} *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Introduction to Computer Science"
                  className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                />
                {validationErrors.name && <p className="text-red-500 dark:text-red-400 text-sm">{validationErrors.name}</p>}
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="type" className="dark:text-gray-200">{t.type} *</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(value) => setFormData({ ...formData, type: value })}
                  >
                    <SelectTrigger className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100">
                      <SelectValue placeholder={t.selectType} />
                    </SelectTrigger>
                    <SelectContent className="dark:bg-gray-700 dark:border-gray-600">
                      <SelectItem value="Lecture" className="dark:text-gray-100 dark:focus:bg-gray-600">{t.lecture}</SelectItem>
                      <SelectItem value="Practice" className="dark:text-gray-100 dark:focus:bg-gray-600">{t.practice}</SelectItem>
                      <SelectItem value="Laboratory" className="dark:text-gray-100 dark:focus:bg-gray-600">{t.lab}</SelectItem>
                      <SelectItem value="Mixed" className="dark:text-gray-100 dark:focus:bg-gray-600">{t.mixed}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700">
                {t.cancel}
              </Button>
              <Button onClick={handleSave} className="bg-[#225b73] hover:bg-[#1a4659] dark:bg-violet-600 dark:hover:bg-violet-700">
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

        {/* Empty State */}
        {filteredSubjects.length === 0 && (
          <Card className="p-12 text-center dark:bg-gray-800 dark:border-gray-700">
            <BookOpen className="w-16 h-16 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">{t.noResults}</h3>
            <p className="text-gray-500 dark:text-gray-400">Try adjusting your search terms</p>
          </Card>
        )}
      </div>
    </div>
  );
}