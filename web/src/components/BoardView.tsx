import { useState, useEffect, useCallback } from 'react';
import type { Cycle, Task } from '../types';
import api from '../api';
import { Badge, Button, Select } from './ui';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';

import { COLUMNS } from './board/constants';
import { DroppableColumn } from './board/DroppableColumn';
import { TaskCard, DraggableTaskCard } from './board/TaskCard';
import { NewCycleModal } from './board/NewCycleModal';
import { ArchivedSection } from './board/ArchivedSection';

interface BoardViewProps {
  projectId: string;
  onSelectTask: (taskId: string) => void;
}

const CYCLE_STATUS_ORDER: Cycle['status'][] = ['planning', 'active'];

const CYCLE_STATUS_BADGE_VARIANT: Record<Cycle['status'], 'default' | 'primary' | 'success'> = {
  planning: 'default',
  active: 'primary',
  completed: 'success',
};

const CYCLE_STATUS_LABEL: Record<Cycle['status'], string> = {
  planning: 'Planning',
  active: 'Active',
  completed: 'Completed',
};

export default function BoardView({ projectId, onSelectTask }: BoardViewProps) {
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewCycleModal, setShowNewCycleModal] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const selectedCycle = cycles.find((b) => b.id === selectedCycleId) ?? null;

  const loadTasksForCycle = useCallback(async (cycleId: string) => {
    try {
      const cycleTasks = await api.listCycleTasks(cycleId);
      setTasks(cycleTasks);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks');
    }
  }, []);

  const loadCycles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const allCycles = await api.listCycles({ project_id: projectId });
      setCycles(allCycles);

      if (allCycles.length > 0) {
        const activeCycle = allCycles.find((b) => b.status === 'active');
        const nonCompleted = allCycles.filter((b) => b.status !== 'completed');
        const toSelect = activeCycle ?? nonCompleted[0] ?? allCycles[0];
        setSelectedCycleId(toSelect.id);
        const cycleTasks = await api.listCycleTasks(toSelect.id);
        setTasks(cycleTasks);
      } else {
        setSelectedCycleId(null);
        setTasks([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load board data');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { loadCycles(); }, [loadCycles]);

  const handleCycleSelect = useCallback(
    async (cycleId: string) => { setSelectedCycleId(cycleId); await loadTasksForCycle(cycleId); },
    [loadTasksForCycle],
  );

  const handleCycleCreated = useCallback((newCycle: Cycle) => {
    setCycles((prev) => [...prev, newCycle]);
    setSelectedCycleId(newCycle.id);
    setTasks([]);
    setShowNewCycleModal(false);
  }, []);

  const handleCycleStatusChange = useCallback(
    async (newStatus: Cycle['status']) => {
      if (!selectedCycle || statusUpdating) return;
      setStatusUpdating(true);
      try {
        const updated = await api.updateCycle(selectedCycle.id, { status: newStatus });
        setCycles((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update cycle status');
      } finally {
        setStatusUpdating(false);
      }
    },
    [selectedCycle, statusUpdating],
  );

  const reloadCurrentCycleTasks = useCallback(() => {
    if (selectedCycleId) loadTasksForCycle(selectedCycleId);
  }, [selectedCycleId, loadTasksForCycle]);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => { setActiveTask(tasks.find((s) => s.id === event.active.id) ?? null); },
    [tasks],
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveTask(null);
      const { active, over } = event;
      if (!over) return;
      const taskId = active.id as string;
      const newStatus = over.id as Task['status'];
      const task = tasks.find((s) => s.id === taskId);
      if (!task || task.status === newStatus) return;
      try {
        await api.updateTask(taskId, { status: newStatus });
        reloadCurrentCycleTasks();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update task status');
      }
    },
    [tasks, reloadCurrentCycleTasks],
  );

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="text-muted text-sm">Loading board...</div></div>;
  }
  if (error) {
    return <div className="flex items-center justify-center h-64"><div className="text-danger text-sm">{error}</div></div>;
  }
  if (cycles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="text-muted text-sm">No cycles yet. Create one to start a sprint.</div>
        <Button variant="primary" onClick={() => setShowNewCycleModal(true)}>New Cycle</Button>
        {showNewCycleModal && <NewCycleModal projectId={projectId} onCreated={handleCycleCreated} onClose={() => setShowNewCycleModal(false)} />}
      </div>
    );
  }

  const tasksByStatus: Record<Task['status'], Task[]> = {
    todo: [], in_progress: [], done: [], blocked: [], cancelled: [],
  };
  for (const task of tasks) {
    if (tasksByStatus[task.status]) tasksByStatus[task.status].push(task);
  }

  return (
    <div className="flex flex-col h-full gap-4 p-4">
      {/* Cycle toolbar */}
      <div className="flex-shrink-0 flex items-center gap-3 flex-wrap">
        <Select size="sm" className="w-auto min-w-[200px] max-w-[320px]" value={selectedCycleId ?? ''} onChange={(e) => handleCycleSelect(e.target.value)}>
          {cycles.filter(b => b.status !== 'completed').map((b) => <option key={b.id} value={b.id}>{b.title} [{CYCLE_STATUS_LABEL[b.status]}]</option>)}
          {cycles.some(b => b.status === 'completed') && <option disabled>── Completed ──</option>}
          {cycles.filter(b => b.status === 'completed').map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
        </Select>
        <Button variant="outline" size="sm" onClick={() => setShowNewCycleModal(true)}>+ New Cycle</Button>
        <div className="flex-1" />
        {selectedCycle && (
          <div className="flex items-center gap-2">
            <Badge variant={CYCLE_STATUS_BADGE_VARIANT[selectedCycle.status]} size="sm">{CYCLE_STATUS_LABEL[selectedCycle.status]}</Badge>
            <Select size="sm" className="w-auto min-w-[120px]" value={selectedCycle.status} onChange={(e) => handleCycleStatusChange(e.target.value as Cycle['status'])} disabled={statusUpdating}>
              {CYCLE_STATUS_ORDER.map((s) => <option key={s} value={s}>{CYCLE_STATUS_LABEL[s]}</option>)}
            </Select>
          </div>
        )}
      </div>

      {/* Cycle header */}
      {selectedCycle && (
        <div className="flex-shrink-0">
          <h2 className="text-lg font-semibold text-foreground">{selectedCycle.title}</h2>
          {selectedCycle.goal && <p className="text-sm text-muted mt-1">{selectedCycle.goal}</p>}
        </div>
      )}

      {/* Kanban columns */}
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex-1 grid grid-cols-4 gap-4 min-h-0">
          {COLUMNS.map((col) => {
            const colTasks = tasksByStatus[col.key];
            return (
              <DroppableColumn key={col.key} col={col} count={colTasks.length}>
                {colTasks.length === 0 && <div className="text-center text-muted/50 text-xs py-6">No tasks</div>}
                {colTasks.map((task) => (
                  <DraggableTaskCard
                    key={task.id}
                    task={task}
                    onClick={() => onSelectTask(task.id)}
                    onStatusChange={async (newStatus) => { await api.updateTask(task.id, { status: newStatus }); reloadCurrentCycleTasks(); }}
                  />
                ))}
              </DroppableColumn>
            );
          })}
        </div>
        <DragOverlay>
          {activeTask ? (
            <div className="opacity-75 pointer-events-none">
              <TaskCard task={activeTask} onClick={() => {}} onStatusChange={() => {}} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <ArchivedSection tasksByStatus={tasksByStatus} onSelectTask={onSelectTask} />

      {showNewCycleModal && <NewCycleModal projectId={projectId} onCreated={handleCycleCreated} onClose={() => setShowNewCycleModal(false)} />}
    </div>
  );
}
