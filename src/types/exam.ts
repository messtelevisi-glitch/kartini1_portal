export type UserRole = 'admin' | 'teacher' | 'student';

export type QuestionType =
  | 'MULTIPLE_CHOICE'
  | 'MULTIPLE_RESPONSE'
  | 'TRUE_FALSE'
  | 'MATCHING'
  | 'ESSAY';

export type DifficultyLevel = 'easy' | 'medium' | 'hard';

export type ExamStatus =
  | 'Draft'
  | 'Scheduled'
  | 'Published'
  | 'Ongoing'
  | 'Completed'
  | 'Cancelled';

export type AttemptStatus =
  | 'Not Started'
  | 'In Progress'
  | 'Completed'
  | 'Submitted'
  | 'Disqualified';

export interface AuthUser {
  id: number;
  uid: string;
  role: 'admin' | 'teacher';
  username: string | null;
  email: string;
  fullName: string;
  teacherId: number | null;
  subjectIds: number[];
  subjectNames: string[];
}

export interface SubjectItem {
  id: number;
  code: string;
  name: string;
  description: string | null;
  gradeLevels: number[];
  isActive: boolean;
}

export interface TeacherItem {
  id: number;
  profileId: number;
  nip: string | null;
  fullName: string;
  email: string;
  username: string;
  phone: string | null;
  isActive: boolean;
  subjectIds: number[];
  subjects: { id: number; code: string; name: string }[];
  lastLoginAt: string | null;
  createdAt: string;
}

export interface StudentItem {
  id: number;
  studentNumber: string;
  nis: string | null;
  nisn: string | null;
  fullName: string;
  classId: number | null;
  className: string;
  gender: string | null;
  photoUrl: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface QuestionOptionItem {
  id?: number;
  optionKey: string;
  optionText: string;
  mediaUrl?: string | null;
  mediaType?: 'image' | 'audio' | 'video' | null;
  isCorrect: boolean;
  sortOrder: number;
}

export interface MatchingPairItem {
  id?: number;
  promptKey: string;
  promptText: string;
  matchKey: string;
  matchText: string;
  sortOrder: number;
}

export interface QuestionMediaItem {
  id?: number;
  targetType: 'question' | 'option';
  targetKey?: string | null;
  mediaType: 'image' | 'audio' | 'video';
  fileName: string;
  mimeType: string;
  fileSize: number;
  storageUrl: string;
}

export interface QuestionItem {
  id: number;
  subjectId: number;
  subjectName?: string;
  subjectCode?: string;
  createdByTeacherId?: number | null;
  classLevel: string;
  semester: string;
  academicYear: string;
  topic: string;
  difficulty: DifficultyLevel;
  questionType: QuestionType;
  questionText: string;
  explanation?: string | null;
  points: number;
  partialCredit: boolean;
  options: QuestionOptionItem[];
  matchingPairs: MatchingPairItem[];
  media: QuestionMediaItem[];
  createdAt: string;
  updatedAt: string;
}

export interface ExamItem {
  id: number;
  title: string;
  subjectId: number;
  subjectName?: string;
  subjectCode?: string;
  classIds: number[];
  className: string;
  semester: string;
  academicYear: string;
  examType: string;
  durationMinutes: number;
  totalQuestions: number;
  totalPoints: number;
  instructions: string;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  oneQuestionPerPage: boolean;
  allowNavigation: boolean;
  showQuestionNumbers: boolean;
  allowMarkReview: boolean;
  allowPrevious: boolean;
  requireFullscreen: boolean;
  antiCheatingEnabled: boolean;
  autosaveEnabled: boolean;
  autoSubmitEnabled: boolean;
  status: ExamStatus;
  questionIds?: number[];
  createdAt: string;
}

export interface ExamScheduleItem {
  id: number;
  examId: number;
  examTitle?: string;
  subjectId: number;
  subjectName?: string;
  subjectCode?: string;
  className: string;
  examDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  proctorName: string | null;
  releaseStatus: ExamStatus;
  activeToken?: {
    id: number;
    tokenCode: string;
    isActive: boolean;
    validFrom: string;
    validUntil: string;
  } | null;
}

export interface SystemSettingsConfig {
  schoolName: string;
  foundationName: string;
  portalTitle: string;
  schoolAddress: string;
  principalName: string;
  academicYear: string;
  semester: string;
  defaultDurationMinutes: number;
  maxUploadMb: number;
  maxViolationsBeforeDisqualification: number;
  tokenExpiryMinutes: number;
  cardWidthMm: number;
  cardHeightMm: number;
  cardPaperSize: 'A4' | 'F4' | 'Letter';
  maintenanceMode: boolean;
  enableRealtimeNotifications: boolean;
}

// Sanitized student exam types (NEVER includes answer keys or explanations)
export interface StudentSanitizedQuestion {
  id: number;
  questionType: QuestionType;
  questionText: string;
  points: number;
  options: {
    optionKey: string;
    optionText: string;
    mediaUrl?: string | null;
    mediaType?: 'image' | 'audio' | 'video' | null;
  }[];
  matchingPrompts: { promptKey: string; promptText: string }[];
  matchingChoices: { matchKey: string; matchText: string }[];
  media: QuestionMediaItem[];
}

export interface StudentAnswerPayload {
  questionId: number;
  selectedOptions: string[];
  matchingAnswers: Record<string, string>;
  essayText: string;
  isMarkedForReview: boolean;
}
