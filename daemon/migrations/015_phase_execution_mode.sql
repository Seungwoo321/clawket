-- Phase execution mode: sequential (default) or parallel
ALTER TABLE phases ADD COLUMN execution_mode TEXT NOT NULL DEFAULT 'sequential';
-- CHECK: execution_mode IN ('sequential', 'parallel')
