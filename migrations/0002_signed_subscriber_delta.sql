-- Preserve existing monthly metrics while allowing signed subscriber net changes.
CREATE TABLE monthly_metrics_signed (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) > 0),
  session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  month TEXT NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]' AND substr(month,6,2) BETWEEN '01' AND '12'),
  views INTEGER NOT NULL CHECK (typeof(views) = 'integer' AND views BETWEEN 0 AND 9007199254740991),
  subs_delta INTEGER NOT NULL CHECK (typeof(subs_delta) = 'integer' AND subs_delta BETWEEN -9007199254740991 AND 9007199254740991),
  retention REAL NOT NULL CHECK (retention BETWEEN 0 AND 100),
  conversions INTEGER NOT NULL CHECK (typeof(conversions) = 'integer' AND conversions BETWEEN 0 AND 9007199254740991),
  UNIQUE (session_id, id),
  UNIQUE (session_id, project_id, month),
  FOREIGN KEY (session_id, project_id) REFERENCES projects(session_id, id) ON DELETE CASCADE
);

INSERT INTO monthly_metrics_signed SELECT * FROM monthly_metrics;
DROP TABLE monthly_metrics;
ALTER TABLE monthly_metrics_signed RENAME TO monthly_metrics;
