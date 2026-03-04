/* ═══════════════════════════════════════════════
   ENSEÑIA SMT — Domain Types (Supabase-ready)
   ═══════════════════════════════════════════════ */

// ── Enums ──
export type UserRole = 'director' | 'docente';
export type AlertLevel = 'danger' | 'warning' | 'info' | 'success';
export type AlertCategory = 'academic' | 'attendance' | 'conduct' | 'system';
export type StudentStatus = 'excellent' | 'good' | 'warning' | 'critical';
export type DayOfWeek = 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes';
export type NotificationPriority = 'high' | 'medium' | 'low';
export type FileType = 'pdf' | 'doc' | 'image' | 'link';

// ── IA Chat ──
export type ChatRole = 'user' | 'assistant' | 'system';
export type IAToolType = 'act' | 'eval' | 'sum' | 'pres' | 'oral' | 'free';
export type IAModel = 'haiku' | 'sonnet';

// ── School ──
export interface School {
  id: string;
  name: string;
  shortName: string;
  address: string;
  district: string;
}

// ── User ──
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  schoolId: string;
  avatarInitials: string;
  subjects?: SubjectAssignment[];
  createdAt: string;
}

export interface SubjectAssignment {
  subjectId: string;
  courseId: string;
  courseName: string;
}

// ── Subject & Course ──
export interface Subject {
  id: string;
  name: string;
  color: string;
}

export interface Course {
  id: string;
  name: string;
  year: number;
  division: string;
  studentCount: number;
  schoolId: string;
}

// ── Student ──
export interface Student {
  id: string;
  firstName: string;
  lastName: string;
  avatarInitials: string;
  courseId: string;
  courseName: string;
  status: StudentStatus;
  alerts: number;
  progress: number;
  attendance: number;
  average: number;
  schoolId: string;
}

// ── Schedule ──
export interface ScheduleBlock {
  id: string;
  teacherId: string;
  subjectId: string;
  subjectName: string;
  courseId: string;
  courseName: string;
  dayOfWeek: DayOfWeek;
  dayIndex: number;
  startHour: number;
  duration: number;
  room: string;
  colorClass: string;
  studentCount: number;
}

// ── Alert ──
export interface Alert {
  id: string;
  type: AlertLevel;
  category: AlertCategory;
  title: string;
  message: string;
  date: string;
  studentIds?: string[];
  teacherId?: string;
  schoolId: string;
  isRead: boolean;
  createdAt: string;
}

// ── Notification (Director → Teacher) ──
export interface Notification {
  id: string;
  fromUserId: string;
  fromName: string;
  toUserId: string | 'all';
  title: string;
  message: string;
  priority: NotificationPriority;
  isRead: boolean;
  schoolId: string;
  createdAt: string;
}

// ── Biblioteca Docente ──
export interface LibraryMaterial {
  id: string;
  title: string;
  description: string;
  fileType: FileType;
  fileName: string;
  fileSize: string;
  subjectId: string;
  subjectName: string;
  unitName?: string;
  teacherId: string;
  schoolId: string;
  tags: string[];
  uploadedAt: string;
}

// ── Planning ──
export interface PlanningUnit {
  id: string;
  title: string;
  subjectId: string;
  courseId: string;
  teacherId: string;
  order: number;
  classes: PlanningClass[];
}

export interface PlanningClass {
  id: string;
  unitId: string;
  title: string;
  order: number;
  objectives?: string[];
  content?: string;
  isComplete: boolean;
}

// ── Stats ──
export interface TeacherStats {
  totalStudents: number;
  classesToday: number;
  pendingEvaluations: number;
  avgAttendance: number;
}

export interface DirectorStats {
  totalTeachers: number;
  activeClasses: number;
  totalAlerts: number;
  avgAttendance: number;
  totalStudents: number;
}

// ── Communication (Director) ──
export interface Communication {
  id: string;
  fromUserId: string;
  fromName: string;
  toUserIds: string[] | 'all';
  toNames: string[];
  subject: string;
  body: string;
  priority: NotificationPriority;
  schoolId: string;
  sentAt: string;
  readBy: string[];
}

// ── Activity ──
export interface RecentActivity {
  id: string;
  action: string;
  subject: string;
  time: string;
  type: 'ia' | 'eval' | 'material' | 'alert' | 'communication';
  userId: string;
}

// ── IA Chat Session ──
export interface ChatSession {
  id: string;
  teacherId: string;
  classId: string | null;
  subjectId: string | null;
  courseId: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: ChatRole;
  content: string;
  toolUsed: IAToolType | null;
  modelUsed: IAModel | null;
  tokenCount: number | null;
  createdAt: string;
}

export interface IAUsage {
  id: string;
  teacherId: string;
  usageDate: string;
  messageCount: number;
  tokenCountIn: number;
  tokenCountOut: number;
}

export interface IAChatContext {
  subjectName: string;
  courseName: string;
  unitTitle?: string;
  classTitle?: string;
  classObjectives?: string[];
  classContent?: string;
  difficulty?: number;
  educationLevel?: string;
}

// ── Quick Note / Reminder ──
export interface QuickNote {
  id: string;
  text: string;
  teacherId: string;
  createdAt: string;
  isPinned: boolean;
}
