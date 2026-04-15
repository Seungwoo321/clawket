import { useState, useEffect, useCallback } from 'react';
import type { Plan, Unit, Task, Cycle } from '../types';
import { CLOSED_STATUSES } from '../types';
import api from '../api';
import { useInlineEdit } from '../hooks/useInlineEdit';
import StatusBadge from './StatusBadge';
import { Button, Select } from './ui';

type SelectedItem = { type: 'plan'; id: string } | { type: 'unit'; id: string } | { type: 'task'; id: string };

interface PlanTreeProps {
  projectId: string;
  selectedItem: SelectedItem | null;
  onSelectItem: (item: SelectedItem) => void;
  onCreatePlan: () => void;
  onCreateUnit: (planId: string) => void;
  onCreateTask: (unitId: string) => void;
}

interface UnitWithTasks extends Unit {
  tasks: Task[];
}

interface PlanWithUnits extends Plan {
  units: UnitWithTasks[];
}

const taskStatusIcon: Record<Task['status'], { icon: string; color: string }> = {
  todo: { icon: '\u25CB', color: 'text-muted' },
  in_progress: { icon: '\u25D0', color: 'text-warning' },
  done: { icon: '\u25CF', color: 'text-success' },
  blocked: { icon: '\u2298', color: 'text-danger' },
  cancelled: { icon: '\u2715', color: 'text-muted' },
};

const priorityDotColor: Record<Task['priority'], string> = {
  critical: 'bg-danger',
  high: 'bg-warning',
  medium: 'bg-primary',
  low: 'bg-muted',
};

const TASK_STATUSES: { value: Task['status']; label: string }[] = [
  { value: 'todo', label: 'Todo' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function PlanTree({ projectId, selectedItem, onSelectItem, onCreatePlan, onCreateUnit, onCreateTask }: PlanTreeProps) {
  const [plans, setPlans] = useState<PlanWithUnits[]>([]);
  const [expandedPlans, setExpandedPlans] = useState<Set<string>>(new Set());
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [refreshCounter, setRefreshCounter] = useState(0);

  // Edit mode state (bulk)
  const [editMode, setEditMode] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [bulkUpdating, setBulkUpdating] = useState(false);

  // Inline edit (custom hook)
  const inlineEdit = useInlineEdit(async (taskId, field, value) => {
    await api.updateTask(taskId, { [field]: value });
    setRefreshCounter(c => c + 1);
  });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const planList = await api.listPlans({ project_id: projectId });
        const enriched: PlanWithUnits[] = await Promise.all(
          planList.map(async (plan) => {
            const units = await api.listUnits({ plan_id: plan.id });
            const unitsWithTasks: UnitWithTasks[] = await Promise.all(
              units.map(async (unit) => {
                const tasks = await api.listTasks({ unit_id: unit.id });
                return { ...unit, tasks: tasks.sort((a, b) => a.idx - b.idx) };
              }),
            );
            return { ...plan, units: unitsWithTasks.sort((a, b) => a.idx - b.idx) };
          }),
        );
        if (!cancelled) {
          setPlans(enriched);
          // Auto-expand all plans on first load
          if (refreshCounter === 0) {
            setExpandedPlans(new Set(enriched.map((p) => p.id)));
            setExpandedUnits(new Set(enriched.flatMap((p) => p.units.map((u) => u.id))));
          }
        }
      } catch (err) {
        console.error('Failed to load plans:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [projectId, refreshCounter]);

  // Fetch cycles when entering edit mode
  useEffect(() => {
    if (editMode) {
      api.listCycles({ project_id: projectId }).then(setCycles).catch(() => setCycles([]));
    }
  }, [editMode, projectId]);

  function togglePlan(id: string) {
    setExpandedPlans((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleUnit(id: string) {
    setExpandedUnits((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Edit mode helpers
  function enterEditMode() {
    setEditMode(true);
    setSelectedTaskIds(new Set());
  }

  function exitEditMode() {
    setEditMode(false);
    setSelectedTaskIds(new Set());
  }

  function toggleTaskSelection(taskId: string) {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  const allTaskIds = plans.flatMap((p) => p.units.flatMap((u) => u.tasks.map((s) => s.id)));

  function selectAll() {
    setSelectedTaskIds(new Set(allTaskIds));
  }

  function deselectAll() {
    setSelectedTaskIds(new Set());
  }

  // Collect all units for the unit-move dropdown
  const allUnits = plans.flatMap((p) =>
    p.units.map((u) => ({ id: u.id, title: u.title, planTitle: p.title })),
  );

  const performBulkAction = useCallback(
    async (fields: Partial<Pick<Task, 'status' | 'cycle_id' | 'unit_id'>>) => {
      if (selectedTaskIds.size === 0) return;
      setBulkUpdating(true);
      try {
        await api.bulkUpdateTasks(Array.from(selectedTaskIds), fields);
        exitEditMode();
        setRefreshCounter((c) => c + 1);
      } catch (err) {
        console.error('Bulk update failed:', err);
      } finally {
        setBulkUpdating(false);
      }
    },
    [selectedTaskIds],
  );

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted">
        <div className="text-sm">Loading plans...</div>
      </div>
    );
  }

  if (plans.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted">
        <div className="text-center">
          <div className="text-lg mb-1">No plans yet</div>
          <div className="text-sm mb-3">Create a plan to get started</div>
          <button
            onClick={onCreatePlan}
            className="text-sm text-primary hover:text-primary/80 font-medium"
          >
            + New Plan
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-shrink-0 px-4 py-3 border-b border-border flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Plans</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">{plans.length} plans</span>
          {editMode ? (
            <Button variant="outline" size="sm" onClick={exitEditMode}>
              Done
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={enterEditMode}>
              Edit
            </Button>
          )}
          {!editMode && (
            <button
              onClick={onCreatePlan}
              className="text-xs text-primary hover:text-primary/80 font-medium"
              title="New plan"
            >
              + New Plan
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
      {plans.map((plan) => (
        <div key={plan.id} className="mb-1">
          {/* Plan row */}
          <div
            className={`flex items-center gap-2 px-4 py-2 cursor-pointer hover:bg-surface-hover transition-colors ${
              selectedItem?.type === 'plan' && selectedItem.id === plan.id ? 'bg-primary/10' : ''
            }`}
          >
            <button
              onClick={() => togglePlan(plan.id)}
              className="text-muted hover:text-foreground shrink-0 w-4 text-xs"
            >
              {expandedPlans.has(plan.id) ? '\u25BC' : '\u25B6'}
            </button>
            <div
              className="flex-1 min-w-0 flex items-center gap-2"
              onClick={() => onSelectItem({ type: 'plan', id: plan.id })}
            >
              <span className="text-sm font-medium text-foreground truncate">{plan.title}</span>
              <StatusBadge status={plan.status} />
              {plan.status === 'draft' && (
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    await api.approvePlan(plan.id);
                    setRefreshCounter(c => c + 1);
                  }}
                  className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer shrink-0"
                  title="Approve plan (draft → active)"
                >
                  Approve
                </button>
              )}
            </div>
            {!editMode && (
              <button
                onClick={(e) => { e.stopPropagation(); onCreateUnit(plan.id); }}
                className="text-muted hover:text-primary text-xs shrink-0 opacity-0 group-hover:opacity-100 hover:opacity-100"
                style={{ opacity: undefined }}
                title="Add unit"
              >
                +
              </button>
            )}
          </div>

          {/* Units */}
          {expandedPlans.has(plan.id) &&
            plan.units.map((unit) => {
              const doneCount = unit.tasks.filter((s) => CLOSED_STATUSES.has(s.status)).length;
              const totalCount = unit.tasks.length;
              const progress = totalCount > 0 ? (doneCount / totalCount) * 100 : 0;

              return (
                <div key={unit.id}>
                  {/* Unit row */}
                  <div
                    className={`flex items-center gap-2 px-4 py-1.5 pl-10 cursor-pointer hover:bg-surface-hover transition-colors ${
                      selectedItem?.type === 'unit' && selectedItem.id === unit.id ? 'bg-primary/10' : ''
                    }`}
                  >
                    <button
                      onClick={() => toggleUnit(unit.id)}
                      className="text-muted hover:text-foreground shrink-0 w-4 text-xs"
                    >
                      {expandedUnits.has(unit.id) ? '\u25BC' : '\u25B6'}
                    </button>
                    <div
                      className="flex-1 min-w-0 flex items-center gap-2"
                      onClick={() => onSelectItem({ type: 'unit', id: unit.id })}
                    >
                      <span className="text-sm text-foreground truncate">{unit.title}</span>
                      {/* Unit has no status — show task progress instead */}
                      {unit.approved_at && (
                        <span className="text-xs text-success" title="Approved">{'\u2713'}</span>
                      )}
                    </div>
                    {/* Progress bar */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className="w-16 h-1.5 bg-border rounded-full overflow-hidden">
                        <div
                          className="h-full bg-success rounded-full transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted w-8">
                        {doneCount}/{totalCount}
                      </span>
                    </div>
                    {!editMode && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onCreateTask(unit.id); }}
                        className="text-muted hover:text-primary text-xs shrink-0"
                        title="Add task"
                      >
                        +
                      </button>
                    )}
                  </div>

                  {/* Tasks */}
                  {expandedUnits.has(unit.id) &&
                    unit.tasks.map((task) => {
                      const si = taskStatusIcon[task.status];
                      const isSelected = selectedTaskIds.has(task.id);
                      const isInlineTitle = inlineEdit.editId === task.id && inlineEdit.editField === 'title';
                      const isInlineStatus = inlineEdit.editId === task.id && inlineEdit.editField === 'status';
                      return (
                        <div
                          key={task.id}
                          onClick={() => {
                            if (editMode) {
                              toggleTaskSelection(task.id);
                            } else if (!inlineEdit.editId) {
                              onSelectItem({ type: 'task', id: task.id });
                            }
                          }}
                          className={`flex items-center gap-2 px-4 py-1.5 pl-16 cursor-pointer hover:bg-surface-hover transition-colors ${
                            !editMode && selectedItem?.type === 'task' && selectedItem.id === task.id ? 'bg-primary/10' : ''
                          } ${editMode && isSelected ? 'bg-primary/10' : ''}`}
                        >
                          {editMode && (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleTaskSelection(task.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="shrink-0 w-4 h-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                            />
                          )}
                          {/* Status icon — double-click to change status */}
                          {isInlineStatus ? (
                            <select
                              className="text-xs bg-background border border-primary rounded px-1 py-0.5 text-foreground focus:outline-none cursor-pointer shrink-0"
                              value={inlineEdit.editValue}
                              autoFocus
                              onClick={e => e.stopPropagation()}
                              onChange={async e => {
                                inlineEdit.setEditValue(e.target.value);
                                await api.updateTask(task.id, { status: e.target.value as Task['status'] });
                                inlineEdit.cancel();
                                setRefreshCounter(c => c + 1);
                              }}
                              onBlur={inlineEdit.cancel}
                              onKeyDown={e => { if (e.key === 'Escape') inlineEdit.cancel(); }}
                            >
                              {TASK_STATUSES.map(s => (
                                <option key={s.value} value={s.value}>{s.label}</option>
                              ))}
                            </select>
                          ) : (
                            <span
                              className={`${si.color} text-sm shrink-0 cursor-pointer`}
                              title={`${task.status} — double-click to change`}
                              onDoubleClick={e => {
                                e.stopPropagation();
                                inlineEdit.start(task.id, 'status', task.status);
                              }}
                            >{si.icon}</span>
                          )}
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${priorityDotColor[task.priority]}`} title={`Priority: ${task.priority}`} />
                          <span className="text-xs text-muted font-mono shrink-0" title={task.id}>
                            {task.ticket_number ?? `...${task.id.slice(-6)}`}
                          </span>
                          {/* Title — double-click to edit */}
                          {isInlineTitle ? (
                            <input
                              className="text-sm text-foreground truncate flex-1 bg-background border border-primary rounded px-1 py-0.5 focus:outline-none"
                              value={inlineEdit.editValue}
                              autoFocus
                              onClick={e => e.stopPropagation()}
                              onChange={e => inlineEdit.setEditValue(e.target.value)}
                              onKeyDown={async e => {
                                if (e.key === 'Enter') {
                                  await inlineEdit.save();
                                } else if (e.key === 'Escape') {
                                  inlineEdit.cancel();
                                }
                              }}
                              onBlur={() => {
                                if (inlineEdit.editValue.trim() && inlineEdit.editValue.trim() !== task.title) {
                                  inlineEdit.save();
                                } else {
                                  inlineEdit.cancel();
                                }
                              }}
                            />
                          ) : (
                            <span
                              className="text-sm text-foreground truncate flex-1"
                              title="Double-click to edit"
                              onDoubleClick={e => {
                                e.stopPropagation();
                                inlineEdit.start(task.id, 'title', task.title);
                              }}
                            >{task.title}</span>
                          )}
                          {task.assignee && (
                            <span className="text-xs text-muted shrink-0 bg-border/50 px-1.5 py-0.5 rounded">
                              {task.assignee}
                            </span>
                          )}
                        </div>
                      );
                    })}
                </div>
              );
            })}
        </div>
      ))}
      </div>

      {/* Floating Action Bar */}
      {editMode && selectedTaskIds.size > 0 && (
        <div className="sticky bottom-0 bg-surface border-t border-border px-4 py-3 flex items-center gap-3 flex-shrink-0">
          <span className="text-sm font-medium text-foreground whitespace-nowrap">
            {selectedTaskIds.size} selected
          </span>

          {/* Status dropdown */}
          <Select
            size="sm"
            value=""
            disabled={bulkUpdating}
            onChange={(e) => {
              const status = e.target.value as Task['status'];
              if (status) performBulkAction({ status });
            }}
          >
            <option value="" disabled>Status...</option>
            {TASK_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </Select>

          {/* Cycle dropdown */}
          <Select
            size="sm"
            value=""
            disabled={bulkUpdating}
            onChange={(e) => {
              const cycle_id = e.target.value;
              if (cycle_id) performBulkAction({ cycle_id: cycle_id === '__none__' ? null as unknown as string : cycle_id });
            }}
          >
            <option value="" disabled>Cycle...</option>
            <option value="__none__">No cycle</option>
            {cycles.map((b) => (
              <option key={b.id} value={b.id}>{b.title}</option>
            ))}
          </Select>

          {/* Unit dropdown */}
          <Select
            size="sm"
            value=""
            disabled={bulkUpdating}
            onChange={(e) => {
              const unit_id = e.target.value;
              if (unit_id) performBulkAction({ unit_id });
            }}
          >
            <option value="" disabled>Move to unit...</option>
            {allUnits.map((u) => (
              <option key={u.id} value={u.id}>{u.planTitle} / {u.title}</option>
            ))}
          </Select>

          <div className="flex-1" />

          {/* Select All / Deselect All */}
          {selectedTaskIds.size < allTaskIds.length ? (
            <Button variant="ghost" size="sm" onClick={selectAll} disabled={bulkUpdating}>
              Select All
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={deselectAll} disabled={bulkUpdating}>
              Deselect All
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
