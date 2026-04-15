import { useState } from 'react';
import type { Task } from '../../types';

const ARCHIVED_STATUSES: Task['status'][] = ['cancelled'];

const ARCHIVED_STATUS_ICON: Record<string, { icon: string; label: string }> = {
  cancelled: { icon: '\u2715', label: 'Cancelled' },
};

export function ArchivedSection({
  tasksByStatus,
  onSelectTask,
}: {
  tasksByStatus: Record<Task['status'], Task[]>;
  onSelectTask: (taskId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const archivedTasks = ARCHIVED_STATUSES.flatMap(s => tasksByStatus[s]);

  if (archivedTasks.length === 0) return null;

  return (
    <div className="flex-shrink-0 border-t border-border pt-2">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 text-sm text-muted hover:text-foreground transition-colors cursor-pointer px-1 py-1"
      >
        <span className="text-xs">{open ? '\u25BC' : '\u25B6'}</span>
        <span>Archived</span>
        <span className="text-xs bg-muted/20 text-muted px-1.5 py-0.5 rounded-full">{archivedTasks.length}</span>
      </button>
      {open && (
        <div className="grid grid-cols-1 gap-3 mt-2">
          {ARCHIVED_STATUSES.map(status => {
            const items = tasksByStatus[status];
            if (items.length === 0) return null;
            const info = ARCHIVED_STATUS_ICON[status];
            return (
              <div key={status} className="space-y-1.5">
                <div className="flex items-center gap-1.5 px-1">
                  <span className="text-xs text-muted">{info.icon}</span>
                  <span className="text-xs font-medium text-muted">{info.label}</span>
                  <span className="text-xs text-muted">({items.length})</span>
                </div>
                {items.map(task => (
                  <button
                    key={task.id}
                    onClick={() => onSelectTask(task.id)}
                    className="w-full text-left rounded-md border border-border bg-background/50 p-2 hover:bg-surface-hover transition-colors cursor-pointer opacity-60 hover:opacity-100"
                  >
                    {task.ticket_number && (
                      <span className="font-mono text-[10px] text-muted block">{task.ticket_number}</span>
                    )}
                    <p className="text-xs text-muted line-through">{task.title}</p>
                    {task.assignee && (
                      <span className="text-[10px] text-muted mt-1 inline-block">@{task.assignee}</span>
                    )}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
