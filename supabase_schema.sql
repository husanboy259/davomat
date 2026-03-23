-- ================================================================
--  ATTENDANCE BOT — Supabase SQL Setup
--  Paste this in: Supabase Dashboard → SQL Editor → Run
-- ================================================================


-- TABLE 1: allowed_groups
CREATE TABLE IF NOT EXISTS allowed_groups (
  id         BIGSERIAL    PRIMARY KEY,
  group_id   TEXT         NOT NULL UNIQUE,
  group_name TEXT,
  added_by   TEXT         NOT NULL,
  added_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);


-- TABLE 2: attendance
CREATE TABLE IF NOT EXISTS attendance (
  id           BIGSERIAL    PRIMARY KEY,
  student_name TEXT         NOT NULL,
  class_name   TEXT         NOT NULL,
  group_id     TEXT         NOT NULL,
  group_name   TEXT,
  date         DATE         NOT NULL,
  status       TEXT         NOT NULL DEFAULT 'present' CHECK (status IN ('absent', 'present')),
  note         TEXT         DEFAULT '',
  marked_by    TEXT         NOT NULL,
  marked_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (student_name, class_name, group_id, date)
);


-- INDEXES
CREATE INDEX IF NOT EXISTS idx_att_date    ON attendance (date);
CREATE INDEX IF NOT EXISTS idx_att_group   ON attendance (group_id);
CREATE INDEX IF NOT EXISTS idx_att_class   ON attendance (class_name);
CREATE INDEX IF NOT EXISTS idx_att_student ON attendance (student_name);
CREATE INDEX IF NOT EXISTS idx_att_status  ON attendance (status);
CREATE INDEX IF NOT EXISTS idx_ag_group_id ON allowed_groups (group_id);


-- ROW LEVEL SECURITY
ALTER TABLE allowed_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "full_access_allowed_groups"
  ON allowed_groups FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "full_access_attendance"
  ON attendance FOR ALL USING (true) WITH CHECK (true);
