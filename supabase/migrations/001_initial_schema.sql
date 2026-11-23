-- KARTINI EXAM PORTAL — SMP KARTINI 1 BATAM
-- Complete PostgreSQL Relational Migration (25 Tables)

CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS profiles (
  id SERIAL PRIMARY KEY,
  uid TEXT NOT NULL UNIQUE,
  role_id INTEGER REFERENCES roles(id),
  role TEXT NOT NULL DEFAULT 'teacher',
  username TEXT UNIQUE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  password_hash TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS teachers (
  id SERIAL PRIMARY KEY,
  profile_id INTEGER NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  nip TEXT,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL UNIQUE,
  phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS academic_years (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS classes (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  grade_level INTEGER NOT NULL,
  academic_year_id INTEGER REFERENCES academic_years(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS students (
  id SERIAL PRIMARY KEY,
  student_number TEXT NOT NULL UNIQUE,
  nis TEXT,
  nisn TEXT,
  full_name TEXT NOT NULL,
  class_id INTEGER REFERENCES classes(id),
  class_name TEXT NOT NULL,
  gender TEXT DEFAULT 'L',
  photo_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subjects (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  grade_levels JSONB NOT NULL DEFAULT '[7,8,9]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS teacher_subjects (
  id SERIAL PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(teacher_id, subject_id)
);

CREATE TABLE IF NOT EXISTS questions (
  id SERIAL PRIMARY KEY,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  created_by_teacher_id INTEGER REFERENCES teachers(id),
  created_by_profile_id INTEGER REFERENCES profiles(id),
  class_level TEXT NOT NULL DEFAULT '8',
  semester TEXT NOT NULL DEFAULT 'Ganjil',
  academic_year TEXT NOT NULL DEFAULT '2026/2027',
  topic TEXT NOT NULL DEFAULT 'General',
  difficulty TEXT NOT NULL DEFAULT 'medium',
  question_type TEXT NOT NULL,
  question_text TEXT NOT NULL,
  explanation TEXT,
  points REAL NOT NULL DEFAULT 5,
  partial_credit BOOLEAN NOT NULL DEFAULT FALSE,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS question_options (
  id SERIAL PRIMARY KEY,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  option_key TEXT NOT NULL,
  option_text TEXT NOT NULL,
  media_url TEXT,
  media_type TEXT,
  is_correct BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS matching_pairs (
  id SERIAL PRIMARY KEY,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  prompt_key TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  match_key TEXT NOT NULL,
  match_text TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS question_media (
  id SERIAL PRIMARY KEY,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL DEFAULT 'question',
  target_key TEXT,
  media_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  storage_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exams (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  class_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  class_name TEXT NOT NULL DEFAULT '8A',
  semester TEXT NOT NULL DEFAULT 'Ganjil',
  academic_year TEXT NOT NULL DEFAULT '2026/2027',
  exam_type TEXT NOT NULL DEFAULT 'Ujian Akhir Semester',
  duration_minutes INTEGER NOT NULL DEFAULT 90,
  total_questions INTEGER NOT NULL DEFAULT 0,
  total_points REAL NOT NULL DEFAULT 100,
  instructions TEXT,
  shuffle_questions BOOLEAN NOT NULL DEFAULT FALSE,
  shuffle_options BOOLEAN NOT NULL DEFAULT FALSE,
  one_question_per_page BOOLEAN NOT NULL DEFAULT TRUE,
  allow_navigation BOOLEAN NOT NULL DEFAULT TRUE,
  show_question_numbers BOOLEAN NOT NULL DEFAULT TRUE,
  allow_mark_review BOOLEAN NOT NULL DEFAULT TRUE,
  allow_previous BOOLEAN NOT NULL DEFAULT TRUE,
  require_fullscreen BOOLEAN NOT NULL DEFAULT TRUE,
  anti_cheating_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  autosave_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  auto_submit_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'Draft',
  created_by_profile_id INTEGER REFERENCES profiles(id),
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exam_questions (
  id SERIAL PRIMARY KEY,
  exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  points_override REAL,
  UNIQUE(exam_id, question_id)
);

CREATE TABLE IF NOT EXISTS exam_sessions (
  id SERIAL PRIMARY KEY,
  exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  session_name TEXT NOT NULL,
  proctor_teacher_id INTEGER REFERENCES teachers(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exam_schedules (
  id SERIAL PRIMARY KEY,
  exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  session_id INTEGER REFERENCES exam_sessions(id),
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  class_name TEXT NOT NULL,
  exam_date TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 90,
  proctor_name TEXT,
  release_status TEXT NOT NULL DEFAULT 'Draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exam_tokens (
  id SERIAL PRIMARY KEY,
  exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  schedule_id INTEGER NOT NULL REFERENCES exam_schedules(id) ON DELETE CASCADE,
  token_code TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  valid_from TIMESTAMPTZ NOT NULL,
  valid_until TIMESTAMPTZ NOT NULL,
  max_attempts INTEGER NOT NULL DEFAULT 1,
  created_by_profile_id INTEGER REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exam_attempts (
  id SERIAL PRIMARY KEY,
  exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  schedule_id INTEGER NOT NULL REFERENCES exam_schedules(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  student_number TEXT NOT NULL,
  student_name TEXT NOT NULL,
  class_name TEXT NOT NULL,
  token_id INTEGER REFERENCES exam_tokens(id),
  status TEXT NOT NULL DEFAULT 'In Progress',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  server_end_time TIMESTAMPTZ NOT NULL,
  submitted_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_question_index INTEGER NOT NULL DEFAULT 0,
  answered_count INTEGER NOT NULL DEFAULT 0,
  total_questions INTEGER NOT NULL DEFAULT 0,
  violation_count INTEGER NOT NULL DEFAULT 0,
  disqualification_reason TEXT,
  disqualified_at TIMESTAMPTZ,
  question_order JSONB NOT NULL DEFAULT '[]'::jsonb,
  option_orders JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(schedule_id, student_id)
);

CREATE TABLE IF NOT EXISTS student_answers (
  id SERIAL PRIMARY KEY,
  attempt_id INTEGER NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  selected_options JSONB NOT NULL DEFAULT '[]'::jsonb,
  matching_answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  essay_text TEXT,
  is_marked_for_review BOOLEAN NOT NULL DEFAULT FALSE,
  is_correct BOOLEAN,
  points_earned REAL NOT NULL DEFAULT 0,
  grader_notes TEXT,
  graded_by_profile_id INTEGER REFERENCES profiles(id),
  graded_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(attempt_id, question_id)
);

CREATE TABLE IF NOT EXISTS violations (
  id SERIAL PRIMARY KEY,
  attempt_id INTEGER REFERENCES exam_attempts(id) ON DELETE CASCADE,
  exam_id INTEGER REFERENCES exams(id) ON DELETE CASCADE,
  student_id INTEGER REFERENCES students(id) ON DELETE SET NULL,
  student_number TEXT NOT NULL,
  student_name TEXT NOT NULL,
  class_name TEXT NOT NULL,
  subject_id INTEGER REFERENCES subjects(id),
  violation_type TEXT NOT NULL,
  violation_number INTEGER NOT NULL DEFAULT 1,
  severity TEXT NOT NULL DEFAULT 'Warning 1',
  description TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL DEFAULT 'realtime',
  status TEXT NOT NULL DEFAULT 'Recorded',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exam_results (
  id SERIAL PRIMARY KEY,
  attempt_id INTEGER UNIQUE REFERENCES exam_attempts(id) ON DELETE CASCADE,
  exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  total_questions INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  wrong_count INTEGER NOT NULL DEFAULT 0,
  pending_essay_count INTEGER NOT NULL DEFAULT 0,
  total_score REAL NOT NULL DEFAULT 0,
  max_score REAL NOT NULL DEFAULT 100,
  percentage REAL NOT NULL DEFAULT 0,
  grading_status TEXT NOT NULL DEFAULT 'Graded',
  remarks TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS score_imports (
  id SERIAL PRIMARY KEY,
  imported_by_profile_id INTEGER REFERENCES profiles(id),
  subject_id INTEGER REFERENCES subjects(id),
  file_name TEXT NOT NULL,
  total_rows INTEGER NOT NULL DEFAULT 0,
  success_rows INTEGER NOT NULL DEFAULT 0,
  failed_rows INTEGER NOT NULL DEFAULT 0,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admission_cards (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  participant_number TEXT NOT NULL UNIQUE,
  academic_year TEXT NOT NULL DEFAULT '2026/2027',
  semester TEXT NOT NULL DEFAULT 'Ganjil',
  session_label TEXT DEFAULT 'Sesi 1 — Ruang Utama',
  qr_payload TEXT NOT NULL,
  card_width_mm REAL NOT NULL DEFAULT 95,
  card_height_mm REAL NOT NULL DEFAULT 60,
  paper_size TEXT NOT NULL DEFAULT 'A4',
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  actor_profile_id INTEGER REFERENCES profiles(id),
  actor_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS system_settings (
  id SERIAL PRIMARY KEY,
  setting_key TEXT NOT NULL UNIQUE,
  setting_value JSONB NOT NULL,
  updated_by_profile_id INTEGER REFERENCES profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
