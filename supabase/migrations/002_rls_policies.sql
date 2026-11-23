-- Row-Level Security Policies for External Supabase Deployments
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE matching_pairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_results ENABLE ROW LEVEL SECURITY;

-- Helper functions
CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE uid = auth.uid()::text AND role = 'admin' AND is_active = TRUE
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION teacher_has_subject(target_subject_id INTEGER) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles p
    JOIN teachers t ON t.profile_id = p.id
    JOIN teacher_subjects ts ON ts.teacher_id = t.id
    WHERE p.uid = auth.uid()::text
      AND p.is_active = TRUE
      AND t.is_active = TRUE
      AND ts.subject_id = target_subject_id
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Questions: Admin all; Teachers only assigned subjects; Public/Students NEVER
CREATE POLICY "questions_admin_all" ON questions FOR ALL USING (is_admin());
CREATE POLICY "questions_teacher_subject" ON questions FOR ALL USING (teacher_has_subject(subject_id));

-- Exam Results: Admin all; Teachers only assigned subjects; Students NEVER
CREATE POLICY "results_admin_all" ON exam_results FOR ALL USING (is_admin());
CREATE POLICY "results_teacher_subject" ON exam_results FOR SELECT USING (teacher_has_subject(subject_id));

-- Exam Tokens: Admin only (students validate exclusively via server-side Edge Function / API)
CREATE POLICY "tokens_admin_only" ON exam_tokens FOR ALL USING (is_admin());

-- Violations: Admin all; Teachers only assigned subjects
CREATE POLICY "violations_admin_all" ON violations FOR ALL USING (is_admin());
CREATE POLICY "violations_teacher_subject" ON violations FOR SELECT USING (teacher_has_subject(subject_id));
