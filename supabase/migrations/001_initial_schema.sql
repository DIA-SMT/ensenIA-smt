-- ═══════════════════════════════════════════════
-- ENSEÑIA SMT — Initial Database Schema
-- ═══════════════════════════════════════════════

-- ── Enums ──
CREATE TYPE user_role AS ENUM ('director', 'docente');
CREATE TYPE alert_level AS ENUM ('danger', 'warning', 'info', 'success');
CREATE TYPE alert_category AS ENUM ('academic', 'attendance', 'conduct', 'system');
CREATE TYPE student_status AS ENUM ('excellent', 'good', 'warning', 'critical');
CREATE TYPE day_of_week AS ENUM ('lunes', 'martes', 'miercoles', 'jueves', 'viernes');
CREATE TYPE notification_priority AS ENUM ('high', 'medium', 'low');
CREATE TYPE file_type AS ENUM ('pdf', 'doc', 'image', 'link');

-- ── Helper Functions (for RLS) ──
CREATE OR REPLACE FUNCTION auth_school_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT school_id FROM profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION auth_role()
RETURNS user_role
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
$$;

-- ══════════════════════════════════════
-- TABLES
-- ══════════════════════════════════════

-- ── Schools ──
CREATE TABLE schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  address TEXT,
  district TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Profiles (linked to auth.users) ──
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'docente',
  school_id UUID NOT NULL REFERENCES schools(id),
  avatar_initials TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_profiles_school_id ON profiles(school_id);
CREATE INDEX idx_profiles_role ON profiles(role);

-- ── Subjects ──
CREATE TABLE subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'blue',
  school_id UUID NOT NULL REFERENCES schools(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_subjects_school_id ON subjects(school_id);

-- ── Courses ──
CREATE TABLE courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  year INT NOT NULL,
  division TEXT NOT NULL,
  student_count INT NOT NULL DEFAULT 0,
  school_id UUID NOT NULL REFERENCES schools(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_courses_school_id ON courses(school_id);

-- ── Teacher Assignments (teacher → subject + course) ──
CREATE TABLE teacher_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(teacher_id, subject_id, course_id)
);

CREATE INDEX idx_teacher_assignments_teacher ON teacher_assignments(teacher_id);
CREATE INDEX idx_teacher_assignments_course ON teacher_assignments(course_id);

-- ── Students ──
CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  avatar_initials TEXT NOT NULL DEFAULT '',
  course_id UUID NOT NULL REFERENCES courses(id),
  status student_status NOT NULL DEFAULT 'good',
  alerts_count INT NOT NULL DEFAULT 0,
  progress NUMERIC(5,2) NOT NULL DEFAULT 0,
  attendance NUMERIC(5,2) NOT NULL DEFAULT 0,
  average NUMERIC(4,2) NOT NULL DEFAULT 0,
  school_id UUID NOT NULL REFERENCES schools(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_students_course_id ON students(course_id);
CREATE INDEX idx_students_school_id ON students(school_id);
CREATE INDEX idx_students_status ON students(status);

-- ── Schedule Blocks ──
CREATE TABLE schedule_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id),
  course_id UUID NOT NULL REFERENCES courses(id),
  subject_name TEXT NOT NULL,
  course_name TEXT NOT NULL,
  day_of_week day_of_week NOT NULL,
  day_index INT NOT NULL CHECK (day_index BETWEEN 0 AND 4),
  start_hour NUMERIC(4,2) NOT NULL,
  duration NUMERIC(4,2) NOT NULL DEFAULT 1.5,
  room TEXT,
  color_class TEXT NOT NULL DEFAULT 'blue',
  student_count INT NOT NULL DEFAULT 0,
  school_id UUID NOT NULL REFERENCES schools(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_schedule_teacher ON schedule_blocks(teacher_id);
CREATE INDEX idx_schedule_teacher_day ON schedule_blocks(teacher_id, day_index);

-- ── Alerts ──
CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type alert_level NOT NULL,
  category alert_category NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  date_label TEXT,
  teacher_id UUID REFERENCES profiles(id),
  school_id UUID NOT NULL REFERENCES schools(id),
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_alerts_teacher ON alerts(teacher_id);
CREATE INDEX idx_alerts_school ON alerts(school_id);
CREATE INDEX idx_alerts_unread ON alerts(is_read) WHERE NOT is_read;

-- ── Alert ↔ Students (many-to-many) ──
CREATE TABLE alert_students (
  alert_id UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  PRIMARY KEY (alert_id, student_id)
);

-- ── Notifications ──
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES profiles(id),
  to_user_id UUID,  -- NULL = broadcast to all in school
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  priority notification_priority NOT NULL DEFAULT 'medium',
  school_id UUID NOT NULL REFERENCES schools(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_notif_to_user ON notifications(to_user_id);
CREATE INDEX idx_notif_school ON notifications(school_id);
CREATE INDEX idx_notif_created ON notifications(created_at DESC);

-- ── Notification Reads (per-user read tracking) ──
CREATE TABLE notification_reads (
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (notification_id, user_id)
);

-- ── Library Materials ──
CREATE TABLE library_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  file_type file_type NOT NULL DEFAULT 'pdf',
  file_name TEXT,
  file_size TEXT,
  subject_id UUID NOT NULL REFERENCES subjects(id),
  subject_name TEXT NOT NULL,
  unit_name TEXT,
  teacher_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES schools(id),
  tags TEXT[] DEFAULT '{}',
  uploaded_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_library_teacher ON library_materials(teacher_id);
CREATE INDEX idx_library_subject ON library_materials(subject_id);
CREATE INDEX idx_library_school ON library_materials(school_id);
CREATE INDEX idx_library_tags ON library_materials USING GIN(tags);

-- ── Planning Units ──
CREATE TABLE planning_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  subject_id UUID NOT NULL REFERENCES subjects(id),
  course_id UUID NOT NULL REFERENCES courses(id),
  teacher_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_planning_units_teacher ON planning_units(teacher_id);
CREATE INDEX idx_planning_units_subject_course ON planning_units(subject_id, course_id);

-- ── Planning Classes ──
CREATE TABLE planning_classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES planning_units(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 1,
  objectives TEXT[] DEFAULT '{}',
  content TEXT,
  is_complete BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_planning_classes_unit ON planning_classes(unit_id);

-- ── Communications ──
CREATE TABLE communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES profiles(id),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  priority notification_priority NOT NULL DEFAULT 'medium',
  school_id UUID NOT NULL REFERENCES schools(id),
  is_broadcast BOOLEAN NOT NULL DEFAULT false,
  sent_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_comms_school ON communications(school_id);
CREATE INDEX idx_comms_sent ON communications(sent_at DESC);

-- ── Communication Recipients ──
CREATE TABLE communication_recipients (
  communication_id UUID NOT NULL REFERENCES communications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (communication_id, user_id)
);

-- ── Communication Reads ──
CREATE TABLE communication_reads (
  communication_id UUID NOT NULL REFERENCES communications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (communication_id, user_id)
);

-- ── Quick Notes ──
CREATE TABLE quick_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text TEXT NOT NULL,
  teacher_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_quick_notes_teacher ON quick_notes(teacher_id);

-- ══════════════════════════════════════
-- TRIGGER: auto-create profile on auth signup
-- ══════════════════════════════════════

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, first_name, last_name, role, school_id, avatar_initials)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'docente'),
    (NEW.raw_user_meta_data->>'school_id')::UUID,
    COALESCE(NEW.raw_user_meta_data->>'avatar_initials', '')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ══════════════════════════════════════
-- ROW LEVEL SECURITY
-- ══════════════════════════════════════

-- ── Schools ──
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own school"
  ON schools FOR SELECT
  USING (id = auth_school_id());

-- ── Profiles ──
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view profiles in their school"
  ON profiles FOR SELECT
  USING (school_id = auth_school_id());

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ── Subjects ──
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view subjects in their school"
  ON subjects FOR SELECT
  USING (school_id = auth_school_id());

-- ── Courses ──
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view courses in their school"
  ON courses FOR SELECT
  USING (school_id = auth_school_id());

-- ── Teacher Assignments ──
ALTER TABLE teacher_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Directors see all assignments in school"
  ON teacher_assignments FOR SELECT
  USING (
    auth_role() = 'director'
    AND teacher_id IN (SELECT id FROM profiles WHERE school_id = auth_school_id())
  );

CREATE POLICY "Teachers see their own assignments"
  ON teacher_assignments FOR SELECT
  USING (teacher_id = auth.uid());

-- ── Students ──
ALTER TABLE students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Directors see all students in school"
  ON students FOR SELECT
  USING (school_id = auth_school_id() AND auth_role() = 'director');

CREATE POLICY "Teachers see students in assigned courses"
  ON students FOR SELECT
  USING (
    auth_role() = 'docente'
    AND course_id IN (
      SELECT course_id FROM teacher_assignments WHERE teacher_id = auth.uid()
    )
  );

-- ── Schedule Blocks ──
ALTER TABLE schedule_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Directors see all schedules in school"
  ON schedule_blocks FOR SELECT
  USING (school_id = auth_school_id() AND auth_role() = 'director');

CREATE POLICY "Teachers see their own schedule"
  ON schedule_blocks FOR SELECT
  USING (teacher_id = auth.uid());

-- ── Alerts ──
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Directors see all alerts in school"
  ON alerts FOR SELECT
  USING (school_id = auth_school_id() AND auth_role() = 'director');

CREATE POLICY "Teachers see their own alerts"
  ON alerts FOR SELECT
  USING (teacher_id = auth.uid());

CREATE POLICY "Directors can update alerts"
  ON alerts FOR UPDATE
  USING (school_id = auth_school_id() AND auth_role() = 'director');

CREATE POLICY "Teachers can update their own alerts"
  ON alerts FOR UPDATE
  USING (teacher_id = auth.uid());

-- ── Alert Students ──
ALTER TABLE alert_students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Can view alert_students via alerts RLS"
  ON alert_students FOR SELECT
  USING (alert_id IN (SELECT id FROM alerts));

-- ── Notifications ──
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see notifications addressed to them or broadcast"
  ON notifications FOR SELECT
  USING (
    school_id = auth_school_id()
    AND (to_user_id = auth.uid() OR to_user_id IS NULL)
  );

CREATE POLICY "Directors see all sent notifications"
  ON notifications FOR SELECT
  USING (from_user_id = auth.uid() AND auth_role() = 'director');

CREATE POLICY "Directors can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (from_user_id = auth.uid() AND auth_role() = 'director');

-- ── Notification Reads ──
ALTER TABLE notification_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own read status"
  ON notification_reads FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can mark notifications as read"
  ON notification_reads FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- ── Library Materials ──
ALTER TABLE library_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers see their own materials"
  ON library_materials FOR SELECT
  USING (teacher_id = auth.uid());

CREATE POLICY "Directors see all materials in school"
  ON library_materials FOR SELECT
  USING (school_id = auth_school_id() AND auth_role() = 'director');

CREATE POLICY "Teachers can insert their own materials"
  ON library_materials FOR INSERT
  WITH CHECK (teacher_id = auth.uid());

CREATE POLICY "Teachers can update their own materials"
  ON library_materials FOR UPDATE
  USING (teacher_id = auth.uid());

CREATE POLICY "Teachers can delete their own materials"
  ON library_materials FOR DELETE
  USING (teacher_id = auth.uid());

-- ── Planning Units ──
ALTER TABLE planning_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers see their own planning"
  ON planning_units FOR SELECT
  USING (teacher_id = auth.uid());

CREATE POLICY "Teachers can insert their own planning"
  ON planning_units FOR INSERT
  WITH CHECK (teacher_id = auth.uid());

CREATE POLICY "Teachers can update their own planning"
  ON planning_units FOR UPDATE
  USING (teacher_id = auth.uid());

CREATE POLICY "Teachers can delete their own planning"
  ON planning_units FOR DELETE
  USING (teacher_id = auth.uid());

CREATE POLICY "Directors see all planning in school"
  ON planning_units FOR SELECT
  USING (
    auth_role() = 'director'
    AND teacher_id IN (SELECT id FROM profiles WHERE school_id = auth_school_id())
  );

-- ── Planning Classes ──
ALTER TABLE planning_classes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Access planning_classes via planning_units RLS"
  ON planning_classes FOR SELECT
  USING (unit_id IN (SELECT id FROM planning_units));

CREATE POLICY "Insert planning_classes via planning_units RLS"
  ON planning_classes FOR INSERT
  WITH CHECK (unit_id IN (SELECT id FROM planning_units));

CREATE POLICY "Update planning_classes via planning_units RLS"
  ON planning_classes FOR UPDATE
  USING (unit_id IN (SELECT id FROM planning_units));

CREATE POLICY "Delete planning_classes via planning_units RLS"
  ON planning_classes FOR DELETE
  USING (unit_id IN (SELECT id FROM planning_units));

-- ── Communications ──
ALTER TABLE communications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users in school can see communications"
  ON communications FOR SELECT
  USING (
    school_id = auth_school_id()
    AND (
      is_broadcast = true
      OR from_user_id = auth.uid()
      OR id IN (SELECT communication_id FROM communication_recipients WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Directors can create communications"
  ON communications FOR INSERT
  WITH CHECK (from_user_id = auth.uid() AND auth_role() = 'director');

-- ── Communication Recipients ──
ALTER TABLE communication_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see recipient entries"
  ON communication_recipients FOR SELECT
  USING (user_id = auth.uid() OR auth_role() = 'director');

CREATE POLICY "Directors can insert recipients"
  ON communication_recipients FOR INSERT
  WITH CHECK (auth_role() = 'director');

-- ── Communication Reads ──
ALTER TABLE communication_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see their own reads"
  ON communication_reads FOR SELECT
  USING (user_id = auth.uid() OR auth_role() = 'director');

CREATE POLICY "Users can mark communications as read"
  ON communication_reads FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- ── Quick Notes ──
ALTER TABLE quick_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers CRUD their own notes"
  ON quick_notes FOR ALL
  USING (teacher_id = auth.uid());
