-- Add enabled flag to projects (default: 1 = active)
ALTER TABLE projects ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;

INSERT OR IGNORE INTO schema_version (version, applied_at) VALUES (12, strftime('%s','now') * 1000);
