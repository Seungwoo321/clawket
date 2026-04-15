-- Clawket Migration: Entity Rename
-- phases → units, steps → tasks, bolts → cycles
-- ID prefixes: PHASE- → UNIT-, STEP- → TASK-, BOLT- → CYC-
-- Ticket prefix: LAT- → CK-
--
-- SQLite 3.25+ required (ALTER TABLE RENAME COLUMN)
-- Runs in a single transaction for atomicity.

-- ============================================================
-- SECTION 1: phases → units
-- ============================================================

-- 1a. Rename table
ALTER TABLE phases RENAME TO units;

-- 1b. Rename column: plan_id stays (no change), but rename phase-specific columns
-- phases.id → units.id (PK, data updated below)
-- No column rename needed for 'phases' table itself — columns are generic.

-- 1c. Rename FK columns in dependent tables
ALTER TABLE artifacts RENAME COLUMN phase_id TO unit_id;
ALTER TABLE questions RENAME COLUMN phase_id TO unit_id;

-- 1d. Rename FK column in tasks (formerly steps) — done after steps rename
-- steps.phase_id → tasks.unit_id (deferred to section 2)

-- 1e. Update ID prefixes: PHASE- → UNIT-
UPDATE units SET id = REPLACE(id, 'PHASE-', 'UNIT-');
UPDATE artifacts SET unit_id = REPLACE(unit_id, 'PHASE-', 'UNIT-') WHERE unit_id IS NOT NULL;
UPDATE questions SET unit_id = REPLACE(unit_id, 'PHASE-', 'UNIT-') WHERE unit_id IS NOT NULL;
-- steps.phase_id update deferred to section 2

-- 1f. Update activity_log references
UPDATE activity_log SET entity_type = 'unit' WHERE entity_type = 'phase';
UPDATE activity_log SET entity_id = REPLACE(entity_id, 'PHASE-', 'UNIT-') WHERE entity_id LIKE 'PHASE-%';

-- 1g. Rebuild indexes (old indexes auto-renamed with table, but names are stale)
DROP INDEX IF EXISTS idx_phases_plan;
CREATE INDEX IF NOT EXISTS idx_units_plan ON units(plan_id);


-- ============================================================
-- SECTION 2: steps → tasks
-- ============================================================

-- 2a. Rename table
ALTER TABLE steps RENAME TO tasks;

-- 2b. Rename FK column: phase_id → unit_id (deferred from section 1)
ALTER TABLE tasks RENAME COLUMN phase_id TO unit_id;

-- 2c. Update tasks.unit_id prefixes (was steps.phase_id)
UPDATE tasks SET unit_id = REPLACE(unit_id, 'PHASE-', 'UNIT-');

-- 2d. Rename FK columns in dependent tables
ALTER TABLE step_depends_on RENAME COLUMN step_id TO task_id;
ALTER TABLE step_depends_on RENAME COLUMN depends_on_id TO depends_on_task_id;
ALTER TABLE step_comments RENAME COLUMN step_id TO task_id;
ALTER TABLE step_labels RENAME COLUMN step_id TO task_id;
ALTER TABLE step_relations RENAME COLUMN source_step_id TO source_task_id;
ALTER TABLE step_relations RENAME COLUMN target_step_id TO target_task_id;
ALTER TABLE artifacts RENAME COLUMN step_id TO task_id;
ALTER TABLE questions RENAME COLUMN step_id TO task_id;
ALTER TABLE runs RENAME COLUMN step_id TO task_id;

-- 2e. Rename dependent tables
ALTER TABLE step_depends_on RENAME TO task_depends_on;
ALTER TABLE step_comments RENAME TO task_comments;
ALTER TABLE step_labels RENAME TO task_labels;
ALTER TABLE step_relations RENAME TO task_relations;

-- 2f. Update ID prefixes: STEP- → TASK-
UPDATE tasks SET id = REPLACE(id, 'STEP-', 'TASK-');
UPDATE tasks SET parent_step_id = REPLACE(parent_step_id, 'STEP-', 'TASK-') WHERE parent_step_id IS NOT NULL;
UPDATE task_depends_on SET task_id = REPLACE(task_id, 'STEP-', 'TASK-');
UPDATE task_depends_on SET depends_on_task_id = REPLACE(depends_on_task_id, 'STEP-', 'TASK-');
UPDATE task_comments SET task_id = REPLACE(task_id, 'STEP-', 'TASK-');
UPDATE task_labels SET task_id = REPLACE(task_id, 'STEP-', 'TASK-');
UPDATE task_relations SET source_task_id = REPLACE(source_task_id, 'STEP-', 'TASK-');
UPDATE task_relations SET target_task_id = REPLACE(target_task_id, 'STEP-', 'TASK-');
UPDATE artifacts SET task_id = REPLACE(task_id, 'STEP-', 'TASK-') WHERE task_id IS NOT NULL;
UPDATE questions SET task_id = REPLACE(task_id, 'STEP-', 'TASK-') WHERE task_id IS NOT NULL;
UPDATE runs SET task_id = REPLACE(task_id, 'STEP-', 'TASK-');

-- 2g. Rename parent_step_id column
ALTER TABLE tasks RENAME COLUMN parent_step_id TO parent_task_id;

-- 2h. Update activity_log references
UPDATE activity_log SET entity_type = 'task' WHERE entity_type = 'step';
UPDATE activity_log SET entity_id = REPLACE(entity_id, 'STEP-', 'TASK-') WHERE entity_id LIKE 'STEP-%';

-- 2i. Rebuild indexes
DROP INDEX IF EXISTS idx_steps_phase;
DROP INDEX IF EXISTS idx_steps_status;
DROP INDEX IF EXISTS idx_steps_bolt;
DROP INDEX IF EXISTS idx_steps_ticket_number;
CREATE INDEX IF NOT EXISTS idx_tasks_unit ON tasks(unit_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_cycle ON tasks(bolt_id);  -- bolt_id renamed in section 3
CREATE INDEX IF NOT EXISTS idx_tasks_ticket_number ON tasks(ticket_number) WHERE ticket_number IS NOT NULL;

DROP INDEX IF EXISTS idx_step_comments_step;
CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);

DROP INDEX IF EXISTS idx_step_labels_label;
CREATE INDEX IF NOT EXISTS idx_task_labels_label ON task_labels(label);

DROP INDEX IF EXISTS idx_step_relations_source;
DROP INDEX IF EXISTS idx_step_relations_target;
DROP INDEX IF EXISTS idx_step_relations_type;
CREATE INDEX IF NOT EXISTS idx_task_relations_source ON task_relations(source_task_id);
CREATE INDEX IF NOT EXISTS idx_task_relations_target ON task_relations(target_task_id);
CREATE INDEX IF NOT EXISTS idx_task_relations_type ON task_relations(relation_type);

-- 2j. Rebuild FTS tables (content table changed from 'steps' to 'tasks')
DROP TABLE IF EXISTS steps_fts;
CREATE VIRTUAL TABLE IF NOT EXISTS tasks_fts USING fts5(
  title, body,
  content='tasks',
  content_rowid='rowid',
  tokenize='unicode61'
);

-- Rebuild FTS triggers
DROP TRIGGER IF EXISTS steps_ai;
DROP TRIGGER IF EXISTS steps_ad;
DROP TRIGGER IF EXISTS steps_au;

CREATE TRIGGER IF NOT EXISTS tasks_ai AFTER INSERT ON tasks BEGIN
  INSERT INTO tasks_fts(rowid, title, body) VALUES (new.rowid, new.title, new.body);
END;
CREATE TRIGGER IF NOT EXISTS tasks_ad AFTER DELETE ON tasks BEGIN
  INSERT INTO tasks_fts(tasks_fts, rowid, title, body) VALUES('delete', old.rowid, old.title, old.body);
END;
CREATE TRIGGER IF NOT EXISTS tasks_au AFTER UPDATE ON tasks BEGIN
  INSERT INTO tasks_fts(tasks_fts, rowid, title, body) VALUES('delete', old.rowid, old.title, old.body);
  INSERT INTO tasks_fts(rowid, title, body) VALUES (new.rowid, new.title, new.body);
END;

-- Rebuild FTS content from existing data
INSERT INTO tasks_fts(rowid, title, body) SELECT rowid, title, body FROM tasks;


-- ============================================================
-- SECTION 3: bolts → cycles
-- ============================================================

-- 3a. Rename table
ALTER TABLE bolts RENAME TO cycles;

-- 3b. Rename FK column in tasks
ALTER TABLE tasks RENAME COLUMN bolt_id TO cycle_id;

-- 3c. Update ID prefixes: BOLT- → CYC-
UPDATE cycles SET id = REPLACE(id, 'BOLT-', 'CYC-');
UPDATE tasks SET cycle_id = REPLACE(cycle_id, 'BOLT-', 'CYC-') WHERE cycle_id IS NOT NULL;

-- 3d. Update activity_log references
UPDATE activity_log SET entity_type = 'cycle' WHERE entity_type = 'bolt';
UPDATE activity_log SET entity_id = REPLACE(entity_id, 'BOLT-', 'CYC-') WHERE entity_id LIKE 'BOLT-%';

-- 3e. Rebuild indexes
DROP INDEX IF EXISTS idx_bolts_project;
DROP INDEX IF EXISTS idx_bolts_status;
DROP INDEX IF EXISTS idx_tasks_cycle;  -- recreate with correct column name
CREATE INDEX IF NOT EXISTS idx_cycles_project ON cycles(project_id);
CREATE INDEX IF NOT EXISTS idx_cycles_status ON cycles(status);
CREATE INDEX IF NOT EXISTS idx_tasks_cycle ON tasks(cycle_id);


-- ============================================================
-- SECTION 4: ID prefix migration for FK references
-- (Catch any remaining cross-references)
-- ============================================================

-- activity_log: update any old_value/new_value that contain old prefixes
UPDATE activity_log SET old_value = REPLACE(old_value, 'PHASE-', 'UNIT-') WHERE old_value LIKE '%PHASE-%';
UPDATE activity_log SET new_value = REPLACE(new_value, 'PHASE-', 'UNIT-') WHERE new_value LIKE '%PHASE-%';
UPDATE activity_log SET old_value = REPLACE(old_value, 'STEP-', 'TASK-') WHERE old_value LIKE '%STEP-%';
UPDATE activity_log SET new_value = REPLACE(new_value, 'STEP-', 'TASK-') WHERE new_value LIKE '%STEP-%';
UPDATE activity_log SET old_value = REPLACE(old_value, 'BOLT-', 'CYC-') WHERE old_value LIKE '%BOLT-%';
UPDATE activity_log SET new_value = REPLACE(new_value, 'BOLT-', 'CYC-') WHERE new_value LIKE '%BOLT-%';


-- ============================================================
-- SECTION 5: Ticket number prefix LAT- → CK-
-- ============================================================

UPDATE tasks SET ticket_number = REPLACE(ticket_number, 'LAT-', 'CK-') WHERE ticket_number LIKE 'LAT-%';

-- Update project key
UPDATE projects SET key = 'CK' WHERE key = 'LAT';


-- ============================================================
-- SECTION 6: Vector tables rename (vec_steps → vec_tasks)
-- Virtual tables don't support ALTER TABLE RENAME, so drop and let db.js recreate.
-- ============================================================
DROP TABLE IF EXISTS vec_steps;
-- vec_artifacts stays as-is (artifact_id unchanged)
-- vec_tasks will be created by ensureVectorTables() in db.js on next startup


-- ============================================================
-- Schema version
-- ============================================================
INSERT OR IGNORE INTO schema_version (version, applied_at) VALUES (17, strftime('%s','now') * 1000);
