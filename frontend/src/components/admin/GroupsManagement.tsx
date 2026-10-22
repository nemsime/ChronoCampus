import { useEffect, useState } from 'react';
import { fetchGroups } from '../../api/groups';
import { Plus, Search, Edit, Trash2, Users, Building2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../ui/dialog';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Card } from '../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
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

const translations = {
  en: {
    groupsClassrooms: 'Groups & Classrooms',
    groups: 'Groups',
    classrooms: 'Classrooms',
    addGroup: 'Add Group',
    addClassroom: 'Add Classroom',
    searchGroups: 'Search groups...',
    searchClassrooms: 'Search classrooms...',
    groupName: 'Group Name',
    students: 'Students',
    classroom: 'Classroom',
    campus: 'Campus',
    floor: 'Floor',
    room: 'Room',
    capacity: 'Capacity',
    actions: 'Actions',
    edit: 'Edit',
    delete: 'Delete',
    cancel: 'Cancel',
    save: 'Save',
    editGroup: 'Edit Group',
    addNewGroup: 'Add New Group',
    editClassroom: 'Edit Classroom',
    addNewClassroom: 'Add New Classroom',
    confirmDelete: 'Confirm Deletion',
    confirmDeleteGroupMessage: 'Are you sure you want to delete this group? This action cannot be undone.',
    confirmDeleteClassroomMessage: 'Are you sure you want to delete this classroom? This action cannot be undone.',
    groupCode: 'Group Code',
    studentCount: 'Number of Students',
    classroomNumber: 'Classroom Number',
    year: 'Year'
  },
  hy: {
    groupsClassrooms: 'Խմբեր և Լսարաններ',
    groups: 'Խմբեր',
    classrooms: 'Լսարաններ',
    addGroup: 'Ավելացնել Խումբ',
    addClassroom: 'Ավելացնել Լսարան',
    searchGroups: 'Փնտրել խմբեր...',
    searchClassrooms: 'Փնտրել լսարաններ...',
    groupName: 'Խմբի Անվանում',
    students: 'Ուսանողներ',
    classroom: 'Լսարան',
    campus: 'Կորպուս',
    floor: 'Հարկ',
    room: 'Սենյակ',
    capacity: 'Տարողություն',
    actions: 'Գործողություններ',
    edit: 'Խմբագրել',
    delete: 'Ջնջել',
    cancel: 'Չեղարկել',
    save: 'Պահպանել',
    editGroup: 'Խմբագրել Խումբը',
    addNewGroup: 'Ավելացնել Նոր Խումբ',
    editClassroom: 'Խմբագրել Լսարանը',
    addNewClassroom: 'Ավելացնել Նոր Լսարան',
    confirmDelete: 'Հաստատել Ջնջումը',
    confirmDeleteGroupMessage: 'Վստա՞հ եք, որ ցանկանում եք ջնջել այս խումբը: Այս գործողությունը հնարավոր չէ հետ շրջել:',
    confirmDeleteClassroomMessage: 'Վստա՞հ եք, որ ցանկանում եք ջնջել այս լսարանը: Այս գործողությունը հնարավոր չէ հետ շրջել:',
    groupCode: 'Խմբի Կոդ',
    studentCount: 'Ուսանողների Քանակ',
    classroomNumber: 'Լսարանի Համար',
    year: 'Տարի'
  },
  ru: {
    groupsClassrooms: 'Группы и Аудитории',
    groups: 'Группы',
    classrooms: 'Аудитории',
    addGroup: 'Добавить Группу',
    addClassroom: 'Добавить Аудиторию',
    searchGroups: 'Искать группы...',
    searchClassrooms: 'Искать аудитории...',
    groupName: 'Название Группы',
    students: 'Студенты',
    classroom: 'Аудитория',
    campus: 'Кампус',
    floor: 'Этаж',
    room: 'Комната',
    capacity: 'Вместимость',
    actions: 'Действия',
    edit: 'Редактировать',
    delete: 'Удалить',
    cancel: 'Отмена',
    save: 'Сохранить',
    editGroup: 'Редактировать Группу',
    addNewGroup: 'Добавить Новую Группу',
    editClassroom: 'Редактировать Аудиторию',
    addNewClassroom: 'Добавить Новую Аудиторию',
    confirmDelete: 'Подтвердить Удаление',
    confirmDeleteGroupMessage: 'Вы уверены, что хотите удалить эту группу? Это действие нельзя отменить.',
    confirmDeleteClassroomMessage: 'Вы уверены, что хотите удалить эту аудиторию? Это действие нельзя отменить.',
    groupCode: 'Код Группы',
    studentCount: 'Количество Студентов',
    classroomNumber: 'Номер Аудитории',
    year: 'Год'
  }
};

interface Group {
  id: number;
  code: string;
  name: string;
  studentCount: number;
  year: number;
}

interface Classroom {
  id: number;
  number: string;
  campus: number;
  floor: number;
  room: number;
  capacity: number;
}

interface GroupsManagementProps {
  language: 'en' | 'hy' | 'ru';
}

const initialClassrooms: Classroom[] = [
  { id: 1, number: '3201', campus: 3, floor: 2, room: 1, capacity: 30 },
  { id: 2, number: '5308', campus: 5, floor: 3, room: 8, capacity: 40 },
  { id: 3, number: '12405', campus: 12, floor: 4, room: 5, capacity: 35 },
  { id: 4, number: '7210', campus: 7, floor: 2, room: 10, capacity: 25 },
  { id: 5, number: '1503', campus: 1, floor: 5, room: 3, capacity: 50 },
  { id: 6, number: '8107', campus: 8, floor: 1, room: 7, capacity: 45 },
  { id: 7, number: '19312', campus: 19, floor: 3, room: 12, capacity: 30 },
  { id: 8, number: '4206', campus: 4, floor: 2, room: 6, capacity: 35 },
  { id: 9, number: '11508', campus: 11, floor: 5, room: 8, capacity: 40 },
  { id: 10, number: '6409', campus: 6, floor: 4, room: 9, capacity: 28 },
];

export function GroupsManagement({ language }: GroupsManagementProps) {
  const t = translations[language];
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [groupsError, setGroupsError] = useState(false);
  const [reloadGroups, setReloadGroups] = useState(0);
  const groupMessages = {
    en: { loading: 'Loading groups…', error: 'Unable to load groups. Check that the API and database are available.', retry: 'Retry', empty: 'No groups found.', readonly: 'Groups are read-only for now. Classroom changes are demo-only.', major: 'Major', year: 'Admission year', capacity: 'Capacity' },
    hy: { loading: 'Խմբերը բեռնվում են…', error: 'Չհաջողվեց բեռնել խմբերը։ Ստուգեք API-ի և տվյալների բազայի հասանելիությունը։', retry: 'Կրկնել', empty: 'Խմբեր չեն գտնվել։', readonly: 'Խմբերն առայժմ միայն դիտելու համար են։ Լսարանների փոփոխությունները ցուցադրական են։', major: 'Մասնագիտություն', year: 'Ընդունման տարի', capacity: 'Տարողություն' },
    ru: { loading: 'Загрузка групп…', error: 'Не удалось загрузить группы. Проверьте доступность API и базы данных.', retry: 'Повторить', empty: 'Группы не найдены.', readonly: 'Группы пока доступны только для чтения. Изменения аудиторий демонстрационные.', major: 'Специальность', year: 'Год поступления', capacity: 'Вместимость' },
  }[language];

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    setGroupsLoading(true);
    setGroupsError(false);
    fetchGroups(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setGroups(data.map((group) => ({
            id: group.id, code: group.code, name: group.major_name,
            year: group.admission_year, studentCount: group.capacity,
          })));
        }
      })
      .catch(() => { if (active) setGroupsError(true); })
      .finally(() => {
        window.clearTimeout(timeout);
        if (active) setGroupsLoading(false);
      });
    return () => { active = false; window.clearTimeout(timeout); controller.abort(); };
  }, [reloadGroups]);

  const [classrooms, setClassrooms] = useState<Classroom[]>(initialClassrooms);
  const [searchTerm, setSearchTerm] = useState('');
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [classroomDialogOpen, setClassroomDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [editingClassroom, setEditingClassroom] = useState<Classroom | null>(null);
  const [itemToDelete, setItemToDelete] = useState<{ type: 'group' | 'classroom'; item: Group | Classroom } | null>(null);
  const [groupFormData, setGroupFormData] = useState({ code: '', name: '', studentCount: 0, year: 1 });
  const [classroomFormData, setClassroomFormData] = useState({ number: '', campus: 1, floor: 1, room: 1, capacity: 30 });

  const filteredGroups = groups.filter(
    (group) =>
      group.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      group.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredClassrooms = classrooms.filter((classroom) =>
    classroom.number.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Group handlers
  const handleAddGroup = () => {
    setEditingGroup(null);
    setGroupFormData({ code: '', name: '', studentCount: 0, year: 1 });
    setGroupDialogOpen(true);
  };

  const handleEditGroup = (group: Group) => {
    setEditingGroup(group);
    setGroupFormData({ code: group.code, name: group.name, studentCount: group.studentCount, year: group.year });
    setGroupDialogOpen(true);
  };

  const handleSaveGroup = () => {
    if (editingGroup) {
      setGroups(groups.map((g) => (g.id === editingGroup.id ? { ...g, ...groupFormData } : g)));
    } else {
      const newGroup: Group = {
        id: Math.max(...groups.map((g) => g.id), 0) + 1,
        ...groupFormData
      };
      setGroups([...groups, newGroup]);
    }
    setGroupDialogOpen(false);
  };

  // Classroom handlers
  const handleAddClassroom = () => {
    setEditingClassroom(null);
    setClassroomFormData({ number: '', campus: 1, floor: 1, room: 1, capacity: 30 });
    setClassroomDialogOpen(true);
  };

  const handleEditClassroom = (classroom: Classroom) => {
    setEditingClassroom(classroom);
    setClassroomFormData({
      number: classroom.number,
      campus: classroom.campus,
      floor: classroom.floor,
      room: classroom.room,
      capacity: classroom.capacity
    });
    setClassroomDialogOpen(true);
  };

  const handleSaveClassroom = () => {
    if (editingClassroom) {
      setClassrooms(classrooms.map((c) => (c.id === editingClassroom.id ? { ...c, ...classroomFormData } : c)));
    } else {
      const newClassroom: Classroom = {
        id: Math.max(...classrooms.map((c) => c.id), 0) + 1,
        ...classroomFormData
      };
      setClassrooms([...classrooms, newClassroom]);
    }
    setClassroomDialogOpen(false);
  };

  // Delete handlers
  const handleDeleteClick = (type: 'group' | 'classroom', item: Group | Classroom) => {
    setItemToDelete({ type, item });
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (itemToDelete) {
      if (itemToDelete.type === 'group') {
        setGroups(groups.filter((g) => g.id !== itemToDelete.item.id));
      } else {
        setClassrooms(classrooms.filter((c) => c.id !== itemToDelete.item.id));
      }
      setDeleteDialogOpen(false);
      setItemToDelete(null);
    }
  };

  return (
    <div className="p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="mb-2 dark:text-gray-100">{t.groupsClassrooms}</h1>
          <p className="text-gray-600 dark:text-gray-400">Manage student groups and classrooms</p>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="groups" className="w-full">
          <TabsList className="mb-6 dark:bg-gray-800 dark:border-gray-700">
            <TabsTrigger value="groups" className="dark:data-[state=active]:bg-gray-700 dark:text-gray-300">{t.groups}</TabsTrigger>
            <TabsTrigger value="classrooms" className="dark:data-[state=active]:bg-gray-700 dark:text-gray-300">{t.classrooms}</TabsTrigger>
          </TabsList>

          {/* Groups Tab */}
          <TabsContent value="groups" className="space-y-6">
            <p className="text-sm text-gray-600 dark:text-gray-400">{groupMessages.readonly}</p>
            {groupsLoading && <p role="status">{groupMessages.loading}</p>}
            {groupsError && (
              <div role="alert">
                <p>{groupMessages.error}</p>
                <Button onClick={() => setReloadGroups((value) => value + 1)}>{groupMessages.retry}</Button>
              </div>
            )}
            {!groupsLoading && !groupsError && filteredGroups.length === 0 && <p>{groupMessages.empty}</p>}

            <div className="flex items-center justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <Input
                  placeholder={t.searchGroups}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
                />
              </div>
              <Button disabled title={groupMessages.readonly} onClick={handleAddGroup} className="bg-[#225b73] hover:bg-[#1a4659] dark:bg-blue-600 dark:hover:bg-blue-700">
                <Plus className="w-4 h-4 mr-2" />
                {t.addGroup}
              </Button>
            </div>

            <Card className="overflow-hidden shadow-sm dark:bg-gray-800 dark:border-gray-700">
              <div className="overflow-x-auto scroll-smooth">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {t.groupCode}
                      </th>
                      <th className="px-6 py-4 text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {groupMessages.major}
                      </th>
                      <th className="px-6 py-4 text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {groupMessages.year}
                      </th>
                      <th className="px-6 py-4 text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {groupMessages.capacity}
                      </th>
                      <th className="px-6 py-4 text-right text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {t.actions}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {!groupsLoading && !groupsError && filteredGroups.map((group) => (
                      <tr key={group.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Badge className="bg-[#225b73] text-white">{group.code}</Badge>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center">
                            <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center mr-3">
                              <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div className="text-gray-900 dark:text-gray-100">{group.name}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-gray-600 dark:text-gray-400">{group.year}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-gray-600 dark:text-gray-400">{group.studentCount}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled title={groupMessages.readonly}
                            onClick={() => handleEditGroup(group)}
                            className="mr-2"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled title={groupMessages.readonly}
                            onClick={() => handleDeleteClick('group', group)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
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
          </TabsContent>

          {/* Classrooms Tab */}
          <TabsContent value="classrooms" className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <Input
                  placeholder={t.searchClassrooms}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
                />
              </div>
              <Button onClick={handleAddClassroom} className="bg-[#225b73] hover:bg-[#1a4659] dark:bg-violet-600 dark:hover:bg-violet-700">
                <Plus className="w-4 h-4 mr-2" />
                {t.addClassroom}
              </Button>
            </div>

            <Card className="overflow-hidden shadow-sm dark:bg-gray-800 dark:border-gray-700">
              <div className="overflow-x-auto scroll-smooth">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {t.classroomNumber}
                      </th>
                      <th className="px-6 py-4 text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {t.campus}
                      </th>
                      <th className="px-6 py-4 text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {t.floor}
                      </th>
                      <th className="px-6 py-4 text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {t.room}
                      </th>
                      <th className="px-6 py-4 text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {t.capacity}
                      </th>
                      <th className="px-6 py-4 text-right text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {t.actions}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {filteredClassrooms.map((classroom) => (
                      <tr key={classroom.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center">
                            <div className="w-10 h-10 rounded-lg bg-green-50 dark:bg-green-900/30 flex items-center justify-center mr-3">
                              <Building2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                            </div>
                            <div className="text-gray-900 dark:text-gray-100">{classroom.number}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-gray-600 dark:text-gray-400">Campus {classroom.campus}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-gray-600 dark:text-gray-400">Floor {classroom.floor}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-gray-600 dark:text-gray-400">Room {classroom.room}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Badge variant="outline">{classroom.capacity} seats</Badge>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditClassroom(classroom)}
                            className="mr-2"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteClick('classroom', classroom)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
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
          </TabsContent>
        </Tabs>

        {/* Group Add/Edit Dialog */}
        <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingGroup ? t.editGroup : t.addNewGroup}</DialogTitle>
              <DialogDescription>
                {editingGroup ? 'Update group information' : 'Add a new group to the system'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="groupCode">{t.groupCode}</Label>
                <Input
                  id="groupCode"
                  value={groupFormData.code}
                  onChange={(e) => setGroupFormData({ ...groupFormData, code: e.target.value })}
                  placeholder="CS-1A"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="groupName">{groupMessages.major}</Label>
                <Input
                  id="groupName"
                  value={groupFormData.name}
                  onChange={(e) => setGroupFormData({ ...groupFormData, name: e.target.value })}
                  placeholder="Computer Science 1A"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="year">{groupMessages.year}</Label>
                  <Input
                    id="year"
                    type="number"
                    min="1"
                    max="5"
                    value={groupFormData.year}
                    onChange={(e) => setGroupFormData({ ...groupFormData, year: parseInt(e.target.value) || 1 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="studentCount">{t.studentCount}</Label>
                  <Input
                    id="studentCount"
                    type="number"
                    min="0"
                    value={groupFormData.studentCount}
                    onChange={(e) =>
                      setGroupFormData({ ...groupFormData, studentCount: parseInt(e.target.value) || 0 })
                    }
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setGroupDialogOpen(false)}>
                {t.cancel}
              </Button>
              <Button onClick={handleSaveGroup} className="bg-[#225b73] hover:bg-[#1a4659]">
                {t.save}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Classroom Add/Edit Dialog */}
        <Dialog open={classroomDialogOpen} onOpenChange={setClassroomDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingClassroom ? t.editClassroom : t.addNewClassroom}</DialogTitle>
              <DialogDescription>
                {editingClassroom ? 'Update classroom information' : 'Add a new classroom to the system'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="classroomNumber">{t.classroomNumber}</Label>
                <Input
                  id="classroomNumber"
                  value={classroomFormData.number}
                  onChange={(e) => setClassroomFormData({ ...classroomFormData, number: e.target.value })}
                  placeholder="5308"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="campus">{t.campus}</Label>
                  <Input
                    id="campus"
                    type="number"
                    min="1"
                    max="21"
                    value={classroomFormData.campus}
                    onChange={(e) =>
                      setClassroomFormData({ ...classroomFormData, campus: parseInt(e.target.value) || 1 })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="floor">{t.floor}</Label>
                  <Input
                    id="floor"
                    type="number"
                    min="1"
                    max="9"
                    value={classroomFormData.floor}
                    onChange={(e) =>
                      setClassroomFormData({ ...classroomFormData, floor: parseInt(e.target.value) || 1 })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="room">{t.room}</Label>
                  <Input
                    id="room"
                    type="number"
                    min="1"
                    max="99"
                    value={classroomFormData.room}
                    onChange={(e) =>
                      setClassroomFormData({ ...classroomFormData, room: parseInt(e.target.value) || 1 })
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="capacity">{t.capacity}</Label>
                <Input
                  id="capacity"
                  type="number"
                  min="1"
                  value={classroomFormData.capacity}
                  onChange={(e) =>
                    setClassroomFormData({ ...classroomFormData, capacity: parseInt(e.target.value) || 30 })
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setClassroomDialogOpen(false)}>
                {t.cancel}
              </Button>
              <Button onClick={handleSaveClassroom} className="bg-[#225b73] hover:bg-[#1a4659]">
                {t.save}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t.confirmDelete}</AlertDialogTitle>
              <AlertDialogDescription>
                {itemToDelete?.type === 'group'
                  ? t.confirmDeleteGroupMessage
                  : t.confirmDeleteClassroomMessage}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
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