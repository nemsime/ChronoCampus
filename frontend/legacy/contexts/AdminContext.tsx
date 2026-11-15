import React, { createContext, useContext, useState, ReactNode } from 'react';
import { toast } from 'sonner@2.0.3';

// Types
export interface User {
  id: number;
  name: string;
  email: string;
  role: 'student' | 'teacher' | 'admin';
  groupId?: number;
  groupCode?: string;
  status: 'active' | 'inactive';
  joinedDate: string;
}

export interface Subject {
  id: number;
  name: string;
  code: string;
  credits: number;
  hoursPerWeek: number; // Calculated: credits * 80 / 16 weeks
  department: string;
  courseYear: number;
  type: 'lecture' | 'practice' | 'lab' | 'mixed';
}

export interface Group {
  id: number;
  code: string;
  size: number;
  courseYear: number;
  department: string;
}

export interface Classroom {
  id: number;
  number: string;
  capacity: number;
  campus: string;
  floor: number;
  building: string;
  equipment?: string[];
}

export interface Semester {
  id: number;
  name: string; // e.g., "Fall 2024", "Spring 2025"
  startDate: string;
  endDate: string;
  weeksCount: number;
  isCurrent: boolean;
}

// NEW: Course Assignment - links Teacher + Subject + Group for a semester
export interface CourseAssignment {
  id: number;
  subjectId: number;
  subjectName: string;
  subjectCode: string;
  teacherId: number;
  teacherName: string;
  groupId: number;
  groupCode: string;
  groupSize: number;
  semesterId: number;
  semesterName: string;
  hoursPerWeek: number; // Total hours needed per week
  hoursScheduled: number; // Hours already in schedule
  type: 'lecture' | 'practice' | 'lab';
}

export interface Schedule {
  id: number;
  assignmentId: number; // Links to CourseAssignment
  subjectId: number;
  subjectName: string;
  subjectCode: string;
  teacherId: number;
  teacherName: string;
  classroomId: number;
  classroomNumber: string;
  classroomCapacity: number;
  groupId: number;
  groupCode: string;
  groupSize: number;
  semesterId: number;
  day: string;
  timeSlot: string;
  week: 'numerator' | 'denominator' | 'both';
  duration: number; // 80 minutes
}

export interface Feedback {
  id: number;
  userId: number;
  userName: string;
  userEmail: string;
  subject: string;
  message: string;
  status: 'pending' | 'reviewed' | 'resolved';
  priority: 'low' | 'medium' | 'high';
  date: string;
}

interface AdminContextType {
  // Data
  users: User[];
  subjects: Subject[];
  groups: Group[];
  classrooms: Classroom[];
  semesters: Semester[];
  courseAssignments: CourseAssignment[];
  schedules: Schedule[];
  feedbacks: Feedback[];
  
  // User operations
  addUser: (user: Omit<User, 'id'>) => void;
  updateUser: (id: number, user: Partial<User>) => void;
  deleteUser: (id: number) => void;
  
  // Subject operations
  addSubject: (subject: Omit<Subject, 'id'>) => void;
  updateSubject: (id: number, subject: Partial<Subject>) => void;
  deleteSubject: (id: number) => void;
  
  // Group operations
  addGroup: (group: Omit<Group, 'id'>) => void;
  updateGroup: (id: number, group: Partial<Group>) => void;
  deleteGroup: (id: number) => void;
  
  // Classroom operations
  addClassroom: (classroom: Omit<Classroom, 'id'>) => void;
  updateClassroom: (id: number, classroom: Partial<Classroom>) => void;
  deleteClassroom: (id: number) => void;
  
  // Semester operations
  addSemester: (semester: Omit<Semester, 'id'>) => void;
  updateSemester: (id: number, semester: Partial<Semester>) => void;
  deleteSemester: (id: number) => void;
  setCurrentSemester: (id: number) => void;
  getCurrentSemester: () => Semester | undefined;
  
  // Course Assignment operations
  addCourseAssignment: (assignment: Omit<CourseAssignment, 'id' | 'hoursScheduled'>) => void;
  updateCourseAssignment: (id: number, assignment: Partial<CourseAssignment>) => void;
  deleteCourseAssignment: (id: number) => void;
  getAssignmentsByTeacher: (teacherId: number) => CourseAssignment[];
  getAssignmentsByGroup: (groupId: number) => CourseAssignment[];
  getAssignmentsBySemester: (semesterId: number) => CourseAssignment[];
  
  // Schedule operations
  addSchedule: (schedule: Omit<Schedule, 'id'>) => void;
  updateSchedule: (id: number, schedule: Partial<Schedule>) => void;
  deleteSchedule: (id: number) => void;
  checkScheduleConflicts: (schedule: Partial<Schedule>, excludeId?: number) => {
    hasConflicts: boolean;
    conflicts: string[];
    hasWarnings: boolean;
    warnings: string[];
  };
  
  // Feedback operations
  updateFeedbackStatus: (id: number, status: Feedback['status']) => void;
  updateFeedbackPriority: (id: number, priority: Feedback['priority']) => void;
  deleteFeedback: (id: number) => void;
  
  // Helper functions
  getUsersByRole: (role: User['role']) => User[];
  getSubjectsByDepartment: (department: string) => Subject[];
  getSchedulesByGroup: (groupId: number) => Schedule[];
  getSchedulesByTeacher: (teacherId: number) => Schedule[];
  getSchedulesByClassroom: (classroomId: number) => Schedule[];
  getSchedulesBySemester: (semesterId: number) => Schedule[];
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

// Initial mock data
const initialUsers: User[] = [
  {
    id: 1,
    name: 'Prof. Sarah Johnson',
    email: 'sarah.johnson@polytechnic.am',
    role: 'teacher',
    status: 'active',
    joinedDate: '2023-01-15'
  },
  {
    id: 2,
    name: 'Prof. Michael Chen',
    email: 'michael.chen@polytechnic.am',
    role: 'teacher',
    status: 'active',
    joinedDate: '2023-02-20'
  },
  {
    id: 3,
    name: 'Prof. Emily Watson',
    email: 'emily.watson@polytechnic.am',
    role: 'teacher',
    status: 'active',
    joinedDate: '2023-03-10'
  },
  {
    id: 4,
    name: 'Prof. James Martinez',
    email: 'james.martinez@polytechnic.am',
    role: 'teacher',
    status: 'active',
    joinedDate: '2023-04-05'
  },
  {
    id: 5,
    name: 'Prof. Linda Brown',
    email: 'linda.brown@polytechnic.am',
    role: 'teacher',
    status: 'active',
    joinedDate: '2023-05-12'
  },
  {
    id: 6,
    name: 'John Smith',
    email: 'john.smith@polytechnic.am',
    role: 'student',
    groupId: 1,
    groupCode: 'CS-1A',
    status: 'active',
    joinedDate: '2024-09-01'
  },
  {
    id: 7,
    name: 'Emma Wilson',
    email: 'emma.wilson@polytechnic.am',
    role: 'student',
    groupId: 1,
    groupCode: 'CS-1A',
    status: 'active',
    joinedDate: '2024-09-01'
  },
  {
    id: 8,
    name: 'Admin User',
    email: 'admin@polytechnic.am',
    role: 'admin',
    status: 'active',
    joinedDate: '2023-01-01'
  }
];

const initialSubjects: Subject[] = [
  { id: 1, name: 'Computer Science Fundamentals', code: 'IT101', credits: 6, hoursPerWeek: 30, department: 'Computer Science', courseYear: 1, type: 'lecture' },
  { id: 2, name: 'Mathematics for Computing', code: 'MT205', credits: 5, hoursPerWeek: 25, department: 'Mathematics', courseYear: 1, type: 'lecture' },
  { id: 3, name: 'Database Systems', code: 'DB319', credits: 6, hoursPerWeek: 30, department: 'Computer Science', courseYear: 2, type: 'lab' },
  { id: 4, name: 'Web Development', code: 'WD217', credits: 5, hoursPerWeek: 25, department: 'Computer Science', courseYear: 2, type: 'practice' },
  { id: 5, name: 'Software Engineering', code: 'SE401', credits: 6, hoursPerWeek: 30, department: 'Computer Science', courseYear: 3, type: 'mixed' },
];

const initialGroups: Group[] = [
  { id: 1, code: 'CS-1A', size: 25, courseYear: 1, department: 'Computer Science' },
  { id: 2, code: 'CS-1B', size: 28, courseYear: 1, department: 'Computer Science' },
  { id: 3, code: 'CS-2A', size: 32, courseYear: 2, department: 'Computer Science' },
  { id: 4, code: 'CS-2B', size: 24, courseYear: 2, department: 'Computer Science' },
  { id: 5, code: 'CS-3A', size: 35, courseYear: 3, department: 'Computer Science' },
];

const initialClassrooms: Classroom[] = [
  { id: 1, number: '3201', capacity: 30, campus: 'Campus 3', floor: 2, building: '3', equipment: ['Projector', 'Whiteboard'] },
  { id: 2, number: '5308', capacity: 40, campus: 'Campus 5', floor: 3, building: '5', equipment: ['Projector', 'Computers'] },
  { id: 3, number: '12405', capacity: 35, campus: 'Campus 12', floor: 4, building: '12', equipment: ['Projector', 'Whiteboard', 'Smart Board'] },
  { id: 4, number: '7210', capacity: 25, campus: 'Campus 7', floor: 2, building: '7', equipment: ['Projector'] },
  { id: 5, number: '1503', capacity: 50, campus: 'Campus 1', floor: 5, building: '1', equipment: ['Projector', 'Computers', 'Lab Equipment'] },
];

const initialSemesters: Semester[] = [
  { id: 1, name: 'Fall 2024', startDate: '2024-09-01', endDate: '2024-12-15', weeksCount: 16, isCurrent: true },
  { id: 2, name: 'Spring 2025', startDate: '2025-01-15', endDate: '2025-05-15', weeksCount: 16, isCurrent: false },
];

const initialCourseAssignments: CourseAssignment[] = [
  {
    id: 1,
    subjectId: 1,
    subjectName: 'Computer Science Fundamentals',
    subjectCode: 'IT101',
    teacherId: 1,
    teacherName: 'Prof. Sarah Johnson',
    groupId: 1,
    groupCode: 'CS-1A',
    groupSize: 25,
    semesterId: 1,
    semesterName: 'Fall 2024',
    hoursPerWeek: 30,
    hoursScheduled: 0,
    type: 'lecture'
  },
  {
    id: 2,
    subjectId: 2,
    subjectName: 'Mathematics for Computing',
    subjectCode: 'MT205',
    teacherId: 2,
    teacherName: 'Prof. Michael Chen',
    groupId: 1,
    groupCode: 'CS-1A',
    groupSize: 25,
    semesterId: 1,
    semesterName: 'Fall 2024',
    hoursPerWeek: 25,
    hoursScheduled: 0,
    type: 'lecture'
  },
  {
    id: 3,
    subjectId: 3,
    subjectName: 'Database Systems',
    subjectCode: 'DB319',
    teacherId: 3,
    teacherName: 'Prof. Emily Watson',
    groupId: 2,
    groupCode: 'CS-1B',
    groupSize: 28,
    semesterId: 1,
    semesterName: 'Fall 2024',
    hoursPerWeek: 30,
    hoursScheduled: 0,
    type: 'lab'
  },
];

const initialSchedules: Schedule[] = [
  {
    id: 1,
    assignmentId: 1,
    subjectId: 1,
    subjectName: 'Computer Science Fundamentals',
    subjectCode: 'IT101',
    teacherId: 1,
    teacherName: 'Prof. Sarah Johnson',
    classroomId: 1,
    classroomNumber: '3201',
    classroomCapacity: 30,
    groupId: 1,
    groupCode: 'CS-1A',
    groupSize: 25,
    semesterId: 1,
    day: 'Monday',
    timeSlot: '09:30 - 10:50',
    week: 'both',
    duration: 80
  },
  {
    id: 2,
    assignmentId: 2,
    subjectId: 2,
    subjectName: 'Mathematics for Computing',
    subjectCode: 'MT205',
    teacherId: 2,
    teacherName: 'Prof. Michael Chen',
    classroomId: 2,
    classroomNumber: '5308',
    classroomCapacity: 40,
    groupId: 1,
    groupCode: 'CS-1A',
    groupSize: 25,
    semesterId: 1,
    day: 'Monday',
    timeSlot: '11:00 - 12:20',
    week: 'numerator',
    duration: 80
  },
  {
    id: 3,
    assignmentId: 3,
    subjectId: 3,
    subjectName: 'Database Systems',
    subjectCode: 'DB319',
    teacherId: 3,
    teacherName: 'Prof. Emily Watson',
    classroomId: 3,
    classroomNumber: '12405',
    classroomCapacity: 35,
    groupId: 2,
    groupCode: 'CS-1B',
    groupSize: 28,
    semesterId: 1,
    day: 'Tuesday',
    timeSlot: '09:30 - 10:50',
    week: 'both',
    duration: 80
  },
];

const initialFeedbacks: Feedback[] = [
  {
    id: 1,
    userId: 6,
    userName: 'John Smith',
    userEmail: 'john.smith@polytechnic.am',
    subject: 'Schedule Conflict Issue',
    message: 'There seems to be an issue with my Monday schedule. Two classes are overlapping.',
    status: 'pending',
    priority: 'high',
    date: '2024-12-07'
  },
  {
    id: 2,
    userId: 7,
    userName: 'Emma Wilson',
    userEmail: 'emma.wilson@polytechnic.am',
    subject: 'Feature Request',
    message: 'It would be great if we could export our schedule as PDF.',
    status: 'reviewed',
    priority: 'medium',
    date: '2024-12-06'
  },
];

export function AdminProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [subjects, setSubjects] = useState<Subject[]>(initialSubjects);
  const [groups, setGroups] = useState<Group[]>(initialGroups);
  const [classrooms, setClassrooms] = useState<Classroom[]>(initialClassrooms);
  const [semesters, setSemesters] = useState<Semester[]>(initialSemesters);
  const [courseAssignments, setCourseAssignments] = useState<CourseAssignment[]>(initialCourseAssignments);
  const [schedules, setSchedules] = useState<Schedule[]>(initialSchedules);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>(initialFeedbacks);

  // User operations
  const addUser = (user: Omit<User, 'id'>) => {
    const newUser: User = {
      ...user,
      id: Math.max(...users.map(u => u.id), 0) + 1
    };
    setUsers([...users, newUser]);
    toast.success('User added successfully');
  };

  const updateUser = (id: number, updatedData: Partial<User>) => {
    setUsers(users.map(user => user.id === id ? { ...user, ...updatedData } : user));
    
    // Update related schedules if user is a teacher
    const user = users.find(u => u.id === id);
    if (user?.role === 'teacher' && updatedData.name) {
      setSchedules(schedules.map(schedule => 
        schedule.teacherId === id 
          ? { ...schedule, teacherName: updatedData.name! }
          : schedule
      ));
    }
    
    toast.success('User updated successfully');
  };

  const deleteUser = (id: number) => {
    const user = users.find(u => u.id === id);
    
    // Check if user is a teacher with assigned subjects
    if (user?.role === 'teacher') {
      const assignedSubjects = subjects.filter(s => s.teacherId === id);
      const assignedSchedules = schedules.filter(s => s.teacherId === id);
      
      if (assignedSubjects.length > 0 || assignedSchedules.length > 0) {
        toast.error('Cannot delete teacher with assigned subjects or schedules');
        return;
      }
    }
    
    setUsers(users.filter(user => user.id !== id));
    toast.success('User deleted successfully');
  };

  // Subject operations
  const addSubject = (subject: Omit<Subject, 'id'>) => {
    const newSubject: Subject = {
      ...subject,
      id: Math.max(...subjects.map(s => s.id), 0) + 1
    };
    setSubjects([...subjects, newSubject]);
    toast.success('Subject added successfully');
  };

  const updateSubject = (id: number, updatedData: Partial<Subject>) => {
    setSubjects(subjects.map(subject => subject.id === id ? { ...subject, ...updatedData } : subject));
    
    // Update related schedules
    if (updatedData.name) {
      setSchedules(schedules.map(schedule => 
        schedule.subjectId === id 
          ? { ...schedule, subjectName: updatedData.name! }
          : schedule
      ));
    }
    
    toast.success('Subject updated successfully');
  };

  const deleteSubject = (id: number) => {
    // Check if subject is used in schedules
    const usedInSchedules = schedules.some(s => s.subjectId === id);
    
    if (usedInSchedules) {
      toast.error('Cannot delete subject that is used in schedules');
      return;
    }
    
    setSubjects(subjects.filter(subject => subject.id !== id));
    toast.success('Subject deleted successfully');
  };

  // Group operations
  const addGroup = (group: Omit<Group, 'id'>) => {
    const newGroup: Group = {
      ...group,
      id: Math.max(...groups.map(g => g.id), 0) + 1
    };
    setGroups([...groups, newGroup]);
    toast.success('Group added successfully');
  };

  const updateGroup = (id: number, updatedData: Partial<Group>) => {
    setGroups(groups.map(group => group.id === id ? { ...group, ...updatedData } : group));
    
    // Update related schedules
    if (updatedData.code || updatedData.size) {
      setSchedules(schedules.map(schedule => 
        schedule.groupId === id 
          ? { 
              ...schedule, 
              groupCode: updatedData.code || schedule.groupCode,
              groupSize: updatedData.size || schedule.groupSize
            }
          : schedule
      ));
    }
    
    // Update students in this group
    if (updatedData.code) {
      setUsers(users.map(user => 
        user.groupId === id 
          ? { ...user, groupCode: updatedData.code }
          : user
      ));
    }
    
    toast.success('Group updated successfully');
  };

  const deleteGroup = (id: number) => {
    // Check if group is used in schedules
    const usedInSchedules = schedules.some(s => s.groupId === id);
    const hasStudents = users.some(u => u.groupId === id);
    
    if (usedInSchedules) {
      toast.error('Cannot delete group that is used in schedules');
      return;
    }
    
    if (hasStudents) {
      toast.error('Cannot delete group that has students');
      return;
    }
    
    setGroups(groups.filter(group => group.id !== id));
    toast.success('Group deleted successfully');
  };

  // Classroom operations
  const addClassroom = (classroom: Omit<Classroom, 'id'>) => {
    const newClassroom: Classroom = {
      ...classroom,
      id: Math.max(...classrooms.map(c => c.id), 0) + 1
    };
    setClassrooms([...classrooms, newClassroom]);
    toast.success('Classroom added successfully');
  };

  const updateClassroom = (id: number, updatedData: Partial<Classroom>) => {
    setClassrooms(classrooms.map(classroom => classroom.id === id ? { ...classroom, ...updatedData } : classroom));
    
    // Update related schedules
    if (updatedData.number || updatedData.capacity) {
      setSchedules(schedules.map(schedule => 
        schedule.classroomId === id 
          ? { 
              ...schedule, 
              classroomNumber: updatedData.number || schedule.classroomNumber,
              classroomCapacity: updatedData.capacity || schedule.classroomCapacity
            }
          : schedule
      ));
    }
    
    toast.success('Classroom updated successfully');
  };

  const deleteClassroom = (id: number) => {
    // Check if classroom is used in schedules
    const usedInSchedules = schedules.some(s => s.classroomId === id);
    
    if (usedInSchedules) {
      toast.error('Cannot delete classroom that is used in schedules');
      return;
    }
    
    setClassrooms(classrooms.filter(classroom => classroom.id !== id));
    toast.success('Classroom deleted successfully');
  };

  // Semester operations
  const addSemester = (semester: Omit<Semester, 'id'>) => {
    const newSemester: Semester = {
      ...semester,
      id: Math.max(...semesters.map(s => s.id), 0) + 1
    };
    setSemesters([...semesters, newSemester]);
    toast.success('Semester added successfully');
  };

  const updateSemester = (id: number, updatedData: Partial<Semester>) => {
    setSemesters(semesters.map(semester => semester.id === id ? { ...semester, ...updatedData } : semester));
    
    // Update related schedules
    if (updatedData.name) {
      setSchedules(schedules.map(schedule => 
        schedule.semesterId === id 
          ? { ...schedule, semesterName: updatedData.name! }
          : schedule
      ));
    }
    
    toast.success('Semester updated successfully');
  };

  const deleteSemester = (id: number) => {
    // Check if semester is used in schedules
    const usedInSchedules = schedules.some(s => s.semesterId === id);
    
    if (usedInSchedules) {
      toast.error('Cannot delete semester that is used in schedules');
      return;
    }
    
    setSemesters(semesters.filter(semester => semester.id !== id));
    toast.success('Semester deleted successfully');
  };

  const setCurrentSemester = (id: number) => {
    setSemesters(semesters.map(semester => 
      semester.id === id 
        ? { ...semester, isCurrent: true }
        : { ...semester, isCurrent: false }
    ));
    toast.success('Current semester set successfully');
  };

  const getCurrentSemester = () => {
    return semesters.find(s => s.isCurrent);
  };

  // Course Assignment operations
  const addCourseAssignment = (assignment: Omit<CourseAssignment, 'id' | 'hoursScheduled'>) => {
    const newAssignment: CourseAssignment = {
      ...assignment,
      id: Math.max(...courseAssignments.map(a => a.id), 0) + 1,
      hoursScheduled: 0
    };
    setCourseAssignments([...courseAssignments, newAssignment]);
    toast.success('Course assignment added successfully');
  };

  const updateCourseAssignment = (id: number, updatedData: Partial<CourseAssignment>) => {
    setCourseAssignments(courseAssignments.map(assignment => assignment.id === id ? { ...assignment, ...updatedData } : assignment));
    
    // Update related schedules
    if (updatedData.subjectName || updatedData.teacherName || updatedData.groupCode || updatedData.semesterName) {
      setSchedules(schedules.map(schedule => 
        schedule.assignmentId === id 
          ? { 
              ...schedule, 
              subjectName: updatedData.subjectName || schedule.subjectName,
              teacherName: updatedData.teacherName || schedule.teacherName,
              groupCode: updatedData.groupCode || schedule.groupCode,
              semesterName: updatedData.semesterName || schedule.semesterName
            }
          : schedule
      ));
    }
    
    toast.success('Course assignment updated successfully');
  };

  const deleteCourseAssignment = (id: number) => {
    // Check if assignment is used in schedules
    const usedInSchedules = schedules.some(s => s.assignmentId === id);
    
    if (usedInSchedules) {
      toast.error('Cannot delete course assignment that is used in schedules');
      return;
    }
    
    setCourseAssignments(courseAssignments.filter(assignment => assignment.id !== id));
    toast.success('Course assignment deleted successfully');
  };

  const getAssignmentsByTeacher = (teacherId: number) => {
    return courseAssignments.filter(assignment => assignment.teacherId === teacherId);
  };

  const getAssignmentsByGroup = (groupId: number) => {
    return courseAssignments.filter(assignment => assignment.groupId === groupId);
  };

  const getAssignmentsBySemester = (semesterId: number) => {
    return courseAssignments.filter(assignment => assignment.semesterId === semesterId);
  };

  // Schedule operations
  const checkScheduleConflicts = (schedule: Partial<Schedule>, excludeId?: number) => {
    const conflicts: string[] = [];
    const warnings: string[] = [];
    
    // Check capacity
    const classroom = classrooms.find(c => c.id === schedule.classroomId);
    const group = groups.find(g => g.id === schedule.groupId);
    
    if (classroom && group && group.size > classroom.capacity) {
      warnings.push(`Classroom capacity (${classroom.capacity}) is less than group size (${group.size})`);
    }
    
    // Check time conflicts
    schedules.forEach((existingSchedule) => {
      if (excludeId && existingSchedule.id === excludeId) return;
      
      if (existingSchedule.day !== schedule.day || existingSchedule.timeSlot !== schedule.timeSlot) return;
      
      const weeksOverlap = 
        schedule.week === 'both' || 
        existingSchedule.week === 'both' || 
        schedule.week === existingSchedule.week;
      
      if (!weeksOverlap) return;
      
      if (existingSchedule.teacherId === schedule.teacherId) {
        conflicts.push('Teacher is already scheduled at this time');
      }
      
      if (existingSchedule.classroomId === schedule.classroomId) {
        conflicts.push('Classroom is already booked at this time');
      }
      
      if (existingSchedule.groupId === schedule.groupId) {
        conflicts.push('Group already has a class at this time');
      }
    });
    
    return {
      hasConflicts: conflicts.length > 0,
      conflicts: [...new Set(conflicts)],
      hasWarnings: warnings.length > 0,
      warnings: [...new Set(warnings)]
    };
  };

  const addSchedule = (schedule: Omit<Schedule, 'id'>) => {
    const conflicts = checkScheduleConflicts(schedule);
    
    if (conflicts.hasConflicts) {
      toast.error('Cannot add schedule due to conflicts');
      return;
    }
    
    const newSchedule: Schedule = {
      ...schedule,
      id: Math.max(...schedules.map(s => s.id), 0) + 1
    };
    setSchedules([...schedules, newSchedule]);
    
    if (conflicts.hasWarnings) {
      toast.warning('Schedule added with warnings');
    } else {
      toast.success('Schedule added successfully');
    }
  };

  const updateSchedule = (id: number, updatedData: Partial<Schedule>) => {
    const conflicts = checkScheduleConflicts(updatedData, id);
    
    if (conflicts.hasConflicts) {
      toast.error('Cannot update schedule due to conflicts');
      return;
    }
    
    setSchedules(schedules.map(schedule => schedule.id === id ? { ...schedule, ...updatedData } : schedule));
    
    if (conflicts.hasWarnings) {
      toast.warning('Schedule updated with warnings');
    } else {
      toast.success('Schedule updated successfully');
    }
  };

  const deleteSchedule = (id: number) => {
    setSchedules(schedules.filter(schedule => schedule.id !== id));
    toast.success('Schedule deleted successfully');
  };

  // Feedback operations
  const updateFeedbackStatus = (id: number, status: Feedback['status']) => {
    setFeedbacks(feedbacks.map(feedback => feedback.id === id ? { ...feedback, status } : feedback));
    toast.success('Feedback status updated');
  };

  const updateFeedbackPriority = (id: number, priority: Feedback['priority']) => {
    setFeedbacks(feedbacks.map(feedback => feedback.id === id ? { ...feedback, priority } : feedback));
    toast.success('Feedback priority updated');
  };

  const deleteFeedback = (id: number) => {
    setFeedbacks(feedbacks.filter(feedback => feedback.id !== id));
    toast.success('Feedback deleted successfully');
  };

  // Helper functions
  const getUsersByRole = (role: User['role']) => {
    return users.filter(user => user.role === role);
  };

  const getSubjectsByDepartment = (department: string) => {
    return subjects.filter(subject => subject.department === department);
  };

  const getSchedulesByGroup = (groupId: number) => {
    return schedules.filter(schedule => schedule.groupId === groupId);
  };

  const getSchedulesByTeacher = (teacherId: number) => {
    return schedules.filter(schedule => schedule.teacherId === teacherId);
  };

  const getSchedulesByClassroom = (classroomId: number) => {
    return schedules.filter(schedule => schedule.classroomId === classroomId);
  };

  const getSchedulesBySemester = (semesterId: number) => {
    return schedules.filter(schedule => schedule.semesterId === semesterId);
  };

  const value: AdminContextType = {
    users,
    subjects,
    groups,
    classrooms,
    semesters,
    courseAssignments,
    schedules,
    feedbacks,
    addUser,
    updateUser,
    deleteUser,
    addSubject,
    updateSubject,
    deleteSubject,
    addGroup,
    updateGroup,
    deleteGroup,
    addClassroom,
    updateClassroom,
    deleteClassroom,
    addSemester,
    updateSemester,
    deleteSemester,
    setCurrentSemester,
    getCurrentSemester,
    addCourseAssignment,
    updateCourseAssignment,
    deleteCourseAssignment,
    getAssignmentsByTeacher,
    getAssignmentsByGroup,
    getAssignmentsBySemester,
    addSchedule,
    updateSchedule,
    deleteSchedule,
    checkScheduleConflicts,
    updateFeedbackStatus,
    updateFeedbackPriority,
    deleteFeedback,
    getUsersByRole,
    getSubjectsByDepartment,
    getSchedulesByGroup,
    getSchedulesByTeacher,
    getSchedulesByClassroom,
    getSchedulesBySemester
  };

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin() {
  const context = useContext(AdminContext);
  if (context === undefined) {
    throw new Error('useAdmin must be used within an AdminProvider');
  }
  return context;
}