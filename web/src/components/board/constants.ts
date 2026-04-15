import type { Task } from '../../types';

export const COLUMNS: {
  key: Task['status'];
  label: string;
  headerBg: string;
  headerText: string;
  countBg: string;
  countText: string;
}[] = [
  { key: 'todo', label: 'Todo', headerBg: 'bg-muted/10', headerText: 'text-muted', countBg: 'bg-muted/20', countText: 'text-muted' },
  { key: 'in_progress', label: 'In Progress', headerBg: 'bg-warning/10', headerText: 'text-warning', countBg: 'bg-warning/20', countText: 'text-warning' },
  { key: 'blocked', label: 'Blocked', headerBg: 'bg-danger/10', headerText: 'text-danger', countBg: 'bg-danger/20', countText: 'text-danger' },
  { key: 'done', label: 'Done', headerBg: 'bg-success/10', headerText: 'text-success', countBg: 'bg-success/20', countText: 'text-success' },
];

export const PRIORITY_DOT: Record<Task['priority'], string> = {
  critical: 'bg-danger',
  high: 'bg-warning',
  medium: 'bg-primary',
  low: 'bg-muted',
};

export const PRIORITY_LABEL: Record<Task['priority'], string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export const STATUS_TRANSITIONS: Record<
  Task['status'],
  { label: string; target: Task['status'] }[]
> = {
  todo: [{ label: 'Start \u2192', target: 'in_progress' }],
  in_progress: [
    { label: '\u2190 Todo', target: 'todo' },
    { label: 'Done \u2192', target: 'done' },
  ],
  done: [{ label: '\u2190 Reopen', target: 'in_progress' }],
  blocked: [{ label: 'Unblock \u2192', target: 'todo' }],
  cancelled: [{ label: '\u2190 Reopen', target: 'todo' }],
};
