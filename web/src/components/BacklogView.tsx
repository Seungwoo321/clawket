import { useEffect, useState, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import type { Task, Cycle } from '../types';
import { CLOSED_STATUSES } from '../types';
import api from '../api';
import { Button, Select } from './ui';
import StatusBadge from './StatusBadge';

interface BacklogViewProps {
  projectId: string;
  onSelectTask: (taskId: string) => void;
}

const priorityDotColor: Record<Task['priority'], string> = {
  critical: 'bg-danger',
  high: 'bg-warning',
  medium: 'bg-primary',
  low: 'bg-muted',
};

export default function BacklogView({ projectId, onSelectTask }: BacklogViewProps) {
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [cycleTasks, setCycleTasks] = useState<Record<string, Task[]>>({});
  const [backlogTasks, setBacklogTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assigningTaskId, setAssigningTaskId] = useState<string | null>(null);
  const [collapsedCycles, setCollapsedCycles] = useState<Set<string>>(new Set());
  const [collapsedBacklog, setCollapsedBacklog] = useState(false);
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cycleList, backlog] = await Promise.all([
        api.listCycles({ project_id: projectId }),
        api.listBacklog(projectId),
      ]);
      setCycles(cycleList);
      setBacklogTasks(backlog);

      // Fetch tasks for each non-completed cycle
      const tasksMap: Record<string, Task[]> = {};
      await Promise.all(
        cycleList
          .filter(b => b.status !== 'completed')
          .map(async (b) => {
            tasksMap[b.id] = await api.listCycleTasks(b.id);
          }),
      );
      setCycleTasks(tasksMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  async function handleAssignCycle(taskId: string, cycleId: string) {
    try {
      await api.updateTask(taskId, { cycle_id: cycleId });
      load();
    } catch (err) {
      console.error('Failed to assign task to cycle:', err);
    }
  }

  async function handleUnassign(taskId: string) {
    try {
      await api.updateTask(taskId, { cycle_id: null as unknown as string });
      load();
    } catch (err) {
      console.error('Failed to unassign task:', err);
    }
  }

  async function handleCycleStatusChange(cycleId: string, status: Cycle['status']) {
    try {
      await api.updateCycle(cycleId, { status });
      load();
    } catch (err) {
      console.error('Failed to update cycle status:', err);
    }
  }

  function toggleCycle(cycleId: string) {
    setCollapsedCycles(prev => {
      const next = new Set(prev);
      if (next.has(cycleId)) next.delete(cycleId);
      else next.add(cycleId);
      return next;
    });
  }

  // Find a task by id across all sections
  function findTask(taskId: string): Task | null {
    const backlog = backlogTasks.find(s => s.id === taskId);
    if (backlog) return backlog;
    for (const tasks of Object.values(cycleTasks)) {
      const found = tasks.find(s => s.id === taskId);
      if (found) return found;
    }
    return null;
  }

  function handleDragStart(event: DragStartEvent) {
    const task = findTask(event.active.id as string);
    setActiveTask(task);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;

    const taskId = active.id as string;
    const targetId = over.id as string;

    // Determine current cycle_id of the task
    const task = findTask(taskId);
    if (!task) return;

    const currentCycleId = task.cycle_id;

    if (targetId === 'backlog') {
      // Move to backlog (unassign)
      if (!currentCycleId) return; // already in backlog
      try {
        await api.updateTask(taskId, { cycle_id: null as unknown as string });
        await load();
      } catch (err) {
        console.error('Failed to move task to backlog:', err);
      }
    } else {
      // Move to a cycle
      if (currentCycleId === targetId) return; // already in this cycle
      try {
        await api.updateTask(taskId, { cycle_id: targetId });
        await load();
      } catch (err) {
        console.error('Failed to move task to cycle:', err);
      }
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-12 text-muted">Loading...</div>;
  }
  if (error) {
    return <div className="flex items-center justify-center py-12 text-danger">{error}</div>;
  }

  const activeCycles = cycles.filter(b => b.status !== 'completed');

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col gap-2 p-4 overflow-y-auto h-full">
        <h2 className="text-lg font-semibold text-foreground mb-2">Backlog</h2>

        {/* Cycle sections */}
        {activeCycles.map((cycle) => {
          const tasks = cycleTasks[cycle.id] || [];
          const collapsed = collapsedCycles.has(cycle.id);
          const doneCount = tasks.filter(s => CLOSED_STATUSES.has(s.status)).length;

          return (
            <DroppableSection key={cycle.id} id={cycle.id}>
              {(isOver) => (
                <div className={`rounded-lg border bg-surface overflow-hidden transition-colors ${isOver ? 'border-primary' : 'border-border'}`}>
                  {/* Cycle header */}
                  <div className="flex items-center gap-3 px-4 py-3 bg-surface-high">
                    <button
                      onClick={() => toggleCycle(cycle.id)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer"
                    >
                      <span className="text-muted text-xs shrink-0">
                        {collapsed ? '\u25B6' : '\u25BC'}
                      </span>
                      <span className="text-sm font-semibold text-foreground truncate">
                        {cycle.title}
                      </span>
                      <span className="text-xs text-muted shrink-0">
                        {doneCount}/{tasks.length}
                      </span>
                      <StatusBadge status={cycle.status} size="sm" />
                    </button>
                    {cycle.status === 'planning' && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); handleCycleStatusChange(cycle.id, 'active'); }}
                      >
                        Start Cycle
                      </Button>
                    )}
                    {cycle.status === 'active' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); handleCycleStatusChange(cycle.id, 'completed'); }}
                      >
                        End Cycle
                      </Button>
                    )}
                  </div>

                  {/* Cycle tasks */}
                  {!collapsed && (
                    <div className="max-h-80 overflow-y-auto">
                      {tasks.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-muted italic">
                          No tasks in this cycle. Drag from backlog below.
                        </div>
                      ) : (
                        tasks.map((task, i) => (
                          <DraggableTaskRow
                            key={task.id}
                            task={task}
                            showBorder={i > 0}
                            onSelect={() => onSelectTask(task.id)}
                            trailing={
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleUnassign(task.id); }}
                                className="text-xs text-muted hover:text-danger px-1.5 py-0.5 rounded transition-colors cursor-pointer"
                                title="Remove from cycle"
                              >
                                &times;
                              </button>
                            }
                          />
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </DroppableSection>
          );
        })}

        {/* Backlog (unassigned) — same card style as cycle sections */}
        <DroppableSection id="backlog">
          {(isOver) => (
            <div className={`rounded-lg border bg-surface overflow-hidden mt-2 transition-colors ${isOver ? 'border-primary' : 'border-border'}`}>
              <div className="flex items-center gap-3 px-4 py-3 bg-surface-high">
                <button
                  onClick={() => setCollapsedBacklog(prev => !prev)}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer"
                >
                  <span className="text-muted text-xs shrink-0">
                    {collapsedBacklog ? '\u25B6' : '\u25BC'}
                  </span>
                  <span className="text-sm font-semibold text-foreground truncate">
                    Backlog
                  </span>
                  <span className="text-xs text-muted shrink-0">
                    {backlogTasks.length} items
                  </span>
                </button>
              </div>

              {!collapsedBacklog && (
                <>
                  {backlogTasks.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-muted italic">
                      All tasks are assigned to cycles.
                    </div>
                  ) : (
                    <div className="max-h-[60vh] overflow-y-auto">
                      {backlogTasks.map((task, i) => (
                        <DraggableTaskRow
                          key={task.id}
                          task={task}
                          showBorder={i > 0}
                          onSelect={() => onSelectTask(task.id)}
                          trailing={
                            <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                              {assigningTaskId === task.id ? (
                                <Select
                                  size="sm"
                                  value=""
                                  onChange={(e) => {
                                    if (e.target.value) handleAssignCycle(task.id, e.target.value);
                                    else setAssigningTaskId(null);
                                  }}
                                  onBlur={() => setAssigningTaskId(null)}
                                  autoFocus
                                  className="w-36 text-xs"
                                >
                                  <option value="">Select cycle...</option>
                                  {activeCycles.map((b) => (
                                    <option key={b.id} value={b.id}>{b.title}</option>
                                  ))}
                                </Select>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setAssigningTaskId(task.id)}
                                  className="text-xs text-muted hover:text-primary px-2 py-1 rounded border border-transparent hover:border-border transition-colors whitespace-nowrap cursor-pointer"
                                >
                                  + Cycle
                                </button>
                              )}
                            </div>
                          }
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </DroppableSection>
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {activeTask ? (
          <div className="flex items-center gap-3 px-4 py-2 bg-surface border border-primary rounded-lg shadow-lg opacity-90">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${priorityDotColor[activeTask.priority]}`} />
            {activeTask.ticket_number && (
              <span className="font-mono text-xs text-muted shrink-0 w-16">{activeTask.ticket_number}</span>
            )}
            <span className="text-sm text-foreground truncate flex-1">{activeTask.title}</span>
            <StatusBadge status={activeTask.status} size="sm" />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/* --- Droppable section wrapper --- */
function DroppableSection({
  id,
  children,
}: {
  id: string;
  children: (isOver: boolean) => React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return <div ref={setNodeRef}>{children(isOver)}</div>;
}

/* --- Draggable task row --- */
function DraggableTaskRow({
  task,
  showBorder,
  onSelect,
  trailing,
}: {
  task: Task;
  showBorder: boolean;
  onSelect: () => void;
  trailing?: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex items-center gap-3 px-4 py-2 hover:bg-surface-hover transition-colors ${showBorder ? 'border-t border-border' : ''} ${isDragging ? 'opacity-40' : ''}`}
      {...attributes}
      {...listeners}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer"
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${priorityDotColor[task.priority]}`} />
        {task.ticket_number && (
          <span className="font-mono text-xs text-muted shrink-0 w-16">{task.ticket_number}</span>
        )}
        <span className="text-sm text-foreground truncate flex-1">{task.title}</span>
        <StatusBadge status={task.status} size="sm" />
        {task.assignee && (
          <span className="text-xs text-muted shrink-0">{task.assignee}</span>
        )}
      </button>
      {trailing}
    </div>
  );
}
