-- Add enabled flag to projects (default: 1 = active)
ALTER TABLE projects ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;

INSERT OR IGNORE INTO schema_version (version) VALUES (12);
