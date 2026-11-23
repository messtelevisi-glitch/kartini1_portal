import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// 1. roles
export const roles = pgTable('roles', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(), // 'admin' | 'teacher' | 'student'
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 2. profiles
export const profiles = pgTable(
  'profiles',
  {
    id: serial('id').primaryKey(),
    uid: text('uid').notNull().unique(),
    roleId: integer('role_id').references(() => roles.id),
    role: text('role').notNull().default('teacher'), // 'admin' | 'teacher'
    username: text('username').unique(),
    email: text('email').notNull().unique(),
    fullName: text('full_name').notNull(),
    passwordHash: text('password_hash'),
    isActive: boolean('is_active').default(true).notNull(),
    lastLoginAt: timestamp('last_login_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('idx_profiles_role').on(table.role)]
);

// 3. teachers
export const teachers = pgTable('teachers', {
  id: serial('id').primaryKey(),
  profileId: integer('profile_id')
    .references(() => profiles.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  nip: text('nip'),
  fullName: text('full_name').notNull(),
  email: text('email').notNull().unique(),
  username: text('username').notNull().unique(),
  phone: text('phone'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 8. academic_years
export const academicYears = pgTable('academic_years', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(), // e.g., '2026/2027'
  isActive: boolean('is_active').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 5. classes
export const classes = pgTable('classes', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(), // e.g., '7A', '8B', '9A'
  gradeLevel: integer('grade_level').notNull(), // 7 | 8 | 9
  academicYearId: integer('academic_year_id').references(() => academicYears.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 4. students
export const students = pgTable(
  'students',
  {
    id: serial('id').primaryKey(),
    studentNumber: text('student_number').notNull().unique(),
    nis: text('nis'),
    nisn: text('nisn'),
    fullName: text('full_name').notNull(),
    classId: integer('class_id').references(() => classes.id),
    className: text('class_name').notNull(),
    gender: text('gender').default('L'),
    photoUrl: text('photo_url'),
    isActive: boolean('is_active').default(true).notNull(),
    deletedAt: timestamp('deleted_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('idx_students_class_name').on(table.className)]
);

// 6. subjects
export const subjects = pgTable('subjects', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  gradeLevels: jsonb('grade_levels').$type<number[]>().default([7, 8, 9]).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 7. teacher_subjects
export const teacherSubjects = pgTable(
  'teacher_subjects',
  {
    id: serial('id').primaryKey(),
    teacherId: integer('teacher_id')
      .references(() => teachers.id, { onDelete: 'cascade' })
      .notNull(),
    subjectId: integer('subject_id')
      .references(() => subjects.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_teacher_subject').on(table.teacherId, table.subjectId),
  ]
);

// 12. questions
export const questions = pgTable(
  'questions',
  {
    id: serial('id').primaryKey(),
    subjectId: integer('subject_id')
      .references(() => subjects.id, { onDelete: 'cascade' })
      .notNull(),
    createdByTeacherId: integer('created_by_teacher_id').references(() => teachers.id),
    createdByProfileId: integer('created_by_profile_id').references(() => profiles.id),
    classLevel: text('class_level').notNull().default('8'),
    semester: text('semester').notNull().default('Ganjil'),
    academicYear: text('academic_year').notNull().default('2026/2027'),
    topic: text('topic').notNull().default('General'),
    difficulty: text('difficulty').notNull().default('medium'), // 'easy' | 'medium' | 'hard'
    questionType: text('question_type').notNull(), // 'MULTIPLE_CHOICE' | 'MULTIPLE_RESPONSE' | 'TRUE_FALSE' | 'MATCHING' | 'ESSAY'
    questionText: text('question_text').notNull(),
    explanation: text('explanation'),
    points: real('points').notNull().default(5),
    partialCredit: boolean('partial_credit').default(false).notNull(),
    isDeleted: boolean('is_deleted').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_questions_subject').on(table.subjectId),
    index('idx_questions_type').on(table.questionType),
  ]
);

// 13. question_options
export const questionOptions = pgTable(
  'question_options',
  {
    id: serial('id').primaryKey(),
    questionId: integer('question_id')
      .references(() => questions.id, { onDelete: 'cascade' })
      .notNull(),
    optionKey: text('option_key').notNull(), // 'A' | 'B' | 'C' | 'D' | 'E'
    optionText: text('option_text').notNull(),
    mediaUrl: text('media_url'),
    mediaType: text('media_type'), // 'image' | 'audio' | 'video'
    isCorrect: boolean('is_correct').default(false).notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
  },
  (table) => [index('idx_question_options_qid').on(table.questionId)]
);

// 14. matching_pairs
export const matchingPairs = pgTable(
  'matching_pairs',
  {
    id: serial('id').primaryKey(),
    questionId: integer('question_id')
      .references(() => questions.id, { onDelete: 'cascade' })
      .notNull(),
    promptKey: text('prompt_key').notNull(), // '1', '2', '3'...
    promptText: text('prompt_text').notNull(),
    matchKey: text('match_key').notNull(), // 'A', 'B', 'C'...
    matchText: text('match_text').notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
  },
  (table) => [index('idx_matching_pairs_qid').on(table.questionId)]
);

// 15. question_media
export const questionMedia = pgTable(
  'question_media',
  {
    id: serial('id').primaryKey(),
    questionId: integer('question_id')
      .references(() => questions.id, { onDelete: 'cascade' })
      .notNull(),
    targetType: text('target_type').notNull().default('question'), // 'question' | 'option'
    targetKey: text('target_key'), // null or 'A'..'E'
    mediaType: text('media_type').notNull(), // 'image' | 'audio' | 'video'
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    fileSize: integer('file_size').notNull(),
    storageUrl: text('storage_url').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_question_media_qid').on(table.questionId)]
);

// 16. exams
export const exams = pgTable(
  'exams',
  {
    id: serial('id').primaryKey(),
    title: text('title').notNull(),
    subjectId: integer('subject_id')
      .references(() => subjects.id, { onDelete: 'cascade' })
      .notNull(),
    classIds: jsonb('class_ids').$type<number[]>().default([]).notNull(),
    className: text('class_name').notNull().default('8A'),
    semester: text('semester').notNull().default('Ganjil'),
    academicYear: text('academic_year').notNull().default('2026/2027'),
    examType: text('exam_type').notNull().default('Ujian Akhir Semester'),
    durationMinutes: integer('duration_minutes').notNull().default(90),
    totalQuestions: integer('total_questions').notNull().default(0),
    totalPoints: real('total_points').notNull().default(100),
    instructions: text('instructions').default('Read each question carefully before answering.'),
    shuffleQuestions: boolean('shuffle_questions').default(false).notNull(),
    shuffleOptions: boolean('shuffle_options').default(false).notNull(),
    oneQuestionPerPage: boolean('one_question_per_page').default(true).notNull(),
    allowNavigation: boolean('allow_navigation').default(true).notNull(),
    showQuestionNumbers: boolean('show_question_numbers').default(true).notNull(),
    allowMarkReview: boolean('allow_mark_review').default(true).notNull(),
    allowPrevious: boolean('allow_previous').default(true).notNull(),
    requireFullscreen: boolean('require_fullscreen').default(true).notNull(),
    antiCheatingEnabled: boolean('anti_cheating_enabled').default(true).notNull(),
    autosaveEnabled: boolean('autosave_enabled').default(true).notNull(),
    autoSubmitEnabled: boolean('auto_submit_enabled').default(true).notNull(),
    status: text('status').notNull().default('Draft'), // Draft | Scheduled | Published | Ongoing | Completed | Cancelled
    createdByProfileId: integer('created_by_profile_id').references(() => profiles.id),
    deletedAt: timestamp('deleted_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('idx_exams_subject').on(table.subjectId)]
);

// 17. exam_questions
export const examQuestions = pgTable(
  'exam_questions',
  {
    id: serial('id').primaryKey(),
    examId: integer('exam_id')
      .references(() => exams.id, { onDelete: 'cascade' })
      .notNull(),
    questionId: integer('question_id')
      .references(() => questions.id, { onDelete: 'cascade' })
      .notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    pointsOverride: real('points_override'),
  },
  (table) => [uniqueIndex('uq_exam_question').on(table.examId, table.questionId)]
);

// 9. exam_sessions
export const examSessions = pgTable('exam_sessions', {
  id: serial('id').primaryKey(),
  examId: integer('exam_id')
    .references(() => exams.id, { onDelete: 'cascade' })
    .notNull(),
  sessionName: text('session_name').notNull(),
  proctorTeacherId: integer('proctor_teacher_id').references(() => teachers.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 10. exam_schedules
export const examSchedules = pgTable(
  'exam_schedules',
  {
    id: serial('id').primaryKey(),
    examId: integer('exam_id')
      .references(() => exams.id, { onDelete: 'cascade' })
      .notNull(),
    sessionId: integer('session_id').references(() => examSessions.id),
    subjectId: integer('subject_id')
      .references(() => subjects.id, { onDelete: 'cascade' })
      .notNull(),
    className: text('class_name').notNull(),
    examDate: text('exam_date').notNull(), // YYYY-MM-DD
    startTime: timestamp('start_time').notNull(),
    endTime: timestamp('end_time').notNull(),
    durationMinutes: integer('duration_minutes').notNull().default(90),
    proctorName: text('proctor_name'),
    releaseStatus: text('release_status').notNull().default('Draft'), // Draft | Scheduled | Published | Ongoing | Completed | Cancelled
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('idx_schedules_exam').on(table.examId)]
);

// 11. exam_tokens
export const examTokens = pgTable(
  'exam_tokens',
  {
    id: serial('id').primaryKey(),
    examId: integer('exam_id')
      .references(() => exams.id, { onDelete: 'cascade' })
      .notNull(),
    scheduleId: integer('schedule_id')
      .references(() => examSchedules.id, { onDelete: 'cascade' })
      .notNull(),
    tokenCode: text('token_code').notNull().unique(),
    isActive: boolean('is_active').default(true).notNull(),
    validFrom: timestamp('valid_from').notNull(),
    validUntil: timestamp('valid_until').notNull(),
    maxAttempts: integer('max_attempts').default(1).notNull(),
    createdByProfileId: integer('created_by_profile_id').references(() => profiles.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_tokens_schedule').on(table.scheduleId)]
);

// 18. exam_attempts
export const examAttempts = pgTable(
  'exam_attempts',
  {
    id: serial('id').primaryKey(),
    examId: integer('exam_id')
      .references(() => exams.id, { onDelete: 'cascade' })
      .notNull(),
    scheduleId: integer('schedule_id')
      .references(() => examSchedules.id, { onDelete: 'cascade' })
      .notNull(),
    studentId: integer('student_id')
      .references(() => students.id, { onDelete: 'cascade' })
      .notNull(),
    studentNumber: text('student_number').notNull(),
    studentName: text('student_name').notNull(),
    className: text('class_name').notNull(),
    tokenId: integer('token_id').references(() => examTokens.id),
    status: text('status').notNull().default('In Progress'), // Not Started | In Progress | Completed | Submitted | Disqualified
    startedAt: timestamp('started_at').defaultNow().notNull(),
    serverEndTime: timestamp('server_end_time').notNull(),
    submittedAt: timestamp('submitted_at'),
    lastSyncAt: timestamp('last_sync_at').defaultNow().notNull(),
    currentQuestionIndex: integer('current_question_index').default(0).notNull(),
    answeredCount: integer('answered_count').default(0).notNull(),
    totalQuestions: integer('total_questions').default(0).notNull(),
    violationCount: integer('violation_count').default(0).notNull(),
    disqualificationReason: text('disqualification_reason'),
    disqualifiedAt: timestamp('disqualified_at'),
    questionOrder: jsonb('question_order').$type<number[]>().default([]).notNull(),
    optionOrders: jsonb('option_orders').$type<Record<string, string[]>>().default({}).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_attempt_schedule_student').on(table.scheduleId, table.studentId),
    index('idx_attempts_exam').on(table.examId),
  ]
);

// 19. student_answers
export const studentAnswers = pgTable(
  'student_answers',
  {
    id: serial('id').primaryKey(),
    attemptId: integer('attempt_id')
      .references(() => examAttempts.id, { onDelete: 'cascade' })
      .notNull(),
    questionId: integer('question_id')
      .references(() => questions.id, { onDelete: 'cascade' })
      .notNull(),
    selectedOptions: jsonb('selected_options').$type<string[]>().default([]).notNull(),
    matchingAnswers: jsonb('matching_answers').$type<Record<string, string>>().default({}).notNull(),
    essayText: text('essay_text'),
    isMarkedForReview: boolean('is_marked_for_review').default(false).notNull(),
    isCorrect: boolean('is_correct'),
    pointsEarned: real('points_earned').default(0).notNull(),
    graderNotes: text('grader_notes'),
    gradedByProfileId: integer('graded_by_profile_id').references(() => profiles.id),
    gradedAt: timestamp('graded_at'),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('uq_answer_attempt_question').on(table.attemptId, table.questionId)]
);

// 20. violations
export const violations = pgTable(
  'violations',
  {
    id: serial('id').primaryKey(),
    attemptId: integer('attempt_id').references(() => examAttempts.id, { onDelete: 'cascade' }),
    examId: integer('exam_id').references(() => exams.id, { onDelete: 'cascade' }),
    studentId: integer('student_id').references(() => students.id, { onDelete: 'set null' }),
    studentNumber: text('student_number').notNull(),
    studentName: text('student_name').notNull(),
    className: text('class_name').notNull(),
    subjectId: integer('subject_id').references(() => subjects.id),
    violationType: text('violation_type').notNull(),
    violationNumber: integer('violation_number').default(1).notNull(),
    severity: text('severity').notNull().default('Warning 1'),
    description: text('description'),
    occurredAt: timestamp('occurred_at').defaultNow().notNull(),
    source: text('source').notNull().default('realtime'), // 'realtime' | 'import'
    status: text('status').notNull().default('Recorded'), // 'Recorded' | 'Reviewed' | 'Disqualified'
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_violations_exam').on(table.examId)]
);

// 21. exam_results
export const examResults = pgTable(
  'exam_results',
  {
    id: serial('id').primaryKey(),
    attemptId: integer('attempt_id').references(() => examAttempts.id, { onDelete: 'cascade' }).unique(),
    examId: integer('exam_id')
      .references(() => exams.id, { onDelete: 'cascade' })
      .notNull(),
    studentId: integer('student_id')
      .references(() => students.id, { onDelete: 'cascade' })
      .notNull(),
    subjectId: integer('subject_id')
      .references(() => subjects.id, { onDelete: 'cascade' })
      .notNull(),
    totalQuestions: integer('total_questions').default(0).notNull(),
    correctCount: integer('correct_count').default(0).notNull(),
    wrongCount: integer('wrong_count').default(0).notNull(),
    pendingEssayCount: integer('pending_essay_count').default(0).notNull(),
    totalScore: real('total_score').default(0).notNull(),
    maxScore: real('max_score').default(100).notNull(),
    percentage: real('percentage').default(0).notNull(),
    gradingStatus: text('grading_status').notNull().default('Graded'), // 'Graded' | 'Pending Grading'
    remarks: text('remarks'),
    durationSeconds: integer('duration_seconds').default(0).notNull(),
    submittedAt: timestamp('submitted_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('idx_results_subject').on(table.subjectId)]
);

// 22. score_imports
export const scoreImports = pgTable('score_imports', {
  id: serial('id').primaryKey(),
  importedByProfileId: integer('imported_by_profile_id').references(() => profiles.id),
  subjectId: integer('subject_id').references(() => subjects.id),
  fileName: text('file_name').notNull(),
  totalRows: integer('total_rows').default(0).notNull(),
  successRows: integer('success_rows').default(0).notNull(),
  failedRows: integer('failed_rows').default(0).notNull(),
  summary: jsonb('summary').$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 23. admission_cards
export const admissionCards = pgTable(
  'admission_cards',
  {
    id: serial('id').primaryKey(),
    studentId: integer('student_id')
      .references(() => students.id, { onDelete: 'cascade' })
      .notNull(),
    participantNumber: text('participant_number').notNull().unique(),
    academicYear: text('academic_year').notNull().default('2026/2027'),
    semester: text('semester').notNull().default('Ganjil'),
    sessionLabel: text('session_label').default('Sesi 1 — Ruang Utama'),
    qrPayload: text('qr_payload').notNull(),
    cardWidthMm: real('card_width_mm').default(95).notNull(),
    cardHeightMm: real('card_height_mm').default(60).notNull(),
    paperSize: text('paper_size').default('A4').notNull(),
    issuedAt: timestamp('issued_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_admission_student').on(table.studentId)]
);

// 24. audit_logs
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: serial('id').primaryKey(),
    actorProfileId: integer('actor_profile_id').references(() => profiles.id),
    actorName: text('actor_name').notNull(),
    actorRole: text('actor_role').notNull(),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id'),
    details: jsonb('details').$type<Record<string, unknown>>().default({}).notNull(),
    ipAddress: text('ip_address'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_audit_created').on(table.createdAt)]
);

// 25. system_settings
export const systemSettings = pgTable('system_settings', {
  id: serial('id').primaryKey(),
  settingKey: text('setting_key').notNull().unique(),
  settingValue: jsonb('setting_value').$type<unknown>().notNull(),
  updatedByProfileId: integer('updated_by_profile_id').references(() => profiles.id),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Drizzle Relations
export const profilesRelations = relations(profiles, ({ one }) => ({
  teacher: one(teachers, {
    fields: [profiles.id],
    references: [teachers.profileId],
  }),
}));

export const teachersRelations = relations(teachers, ({ one, many }) => ({
  profile: one(profiles, {
    fields: [teachers.profileId],
    references: [profiles.id],
  }),
  teacherSubjects: many(teacherSubjects),
}));

export const subjectsRelations = relations(subjects, ({ many }) => ({
  teacherSubjects: many(teacherSubjects),
  questions: many(questions),
  exams: many(exams),
}));

export const teacherSubjectsRelations = relations(teacherSubjects, ({ one }) => ({
  teacher: one(teachers, {
    fields: [teacherSubjects.teacherId],
    references: [teachers.id],
  }),
  subject: one(subjects, {
    fields: [teacherSubjects.subjectId],
    references: [subjects.id],
  }),
}));

export const questionsRelations = relations(questions, ({ one, many }) => ({
  subject: one(subjects, {
    fields: [questions.subjectId],
    references: [subjects.id],
  }),
  options: many(questionOptions),
  matchingPairs: many(matchingPairs),
  media: many(questionMedia),
}));

export const questionOptionsRelations = relations(questionOptions, ({ one }) => ({
  question: one(questions, {
    fields: [questionOptions.questionId],
    references: [questions.id],
  }),
}));

export const matchingPairsRelations = relations(matchingPairs, ({ one }) => ({
  question: one(questions, {
    fields: [matchingPairs.questionId],
    references: [questions.id],
  }),
}));

export const questionMediaRelations = relations(questionMedia, ({ one }) => ({
  question: one(questions, {
    fields: [questionMedia.questionId],
    references: [questions.id],
  }),
}));
