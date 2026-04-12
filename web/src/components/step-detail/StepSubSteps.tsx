import { useState, useEffect, useCallback } from 'react';
import type { Step } from '../../types';
import api from '../../api';
import { Label, Input, Button } from '../ui';

const STEP_STATUS_ICON: Record<Step['status'], { icon: string; color: string }> = {
  todo: { icon: '\u25CB', color: 'text-muted' },
  in_progress: { icon: '\u25D0', color: 'text-warning' },
  review: { icon: '\u25D2', color: 'text-primary' },
  done: { icon: '\u25CF', color: 'text-success' },
  blocked: { icon: '\u2298', color: 'text-danger' },
  cancelled: { icon: '\u2715', color: 'text-muted' },
  superseded: { icon: '\u2715', color: 'text-muted' },
  deferred: { icon: '\u223C', color: 'text-muted' },
};

function SubStepTree({ steps, depth = 0 }: { steps: Step[]; depth?: number }) {
  const [childMap, setChildMap] = useState<Record<string, Step[]>>({});

  useEffect(() => {
    if (depth >= 3) return;
    const ids = steps.map((s) => s.id);
    Promise.all(ids.map((id) => api.listChildSteps(id).catch(() => [] as Step[]))).then(
      (results) => {
        const map: Record<string, Step[]> = {};
        ids.forEach((id, i) => {
          if (results[i].length > 0) map[id] = results[i];
        });
        setChildMap(map);
      },
    );
  }, [steps, depth]);

  return (
    <>
      {steps.map((s) => {
        const si = STEP_STATUS_ICON[s.status];
        const children = childMap[s.id];
        return (
          <div key={s.id}>
            <div className="flex items-center gap-2 px-3 py-1.5" style={{ paddingLeft: `${12 + depth * 16}px` }}>
              <span className={`${si.color} text-sm`}>{si.icon}</span>
              <span className="text-xs text-muted font-mono">{s.ticket_number ?? `...${s.id.slice(-6)}`}</span>
              <span className="text-sm text-foreground truncate flex-1">{s.title}</span>
              {s.assignee && <span className="text-xs text-muted">@{s.assignee}</span>}
            </div>
            {children && <SubStepTree steps={children} depth={depth + 1} />}
          </div>
        );
      })}
    </>
  );
}

export function StepSubSteps({
  step,
  childSteps,
  onChildCreated,
}: {
  step: Step;
  childSteps: Step[];
  onChildCreated: (child: Step) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [assigneeDraft, setAssigneeDraft] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = useCallback(async () => {
    if (!titleDraft.trim()) return;
    setCreating(true);
    try {
      const child = await api.createStep({
        phase_id: step.phase_id,
        idx: childSteps.length,
        title: titleDraft.trim(),
        body: '',
        assignee: assigneeDraft.trim() || undefined,
        parent_step_id: step.id,
      });
      onChildCreated(child);
      setTitleDraft('');
      setAssigneeDraft('');
      setShowForm(false);
    } catch (err) {
      console.error('Failed to create sub-step:', err);
    } finally {
      setCreating(false);
    }
  }, [step, titleDraft, assigneeDraft, onChildCreated]);

  return (
    <div>
      <Label>Sub-Steps ({childSteps.length})</Label>
      {childSteps.length === 0 && !showForm ? (
        <div className="text-sm text-muted italic">No sub-steps</div>
      ) : (
        <div className="bg-background border border-border rounded overflow-hidden divide-y divide-border">
          <SubStepTree steps={childSteps} />
        </div>
      )}
      {showForm ? (
        <div className="mt-2 bg-background border border-border rounded p-3 space-y-2">
          <Input value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} placeholder="Sub-step title" size="sm" autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowForm(false); }} />
          <Input value={assigneeDraft} onChange={(e) => setAssigneeDraft(e.target.value)} placeholder="Assignee (optional)" size="sm"
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowForm(false); }} />
          <div className="flex items-center gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button variant="secondary" size="sm" onClick={handleCreate} disabled={creating || !titleDraft.trim()}>
              {creating ? 'Creating...' : 'Create'}
            </Button>
          </div>
        </div>
      ) : (
        <button className="mt-2 flex items-center gap-1 text-xs text-muted hover:text-primary transition-colors" onClick={() => setShowForm(true)}>
          <span className="text-base leading-none">+</span> Add sub-step
        </button>
      )}
    </div>
  );
}
