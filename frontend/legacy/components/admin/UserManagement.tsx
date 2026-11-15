import { useState } from 'react';
import { Plus, Search, Edit, Trash2, Mail, User, Shield, Key, Filter, ChevronUp, ChevronDown, RotateCcw } from 'lucide-react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { toast } from 'sonner';

const translations = {
  en: {
    userManagement: 'User Management',
    addUser: 'Add User',
    searchUsers: 'Search by name or email...',
    name: 'Name',
    email: 'Email',
    role: 'Role',
    status: 'Status',
    authType: 'Auth Type',
    actions: 'Actions',
    edit: 'Edit',
    delete: 'Delete',
    resetPassword: 'Reset Password',
    student: 'Student',
    teacher: 'Teacher',
    admin: 'Administrator',
    cancel: 'Cancel',
    save: 'Save',
    reset: 'Reset',
    editUser: 'Edit User',
    addNewUser: 'Add New User',
    confirmDelete: 'Confirm Deletion',
    confirmDeleteMessage: 'Are you sure you want to delete this user? This action cannot be undone.',
    confirmResetPassword: 'Reset Password',
    confirmResetPasswordMessage: 'Are you sure you want to reset the password for this user? A new temporary password will be generated.',
    firstName: 'First Name',
    lastName: 'Last Name',
    selectRole: 'Select role',
    selectStatus: 'Select status',
    selectAuthType: 'Select authentication type',
    allFieldsRequired: 'Please fill in all required fields',
    invalidEmail: 'Email must end with @polytechnic.am',
    active: 'Active',
    inactive: 'Inactive',
    pending: 'Pending',
    microsoft: 'Microsoft',
    local: 'Local',
    filters: 'Filters',
    allRoles: 'All Roles',
    allStatuses: 'All Statuses',
    allAuthTypes: 'All Auth Types',
    clearFilters: 'Clear Filters',
    showing: 'Showing',
    of: 'of',
    users: 'users',
    previous: 'Previous',
    next: 'Next',
    manageUsers: 'Manage students, teachers, and administrators',
    userDeleted: 'User deleted successfully',
    userAdded: 'User added successfully',
    userUpdated: 'User updated successfully',
    passwordReset: 'Password reset successfully. New password:',
    sendInvitation: 'Send Invitation',
    invitationSent: 'Invitation sent successfully',
    localAccountNote: 'Local accounts require manual password setup',
    microsoftAccountNote: 'Microsoft accounts use university email authentication',
  },
  hy: {
    userManagement: 'Օգտատերերի Կառավարում',
    addUser: 'Ավելացնել Օգտատեր',
    searchUsers: 'Փնտրել ըստ անվան կամ էլ. փոստի...',
    name: 'Անուն',
    email: 'Էլ. փոստ',
    role: 'Դեր',
    status: 'Կարգավիճակ',
    authType: 'Նույնականացման Տեսակ',
    actions: 'Գործողություններ',
    edit: 'Խմբագրել',
    delete: 'Ջնջել',
    resetPassword: 'Վերականգնել Գաղտնաբառը',
    student: 'Ուսանող',
    teacher: 'Դասախոս',
    admin: 'Ադմինիստրատոր',
    cancel: 'Չեղարկել',
    save: 'Պահպանել',
    reset: 'Վերականգնել',
    editUser: 'Խմբագրել Օգտատերը',
    addNewUser: 'Ավելացնել Նոր Օգտատեր',
    confirmDelete: 'Հաստատել Ջնջումը',
    confirmDeleteMessage: 'Վստա՞հ եք, որ ցանկանում եք ջնջել այս օգտատիրոջը: Այս գործողությունը հնարավոր չէ հետ շրջել:',
    confirmResetPassword: 'Վերականգնել Գաղտնաբառը',
    confirmResetPasswordMessage: 'Վստա՞հ եք, որ ցանկանում եք վերականգնել այս օգտատիրոջ գաղտնաբառը: Կստեղծվի նոր ժամանակավոր գաղտնաբառ:',
    firstName: 'Անուն',
    lastName: 'Ազգանուն',
    selectRole: 'Ընտրել դեր',
    selectStatus: 'Ընտրել կարգավիճակ',
    selectAuthType: 'Ընտրել նույնականացման տեսակ',
    allFieldsRequired: 'Խնդրում ենք լրացնել բոլոր պահանջվող դաշտերը',
    invalidEmail: 'Էլ. փոստը պետք է ավարտվի @polytechnic.am-ով',
    active: 'Ակտիվ',
    inactive: 'Անակտիվ',
    pending: 'Սպասվող',
    microsoft: 'Microsoft',
    local: 'Տեղական',
    filters: 'Ֆիլտրեր',
    allRoles: 'Բոլոր Դերերը',
    allStatuses: 'Բոլոր Կարգավիճակները',
    allAuthTypes: 'Բոլոր Տեսակները',
    clearFilters: 'Մաքրել Ֆիլտրերը',
    showing: 'Ցուցադրվում է',
    of: 'ից',
    users: 'օգտատեր',
    previous: 'Նախորդ',
    next: 'Հաջորդ',
    manageUsers: 'Կառավարել ուսանողներին, դասախոսներին և ադմինիստրատորներին',
    userDeleted: 'Օգտատերը հաջողությամբ ջնջվել է',
    userAdded: 'Օգտատերը հաջողությամբ ավելացվել է',
    userUpdated: 'Օգտատերը հաջողությամբ թարմացվել է',
    passwordReset: 'Գաղտնաբառը հաջողությամբ վերականգնվել է: Նոր գաղտնաբառ՝',
    sendInvitation: 'Ուղարկել Հրավեր',
    invitationSent: 'Հրավերը հաջողությամբ ուղարկվել է',
    localAccountNote: 'Տեղական հաշիվները պահանջում են ձեռքով գաղտնաբառի կարգավորում',
    microsoftAccountNote: 'Microsoft հաշիվները օգտագործում են համալսարանի էլ. փոստի նույնականացում',
  },
  ru: {
    userManagement: 'Управление Пользователями',
    addUser: 'Добавить Пользователя',
    searchUsers: 'Поиск по имени или email...',
    name: 'Имя',
    email: 'Эл. почта',
    role: 'Роль',
    status: 'Статус',
    authType: 'Тип Аутентификации',
    actions: 'Действия',
    edit: 'Редактировать',
    delete: 'Удалить',
    resetPassword: 'Сбросить Пароль',
    student: 'Студент',
    teacher: 'Преподаватель',
    admin: 'Администратор',
    cancel: 'Отмена',
    save: 'Сохранить',
    reset: 'Сбросить',
    editUser: 'Редактировать Пользователя',
    addNewUser: 'Добавить Нового Пользователя',
    confirmDelete: 'Подтвердить Удаление',
    confirmDeleteMessage: 'Вы уверены, что хотите удалить этого пользователя? Это действие нельзя отменить.',
    confirmResetPassword: 'Сбросить Пароль',
    confirmResetPasswordMessage: 'Вы уверены, что хотите сбросить пароль для этого пользователя? Будет создан новый временный пароль.',
    firstName: 'Имя',
    lastName: 'Фамилия',
    selectRole: 'Выберите роль',
    selectStatus: 'Выберите статус',
    selectAuthType: 'Выберите тип аутентификации',
    allFieldsRequired: 'Пожалуйста, заполните все обязательные поля',
    invalidEmail: 'Электронная почта должна заканчиваться на @polytechnic.am',
    active: 'Активен',
    inactive: 'Неактивен',
    pending: 'Ожидание',
    microsoft: 'Microsoft',
    local: 'Локальный',
    filters: 'Фильтры',
    allRoles: 'Все Роли',
    allStatuses: 'Все Статусы',
    allAuthTypes: 'Все Типы',
    clearFilters: 'Очистить Фильтры',
    showing: 'Показано',
    of: 'из',
    users: 'пользователей',
    previous: 'Назад',
    next: 'Вперед',
    manageUsers: 'Управление студентами, преподавателями и администраторами',
    userDeleted: 'Пользователь успешно удален',
    userAdded: 'Пользователь успешно добавлен',
    userUpdated: 'Пользователь успешно обновлен',
    passwordReset: 'Пароль успешно сброшен. Новый пароль:',
    sendInvitation: 'Отправить Приглашение',
    invitationSent: 'Приглашение успешно отправлено',
    localAccountNote: 'Локальные аккаунты требуют ручной настройки пароля',
    microsoftAccountNote: 'Microsoft аккаунты используют аутентификацию через университетскую почту',
  }
};

type UserStatus = 'active' | 'inactive' | 'pending';
type AuthType = 'microsoft' | 'local';
type SortField = 'name' | 'email' | 'role' | 'status';
type SortOrder = 'asc' | 'desc';

interface User {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: 'student' | 'teacher' | 'admin';
  status: UserStatus;
  authType: AuthType;
}

interface UserManagementProps {
  language: 'en' | 'hy' | 'ru';
}

const initialUsers: User[] = [
  { id: 1, firstName: 'John', lastName: 'Smith', email: 'john.smith@polytechnic.am', role: 'student', status: 'active', authType: 'microsoft' },
  { id: 2, firstName: 'Sarah', lastName: 'Johnson', email: 'sarah.johnson@polytechnic.am', role: 'teacher', status: 'active', authType: 'microsoft' },
  { id: 3, firstName: 'Michael', lastName: 'Chen', email: 'michael.chen@polytechnic.am', role: 'teacher', status: 'active', authType: 'local' },
  { id: 4, firstName: 'Emma', lastName: 'Wilson', email: 'emma.wilson@polytechnic.am', role: 'student', status: 'pending', authType: 'microsoft' },
  { id: 5, firstName: 'Emily', lastName: 'Watson', email: 'emily.watson@polytechnic.am', role: 'teacher', status: 'active', authType: 'microsoft' },
  { id: 6, firstName: 'Admin', lastName: 'User', email: 'admin@polytechnic.am', role: 'admin', status: 'active', authType: 'local' },
  { id: 7, firstName: 'David', lastName: 'Brown', email: 'david.brown@polytechnic.am', role: 'student', status: 'inactive', authType: 'local' },
  { id: 8, firstName: 'James', lastName: 'Martinez', email: 'james.martinez@polytechnic.am', role: 'teacher', status: 'active', authType: 'microsoft' },
  { id: 9, firstName: 'Anna', lastName: 'Petrosyan', email: 'anna.petrosyan@polytechnic.am', role: 'student', status: 'active', authType: 'microsoft' },
  { id: 10, firstName: 'Armen', lastName: 'Sargsyan', email: 'armen.sargsyan@polytechnic.am', role: 'teacher', status: 'active', authType: 'local' },
  { id: 11, firstName: 'Maria', lastName: 'Garcia', email: 'maria.garcia@polytechnic.am', role: 'student', status: 'pending', authType: 'microsoft' },
  { id: 12, firstName: 'Robert', lastName: 'Anderson', email: 'robert.anderson@polytechnic.am', role: 'student', status: 'active', authType: 'microsoft' },
];

const ITEMS_PER_PAGE = 8;

export function UserManagement({ language }: UserManagementProps) {
  const t = translations[language];
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [resetPasswordDialogOpen, setResetPasswordDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [userToResetPassword, setUserToResetPassword] = useState<User | null>(null);
  const [formData, setFormData] = useState({ 
    firstName: '', 
    lastName: '', 
    email: '', 
    role: 'student' as User['role'],
    status: 'active' as UserStatus,
    authType: 'microsoft' as AuthType
  });

  // Filters
  const [roleFilter, setRoleFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [authTypeFilter, setAuthTypeFilter] = useState<string[]>([]);

  // Sorting
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);

  // Filter and sort users
  const filteredAndSortedUsers = users
    .filter((user) => {
      // Search filter
      const searchMatch =
        user.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase());

      // Role filter
      const roleMatch = roleFilter.length === 0 || roleFilter.includes(user.role);

      // Status filter
      const statusMatch = statusFilter.length === 0 || statusFilter.includes(user.status);

      // Auth type filter
      const authTypeMatch = authTypeFilter.length === 0 || authTypeFilter.includes(user.authType);

      return searchMatch && roleMatch && statusMatch && authTypeMatch;
    })
    .sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'name':
          comparison = `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
          break;
        case 'email':
          comparison = a.email.localeCompare(b.email);
          break;
        case 'role':
          comparison = a.role.localeCompare(b.role);
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

  // Pagination
  const totalPages = Math.ceil(filteredAndSortedUsers.length / ITEMS_PER_PAGE);
  const paginatedUsers = filteredAndSortedUsers.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const handleAddUser = () => {
    setEditingUser(null);
    setFormData({ 
      firstName: '', 
      lastName: '', 
      email: '', 
      role: 'student',
      status: 'active',
      authType: 'microsoft'
    });
    setDialogOpen(true);
  };

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setFormData({ 
      firstName: user.firstName, 
      lastName: user.lastName, 
      email: user.email, 
      role: user.role,
      status: user.status,
      authType: user.authType
    });
    setDialogOpen(true);
  };

  const handleDeleteClick = (user: User) => {
    setUserToDelete(user);
    setDeleteDialogOpen(true);
  };

  const handleResetPasswordClick = (user: User) => {
    setUserToResetPassword(user);
    setResetPasswordDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (userToDelete) {
      setUsers(users.filter((u) => u.id !== userToDelete.id));
      setDeleteDialogOpen(false);
      setUserToDelete(null);
      toast.success(t.userDeleted);
    }
  };

  const handleResetPasswordConfirm = () => {
    if (userToResetPassword) {
      // Generate random password
      const newPassword = Math.random().toString(36).slice(-8);
      setResetPasswordDialogOpen(false);
      setUserToResetPassword(null);
      toast.success(`${t.passwordReset} ${newPassword}`);
    }
  };

  const handleSave = () => {
    // Validation
    if (!formData.firstName.trim() || !formData.lastName.trim() || !formData.email.trim()) {
      toast.error(t.allFieldsRequired);
      return;
    }

    // Validate email format
    if (!formData.email.endsWith('@polytechnic.am')) {
      toast.error(t.invalidEmail);
      return;
    }

    const emailPart = formData.email.split('@')[0];
    if (!emailPart || emailPart.length === 0) {
      toast.error(t.invalidEmail);
      return;
    }

    if (!formData.role) {
      toast.error(t.allFieldsRequired);
      return;
    }

    if (editingUser) {
      setUsers(
        users.map((user) =>
          user.id === editingUser.id ? { ...user, ...formData } : user
        )
      );
      toast.success(t.userUpdated);
    } else {
      const newUser: User = {
        id: Math.max(...users.map((u) => u.id), 0) + 1,
        ...formData,
      };
      setUsers([...users, newUser]);
      toast.success(t.userAdded);
    }
    setDialogOpen(false);
  };

  const handleSendInvitation = () => {
    if (formData.authType === 'microsoft') {
      toast.success(t.invitationSent);
    }
  };

  const clearFilters = () => {
    setRoleFilter([]);
    setStatusFilter([]);
    setAuthTypeFilter([]);
    setSearchTerm('');
    setCurrentPage(1);
  };

  const getRoleBadgeColor = (role: User['role']) => {
    switch (role) {
      case 'admin':
        return 'bg-amber-500 dark:bg-amber-600 text-white hover:bg-amber-600 dark:hover:bg-amber-700';
      case 'teacher':
        return 'bg-blue-500 dark:bg-blue-600 text-white hover:bg-blue-600 dark:hover:bg-blue-700';
      case 'student':
        return 'bg-green-500 dark:bg-green-600 text-white hover:bg-green-600 dark:hover:bg-green-700';
      default:
        return 'bg-gray-500 text-white';
    }
  };

  const getStatusBadgeColor = (status: UserStatus) => {
    switch (status) {
      case 'active':
        return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800';
      case 'inactive':
        return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800';
      case 'pending':
        return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800';
      default:
        return 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300';
    }
  };

  const getAuthTypeBadge = (authType: AuthType) => {
    switch (authType) {
      case 'microsoft':
        return 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800';
      case 'local':
        return 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700';
    }
  };

  const getRoleIcon = (role: User['role']) => {
    switch (role) {
      case 'admin':
        return <Shield className="w-3 h-3" />;
      case 'teacher':
      case 'student':
        return <User className="w-3 h-3" />;
    }
  };

  const getRoleLabel = (role: User['role']) => {
    switch (role) {
      case 'admin':
        return t.admin;
      case 'teacher':
        return t.teacher;
      case 'student':
        return t.student;
    }
  };

  const getStatusLabel = (status: UserStatus) => {
    switch (status) {
      case 'active':
        return t.active;
      case 'inactive':
        return t.inactive;
      case 'pending':
        return t.pending;
    }
  };

  const getAuthTypeLabel = (authType: AuthType) => {
    switch (authType) {
      case 'microsoft':
        return t.microsoft;
      case 'local':
        return t.local;
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortOrder === 'asc' ? 
      <ChevronUp className="w-4 h-4 inline ml-1" /> : 
      <ChevronDown className="w-4 h-4 inline ml-1" />;
  };

  return (
    <div className="p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="mb-2 dark:text-gray-100">{t.userManagement}</h1>
            <p className="text-gray-600 dark:text-gray-400">{t.manageUsers}</p>
          </div>
          <Button 
            onClick={handleAddUser} 
            className="bg-[#225b73] hover:bg-[#1a4659] dark:bg-violet-600 dark:hover:bg-violet-700 w-full sm:w-auto"
          >
            <Plus className="w-4 h-4 mr-2" />
            {t.addUser}
          </Button>
        </div>

        {/* Search and Filters */}
        <div className="mb-6 flex flex-col lg:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <Input
              placeholder={t.searchUsers}
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-10 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
            />
          </div>

          {/* Filters Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
                <Filter className="w-4 h-4 mr-2" />
                {t.filters}
                {(roleFilter.length > 0 || statusFilter.length > 0 || authTypeFilter.length > 0) && (
                  <Badge className="ml-2 bg-[#225b73] dark:bg-violet-600 text-white">
                    {roleFilter.length + statusFilter.length + authTypeFilter.length}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 dark:bg-gray-800 dark:border-gray-700">
              <DropdownMenuLabel className="dark:text-gray-100">{t.allRoles}</DropdownMenuLabel>
              <DropdownMenuSeparator className="dark:bg-gray-700" />
              <DropdownMenuCheckboxItem
                checked={roleFilter.includes('student')}
                onCheckedChange={(checked) => {
                  setRoleFilter(checked ? [...roleFilter, 'student'] : roleFilter.filter(r => r !== 'student'));
                  setCurrentPage(1);
                }}
                className="dark:text-gray-300"
              >
                {t.student}
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={roleFilter.includes('teacher')}
                onCheckedChange={(checked) => {
                  setRoleFilter(checked ? [...roleFilter, 'teacher'] : roleFilter.filter(r => r !== 'teacher'));
                  setCurrentPage(1);
                }}
                className="dark:text-gray-300"
              >
                {t.teacher}
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={roleFilter.includes('admin')}
                onCheckedChange={(checked) => {
                  setRoleFilter(checked ? [...roleFilter, 'admin'] : roleFilter.filter(r => r !== 'admin'));
                  setCurrentPage(1);
                }}
                className="dark:text-gray-300"
              >
                {t.admin}
              </DropdownMenuCheckboxItem>

              <DropdownMenuSeparator className="dark:bg-gray-700" />
              <DropdownMenuLabel className="dark:text-gray-100">{t.allStatuses}</DropdownMenuLabel>
              <DropdownMenuSeparator className="dark:bg-gray-700" />
              <DropdownMenuCheckboxItem
                checked={statusFilter.includes('active')}
                onCheckedChange={(checked) => {
                  setStatusFilter(checked ? [...statusFilter, 'active'] : statusFilter.filter(s => s !== 'active'));
                  setCurrentPage(1);
                }}
                className="dark:text-gray-300"
              >
                {t.active}
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={statusFilter.includes('inactive')}
                onCheckedChange={(checked) => {
                  setStatusFilter(checked ? [...statusFilter, 'inactive'] : statusFilter.filter(s => s !== 'inactive'));
                  setCurrentPage(1);
                }}
                className="dark:text-gray-300"
              >
                {t.inactive}
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={statusFilter.includes('pending')}
                onCheckedChange={(checked) => {
                  setStatusFilter(checked ? [...statusFilter, 'pending'] : statusFilter.filter(s => s !== 'pending'));
                  setCurrentPage(1);
                }}
                className="dark:text-gray-300"
              >
                {t.pending}
              </DropdownMenuCheckboxItem>

              <DropdownMenuSeparator className="dark:bg-gray-700" />
              <DropdownMenuLabel className="dark:text-gray-100">{t.allAuthTypes}</DropdownMenuLabel>
              <DropdownMenuSeparator className="dark:bg-gray-700" />
              <DropdownMenuCheckboxItem
                checked={authTypeFilter.includes('microsoft')}
                onCheckedChange={(checked) => {
                  setAuthTypeFilter(checked ? [...authTypeFilter, 'microsoft'] : authTypeFilter.filter(a => a !== 'microsoft'));
                  setCurrentPage(1);
                }}
                className="dark:text-gray-300"
              >
                {t.microsoft}
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={authTypeFilter.includes('local')}
                onCheckedChange={(checked) => {
                  setAuthTypeFilter(checked ? [...authTypeFilter, 'local'] : authTypeFilter.filter(a => a !== 'local'));
                  setCurrentPage(1);
                }}
                className="dark:text-gray-300"
              >
                {t.local}
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {(roleFilter.length > 0 || statusFilter.length > 0 || authTypeFilter.length > 0 || searchTerm) && (
            <Button variant="outline" onClick={clearFilters} className="dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
              <RotateCcw className="w-4 h-4 mr-2" />
              {t.clearFilters}
            </Button>
          )}
        </div>

        {/* Users Table */}
        <Card className="overflow-hidden shadow-sm dark:bg-gray-800 dark:border-gray-700 mb-4">
          <div className="overflow-x-auto scroll-smooth">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                <tr>
                  <th 
                    className="px-6 py-4 text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                    onClick={() => handleSort('name')}
                  >
                    {t.name}
                    <SortIcon field="name" />
                  </th>
                  <th 
                    className="px-6 py-4 text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                    onClick={() => handleSort('email')}
                  >
                    {t.email}
                    <SortIcon field="email" />
                  </th>
                  <th 
                    className="px-6 py-4 text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                    onClick={() => handleSort('role')}
                  >
                    {t.role}
                    <SortIcon field="role" />
                  </th>
                  <th 
                    className="px-6 py-4 text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                    onClick={() => handleSort('status')}
                  >
                    {t.status}
                    <SortIcon field="status" />
                  </th>
                  <th className="px-6 py-4 text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t.authType}
                  </th>
                  <th className="px-6 py-4 text-right text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t.actions}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {paginatedUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="w-10 h-10 rounded-full bg-[#225b73]/10 dark:bg-violet-500/20 flex items-center justify-center mr-3">
                          <User className="w-5 h-5 text-[#225b73] dark:text-violet-400" />
                        </div>
                        <div className="text-gray-900 dark:text-gray-100">{user.firstName} {user.lastName}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center text-gray-600 dark:text-gray-400">
                        <Mail className="w-4 h-4 mr-2 text-gray-400 dark:text-gray-500" />
                        {user.email}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge className={`${getRoleBadgeColor(user.role)} flex items-center gap-1 w-fit`}>
                        {getRoleIcon(user.role)}
                        {getRoleLabel(user.role)}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant="outline" className={`${getStatusBadgeColor(user.status)} w-fit`}>
                        {getStatusLabel(user.status)}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant="outline" className={`${getAuthTypeBadge(user.authType)} w-fit`}>
                        {getAuthTypeLabel(user.authType)}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditUser(user)}
                          className="dark:hover:bg-gray-600"
                          title={t.edit}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        {user.authType === 'local' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleResetPasswordClick(user)}
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                            title={t.resetPassword}
                          >
                            <Key className="w-4 h-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteClick(user)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                          title={t.delete}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {t.showing} {(currentPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, filteredAndSortedUsers.length)} {t.of} {filteredAndSortedUsers.length} {t.users}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
              >
                {t.previous}
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <Button
                    key={page}
                    variant={page === currentPage ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCurrentPage(page)}
                    className={page === currentPage 
                      ? "bg-[#225b73] hover:bg-[#1a4659] dark:bg-violet-600 dark:hover:bg-violet-700" 
                      : "dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
                    }
                  >
                    {page}
                  </Button>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
              >
                {t.next}
              </Button>
            </div>
          </div>
        )}

        {/* Add/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="dark:bg-gray-800 dark:border-gray-700">
            <DialogHeader>
              <DialogTitle className="dark:text-gray-100">{editingUser ? t.editUser : t.addNewUser}</DialogTitle>
              <DialogDescription className="dark:text-gray-400">
                {editingUser ? 'Update user information' : 'Add a new user to the system'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName" className="dark:text-gray-100">{t.firstName}</Label>
                  <Input
                    id="firstName"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    placeholder="John"
                    className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName" className="dark:text-gray-100">{t.lastName}</Label>
                  <Input
                    id="lastName"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    placeholder="Doe"
                    className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="dark:text-gray-100">{t.email}</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="user@polytechnic.am"
                  className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="role" className="dark:text-gray-100">{t.role}</Label>
                  <Select
                    value={formData.role}
                    onValueChange={(value: User['role']) => setFormData({ ...formData, role: value })}
                  >
                    <SelectTrigger className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100">
                      <SelectValue placeholder={t.selectRole} />
                    </SelectTrigger>
                    <SelectContent className="dark:bg-gray-700 dark:border-gray-600">
                      <SelectItem value="student" className="dark:text-gray-100">{t.student}</SelectItem>
                      <SelectItem value="teacher" className="dark:text-gray-100">{t.teacher}</SelectItem>
                      <SelectItem value="admin" className="dark:text-gray-100">{t.admin}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status" className="dark:text-gray-100">{t.status}</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value: UserStatus) => setFormData({ ...formData, status: value })}
                  >
                    <SelectTrigger className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100">
                      <SelectValue placeholder={t.selectStatus} />
                    </SelectTrigger>
                    <SelectContent className="dark:bg-gray-700 dark:border-gray-600">
                      <SelectItem value="active" className="dark:text-gray-100">{t.active}</SelectItem>
                      <SelectItem value="inactive" className="dark:text-gray-100">{t.inactive}</SelectItem>
                      <SelectItem value="pending" className="dark:text-gray-100">{t.pending}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="authType" className="dark:text-gray-100">{t.authType}</Label>
                <Select
                  value={formData.authType}
                  onValueChange={(value: AuthType) => setFormData({ ...formData, authType: value })}
                >
                  <SelectTrigger className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100">
                    <SelectValue placeholder={t.selectAuthType} />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-gray-700 dark:border-gray-600">
                    <SelectItem value="microsoft" className="dark:text-gray-100">{t.microsoft}</SelectItem>
                    <SelectItem value="local" className="dark:text-gray-100">{t.local}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {formData.authType === 'microsoft' ? t.microsoftAccountNote : t.localAccountNote}
                </p>
              </div>
              {!editingUser && formData.authType === 'microsoft' && (
                <Button 
                  variant="outline" 
                  className="w-full dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                  onClick={handleSendInvitation}
                >
                  <Mail className="w-4 h-4 mr-2" />
                  {t.sendInvitation}
                </Button>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100">
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
              <AlertDialogCancel className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100">{t.cancel}</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteConfirm}
                className="bg-red-600 hover:bg-red-700"
              >
                {t.delete}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Reset Password Confirmation Dialog */}
        <AlertDialog open={resetPasswordDialogOpen} onOpenChange={setResetPasswordDialogOpen}>
          <AlertDialogContent className="dark:bg-gray-800 dark:border-gray-700">
            <AlertDialogHeader>
              <AlertDialogTitle className="dark:text-gray-100">{t.confirmResetPassword}</AlertDialogTitle>
              <AlertDialogDescription className="dark:text-gray-400">{t.confirmResetPasswordMessage}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100">{t.cancel}</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleResetPasswordConfirm}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {t.reset}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
