-- Every application entity is owned by a session. Composite foreign keys ensure
-- that an association can never cross sessions, even when SQL bypasses the API.
PRAGMA foreign_keys = ON;

CREATE TABLE sessions (
  session_id TEXT PRIMARY KEY NOT NULL CHECK (length(session_id) BETWEEN 1 AND 128),
  created_at TEXT NOT NULL CHECK (datetime(created_at) IS NOT NULL)
);

CREATE TABLE projects (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) > 0),
  session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  client_alias TEXT NOT NULL CHECK (length(trim(client_alias)) BETWEEN 1 AND 80),
  created_at TEXT NOT NULL CHECK (datetime(created_at) IS NOT NULL),
  UNIQUE (session_id, id)
);
CREATE INDEX idx_projects_session_created ON projects(session_id, created_at, id);

CREATE TABLE channel_designs (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) > 0),
  session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  industry TEXT NOT NULL CHECK (industry IN ('career','clinic','housing','professional','btob','recruitment')),
  goal TEXT NOT NULL CHECK (goal IN ('leads','hiring','sales')),
  target TEXT NOT NULL CHECK (length(trim(target)) BETWEEN 1 AND 200),
  target_defaulted INTEGER NOT NULL CHECK (target_defaulted IN (0,1)),
  payload_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(payload_json) AND json_type(payload_json) = 'object'),
  UNIQUE (session_id, id),
  UNIQUE (session_id, project_id),
  FOREIGN KEY (session_id, project_id) REFERENCES projects(session_id, id) ON DELETE CASCADE
);

CREATE TABLE ideas (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) > 0),
  session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  memo TEXT NOT NULL CHECK (length(trim(memo)) BETWEEN 2 AND 500),
  idea_type TEXT CHECK (idea_type IS NULL OR idea_type IN ('howto','faq','case','day','interview','ranking','consultation','employee')),
  confidence REAL CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  classified_by TEXT NOT NULL CHECK (classified_by IN ('jev','manual')),
  jev_model TEXT CHECK (jev_model IS NULL OR length(jev_model) BETWEEN 1 AND 200),
  payload_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(payload_json) AND json_type(payload_json) = 'object'),
  UNIQUE (session_id, id),
  FOREIGN KEY (session_id, project_id) REFERENCES projects(session_id, id) ON DELETE CASCADE
);
CREATE INDEX idx_ideas_session_project ON ideas(session_id, project_id);

CREATE TABLE plan_sheets (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) > 0),
  session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  idea_id TEXT NOT NULL,
  titles TEXT NOT NULL CHECK (json_valid(titles) AND json_type(titles) = 'array' AND json_array_length(titles) = 3),
  thumb_texts TEXT NOT NULL CHECK (json_valid(thumb_texts) AND json_type(thumb_texts) = 'array' AND json_array_length(thumb_texts) = 2),
  aim TEXT NOT NULL CHECK (length(trim(aim)) > 0),
  non_recommended INTEGER NOT NULL CHECK (non_recommended IN (0,1)),
  payload_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(payload_json) AND json_type(payload_json) = 'object'),
  UNIQUE (session_id, id),
  UNIQUE (session_id, idea_id),
  FOREIGN KEY (session_id, idea_id) REFERENCES ideas(session_id, id) ON DELETE CASCADE
);

CREATE TABLE script_outlines (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) > 0),
  session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL,
  target_seconds INTEGER NOT NULL CHECK (typeof(target_seconds) = 'integer' AND target_seconds BETWEEN 1 AND 1800),
  payload_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(payload_json) AND json_type(payload_json) = 'object'),
  UNIQUE (session_id, id),
  UNIQUE (session_id, plan_id),
  FOREIGN KEY (session_id, plan_id) REFERENCES plan_sheets(session_id, id) ON DELETE CASCADE
);

CREATE TABLE script_blocks (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) > 0),
  session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  outline_id TEXT NOT NULL,
  seq INTEGER NOT NULL CHECK (typeof(seq) = 'integer' AND seq >= 0),
  kind TEXT NOT NULL CHECK (kind IN ('hook','problem','main','example','summary','cta')),
  seconds INTEGER NOT NULL CHECK (typeof(seconds) = 'integer' AND seconds BETWEEN 0 AND 1800),
  talking_points TEXT NOT NULL DEFAULT '' CHECK (length(talking_points) <= 2000),
  shoot_memo TEXT NOT NULL DEFAULT '' CHECK (length(shoot_memo) <= 1000),
  payload_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(payload_json) AND json_type(payload_json) = 'object'),
  UNIQUE (session_id, id),
  UNIQUE (session_id, outline_id, seq),
  FOREIGN KEY (session_id, outline_id) REFERENCES script_outlines(session_id, id) ON DELETE CASCADE
);

CREATE TABLE schedules (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) > 0),
  session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL,
  publish_date TEXT NOT NULL CHECK (publish_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(publish_date, '+0 days') IS NOT NULL AND date(publish_date, '+0 days') = publish_date),
  shoot_date TEXT CHECK (shoot_date IS NULL OR (shoot_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(shoot_date, '+0 days') IS NOT NULL AND date(shoot_date, '+0 days') = shoot_date)),
  compressed INTEGER NOT NULL CHECK (compressed IN (0,1)),
  payload_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(payload_json) AND json_type(payload_json) = 'object'),
  UNIQUE (session_id, id),
  UNIQUE (session_id, plan_id),
  FOREIGN KEY (session_id, plan_id) REFERENCES plan_sheets(session_id, id) ON DELETE CASCADE
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) > 0),
  session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  schedule_id TEXT NOT NULL,
  step TEXT NOT NULL CHECK (step IN ('plan','script','shoot','draft','revision','publish')),
  due TEXT NOT NULL CHECK (due GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(due, '+0 days') IS NOT NULL AND date(due, '+0 days') = due),
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','done')),
  payload_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(payload_json) AND json_type(payload_json) = 'object'),
  UNIQUE (session_id, id),
  UNIQUE (session_id, schedule_id, step),
  FOREIGN KEY (session_id, schedule_id) REFERENCES schedules(session_id, id) ON DELETE CASCADE
);
CREATE INDEX idx_tasks_session_due ON tasks(session_id, status, due);

CREATE TABLE edit_briefs (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) > 0),
  session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL,
  directions TEXT NOT NULL CHECK (json_valid(directions) AND json_type(directions) = 'array'),
  payload_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(payload_json) AND json_type(payload_json) = 'object'),
  UNIQUE (session_id, id),
  UNIQUE (session_id, plan_id),
  FOREIGN KEY (session_id, plan_id) REFERENCES plan_sheets(session_id, id) ON DELETE CASCADE
);

CREATE TABLE monthly_metrics (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) > 0),
  session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  month TEXT NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]' AND substr(month,6,2) BETWEEN '01' AND '12'),
  views INTEGER NOT NULL CHECK (typeof(views) = 'integer' AND views BETWEEN 0 AND 9007199254740991),
  subs_delta INTEGER NOT NULL CHECK (typeof(subs_delta) = 'integer' AND subs_delta BETWEEN 0 AND 9007199254740991),
  retention REAL NOT NULL CHECK (retention BETWEEN 0 AND 100),
  conversions INTEGER NOT NULL CHECK (typeof(conversions) = 'integer' AND conversions BETWEEN 0 AND 9007199254740991),
  UNIQUE (session_id, id),
  UNIQUE (session_id, project_id, month),
  FOREIGN KEY (session_id, project_id) REFERENCES projects(session_id, id) ON DELETE CASCADE
);
