-- Add agent_id column to steps for SubagentStart/Stop hook lifecycle tracking.
-- Stores the Claude Code agent_id from SubagentStart payload.
ALTER TABLE steps ADD COLUMN agent_id TEXT;

INSERT INTO schema_version (version, applied_at) VALUES (16, strftime('%s','now') * 1000);
