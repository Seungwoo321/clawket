import { useState, useEffect, useCallback } from 'react';
import type { Project, Plan, Unit, Task, Cycle, Run } from '../types';
import { CLOSED_STATUSES } from '../types';
import api from '../api';
import { ProjectSettings } from './ProjectSettings';

interface SummaryViewProps {
  projectId: string;
  onSelectTask: (taskId: string) => void;
}

interface UnitWithPlan extends Unit {
  planTitle: string;
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-surface rounded-lg border border-border p-4">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-muted mt-1">{label}</div>
    </div>
  );
}

function ProgressBar({ done, inProgress, todo, blocked }: { done: number; inProgress: number; todo: number; blocked: number }) {
  const total = done + inProgress + todo + blocked;
  if (total === 0) return null;

  const pDone = (done / total) * 100;
  const pInProgress = (inProgress / total) * 100;
  const pBlocked = (blocked / total) * 100;

  return (
    <div className="w-full h-2 rounded-full bg-surface-high overflow-hidden flex">
      {pDone > 0 && <div className="bg-success h-full" style={{ width: `${pDone}%` }} />}
      {pInProgress > 0 && <div className="bg-warning h-full" style={{ width: `${pInProgress}%` }} />}
      {pBlocked > 0 && <div className="bg-danger h-full" style={{ width: `${pBlocked}%` }} />}
    </div>
  );
}

export default function SummaryView({ projectId, onSelectTask }: SummaryViewProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [units, setUnits] = useState<UnitWithPlan[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);

  const reloadProject = useCallback(async () => {
    const p = await api.getProject(projectId);
    setProject(p);
    return p;
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    async function load() {
      try {
        const [proj, planList, cycleList] = await Promise.all([
          api.getProject(projectId),
          api.listPlans({ project_id: projectId }),
          api.listCycles({ project_id: projectId }),
        ]);
        if (cancelled) return;
        setProject(proj);
        if (cancelled) return;
        setPlans(planList);
        setCycles(cycleList);

        // Load units for each plan
        const unitResults = await Promise.all(
          planList.map(p => api.listUnits({ plan_id: p.id }).then(units =>
            units.map(u => ({ ...u, planTitle: p.title }))
          ))
        );
        if (cancelled) return;
        const allUnits = unitResults.flat();
        setUnits(allUnits);

        // Load tasks for each unit
        const taskResults = await Promise.all(
          allUnits.map(u => api.listTasks({ unit_id: u.id }))
        );
        if (cancelled) return;
        const allTasks = taskResults.flat();
        setTasks(allTasks);

        // Load recent runs (limited)
        const runResults = await Promise.all(
          allTasks.slice(0, 20).map(t => api.listRuns({ task_id: t.id }))
        );
        if (cancelled) return;
        setRuns(runResults.flat());
      } catch (err) {
        console.error('Failed to load summary:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted">
        Loading summary...
      </div>
    );
  }

  // Task stats
  const tasksByStatus = {
    done: tasks.filter(s => CLOSED_STATUSES.has(s.status)).length,
    in_progress: tasks.filter(s => s.status === 'in_progress').length,
    todo: tasks.filter(s => s.status === 'todo').length,
    blocked: tasks.filter(s => s.status === 'blocked').length,
  };
  const totalTasks = tasks.length;
  const completionPercent = totalTasks > 0 ? Math.round((tasksByStatus.done / totalTasks) * 100) : 0;

  // Active agents
  const activeAgents = [...new Set(
    tasks.filter(s => s.status === 'in_progress' && s.assignee).map(s => s.assignee!)
  )];

  // Active cycles
  const activeCycles = cycles.filter(b => b.status === 'active');

  // Recent activity (last 10 runs sorted by started_at desc)
  const recentRuns = [...runs]
    .sort((a, b) => b.started_at - a.started_at)
    .slice(0, 10);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-foreground">Summary</h2>
        <p className="text-sm text-muted mt-1">
          {plans.length} plan{plans.length !== 1 ? 's' : ''} &middot; {units.length} unit{units.length !== 1 ? 's' : ''} &middot; {totalTasks} task{totalTasks !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Overall progress */}
      <div className="bg-surface rounded-lg border border-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">Overall Progress</span>
          <span className="text-sm font-bold text-primary">{completionPercent}%</span>
        </div>
        <ProgressBar
          done={tasksByStatus.done}
          inProgress={tasksByStatus.in_progress}
          todo={tasksByStatus.todo}
          blocked={tasksByStatus.blocked}
        />
        <div className="flex gap-4 text-xs text-muted flex-wrap">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-success inline-block" /> Closed {tasksByStatus.done}</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-warning inline-block" /> Active {tasksByStatus.in_progress}</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-surface-high inline-block" /> Todo {tasksByStatus.todo}</span>
          {tasksByStatus.blocked > 0 && (
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-danger inline-block" /> Blocked {tasksByStatus.blocked}</span>
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Tasks" value={totalTasks} color="text-foreground" />
        <StatCard label="Closed" value={tasksByStatus.done} color="text-success" />
        <StatCard label="In Progress" value={tasksByStatus.in_progress} color="text-warning" />
        <StatCard label="Blocked" value={tasksByStatus.blocked} color="text-danger" />
      </div>

      {/* Active agents & cycles */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Active Agents */}
        <div className="bg-surface rounded-lg border border-border p-4">
          <h3 className="text-sm font-medium text-foreground mb-3">Active Agents</h3>
          {activeAgents.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {activeAgents.map(agent => (
                <span key={agent} className="inline-flex items-center px-2 py-1 rounded-md bg-primary/10 text-primary text-xs font-medium">
                  @{agent}
                </span>
              ))}
            </div>
          ) : (
            <div className="text-xs text-muted">No active agents</div>
          )}
        </div>

        {/* Active Cycles */}
        <div className="bg-surface rounded-lg border border-border p-4">
          <h3 className="text-sm font-medium text-foreground mb-3">Active Cycles</h3>
          {activeCycles.length > 0 ? (
            <div className="space-y-2">
              {activeCycles.map(cycle => {
                const cycleTasks = tasks.filter(s => s.cycle_id === cycle.id);
                const cycleDone = cycleTasks.filter(s => CLOSED_STATUSES.has(s.status)).length;
                return (
                  <div key={cycle.id} className="flex items-center justify-between">
                    <span className="text-sm text-foreground">{cycle.title}</span>
                    <span className="text-xs text-muted">{cycleDone}/{cycleTasks.length}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-xs text-muted">No active cycles</div>
          )}
        </div>
      </div>

      {/* Unit status */}
      <div className="bg-surface rounded-lg border border-border p-4">
        <h3 className="text-sm font-medium text-foreground mb-3">Units</h3>
        <div className="space-y-2">
          {units.map(unit => {
            const unitTasks = tasks.filter(s => s.unit_id === unit.id);
            const uDone = unitTasks.filter(s => CLOSED_STATUSES.has(s.status)).length;
            const uTotal = unitTasks.length;
            return (
              <div key={unit.id} className="flex items-center gap-3">
                <span className="text-sm text-foreground flex-1 truncate">{unit.title}</span>
                <span className="text-xs text-muted whitespace-nowrap">
                  {uDone}/{uTotal}
                </span>
                <div className="w-24 h-1.5 rounded-full bg-surface-high overflow-hidden">
                  {uTotal > 0 && (
                    <div className="h-full bg-success rounded-full" style={{ width: `${(uDone / uTotal) * 100}%` }} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* In-progress tasks */}
      {tasksByStatus.in_progress > 0 && (
        <div className="bg-surface rounded-lg border border-border p-4">
          <h3 className="text-sm font-medium text-foreground mb-3">In Progress</h3>
          <div className="space-y-1">
            {tasks.filter(s => s.status === 'in_progress').map(task => (
              <button
                key={task.id}
                onClick={() => onSelectTask(task.id)}
                className="w-full text-left px-3 py-2 rounded-md hover:bg-surface-hover transition-colors flex items-center gap-2 cursor-pointer"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-warning shrink-0" />
                <span className="text-sm text-foreground truncate flex-1">{task.title}</span>
                {task.assignee && (
                  <span className="text-xs text-muted">@{task.assignee}</span>
                )}
                {task.ticket_number && (
                  <span className="text-xs text-muted font-mono">{task.ticket_number}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Recent activity */}
      {recentRuns.length > 0 && (
        <div className="bg-surface rounded-lg border border-border p-4">
          <h3 className="text-sm font-medium text-foreground mb-3">Recent Activity</h3>
          <div className="space-y-1">
            {recentRuns.map(run => {
              const task = tasks.find(s => s.id === run.task_id);
              const isFinished = !!run.ended_at;
              return (
                <div key={run.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isFinished ? 'bg-success' : 'bg-warning'}`} />
                  <span className="text-foreground truncate flex-1">
                    {task?.title || run.task_id}
                  </span>
                  <span className="text-xs text-muted">@{run.agent}</span>
                  {run.result && (
                    <span className={`text-xs ${run.result === 'success' ? 'text-success' : 'text-muted'}`}>
                      {run.result}
                    </span>
                  )}
                  <span className="text-xs text-muted">
                    {new Date(run.started_at).toLocaleDateString()}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {project && <ProjectSettings project={project} projectId={projectId} onProjectChange={reloadProject} />}
    </div>
  );
}
