import { UserRole } from '../types';

export const isPolytechnicEmail = (email: string): boolean => {
  return email.endsWith('@polytechnic.am');
};

export const getRoleFromEmail = (email: string): UserRole => {
  if (!isPolytechnicEmail(email)) {
    return 'student'; // Default fallback
  }
  
  const localPart = email.split('@')[0];
  
  const isTeacherPattern = /^[a-z]\.[a-z]+$/i.test(localPart);
  
  return isTeacherPattern ? 'lecturer' : 'student';
};

export const parseClassroomNumber = (classroomNumber: string): {
  campus: number;
  floor: number;
  room: number;
} | null => {
  if (classroomNumber.length < 4 || classroomNumber.length > 5) {
    return null;
  }
  
  let campus: number;
  let floor: number;
  let room: number;
  
  if (classroomNumber.length === 4) {
    // Format: CFRR (e.g., 3201 = Campus 3, Floor 2, Room 01)
    campus = parseInt(classroomNumber[0]);
    floor = parseInt(classroomNumber[1]);
    room = parseInt(classroomNumber.slice(2));
  } else {
    // Format: CCFRR (e.g., 12405 = Campus 12, Floor 4, Room 05)
    campus = parseInt(classroomNumber.slice(0, 2));
    floor = parseInt(classroomNumber[2]);
    room = parseInt(classroomNumber.slice(3));
  }
  
  return { campus, floor, room };
};

export const formatClassroomNumber = (classroomNumber: string): string => {
  const parsed = parseClassroomNumber(classroomNumber);
  
  if (!parsed) {
    return classroomNumber; 
  }
  
  return `Campus ${parsed.campus}, Floor ${parsed.floor}, Room ${String(parsed.room).padStart(2, '0')}`;
};

export const doTimeSlotsOverlap = (time1: string, time2: string): boolean => {
  const parseTime = (timeStr: string): { start: number; end: number } => {
    const [startStr, endStr] = timeStr.split(' - ');
    const [startHour, startMin] = startStr.split(':').map(Number);
    const [endHour, endMin] = endStr.split(':').map(Number);
    
    return {
      start: startHour * 60 + startMin,
      end: endHour * 60 + endMin
    };
  };
  
  const slot1 = parseTime(time1);
  const slot2 = parseTime(time2);
  
  // Check for overlap
  return !(slot1.end <= slot2.start || slot2.end <= slot1.start);
};

export function getUniqueValues<T>(array: T[]): T[] {
  return Array.from(new Set(array));
}

export function hasCommonElements<T>(arr1: T[], arr2: T[]): boolean {
  return arr1.some(item => arr2.includes(item));
}
