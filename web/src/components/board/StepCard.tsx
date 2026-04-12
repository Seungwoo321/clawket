import type { Step } from '../../types';
import { Badge } from '../ui';
import { useDraggable } from '@dnd-kit/core';
import { PRIORITY_DOT, PRIORITY_LABEL, STATUS_TRANSITIONS } from './constants';

interface StepCardProps {
  step: Step;
  onClick: () => void;
  onStatusChange: (newStatus: Step['status']) => void;
}

export function StepCard({ step, onClick, onStatusChange }: StepCardProps) {
  const transitions = STATUS_TRANSITIONS[step.status] ?? [];

  return (
    <div className="w-full text-left rounded-md border border-border bg-background transition-colors duration-150 hover:bg-surface-hover hover:border-primary/30">
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left p-3 space-y-2 focus:outline-none focus:ring-2 focus:ring-primary/40 rounded-t-md"
      >
        {step.ticket_number && (
          <span className="font-mono text-xs text-muted">
            {step.ticket_number}
          </span>
        )}
        <p className="text-sm font-medium text-foreground leading-snug">
          {step.title}
        </p>
        <div className="flex items-center justify-between gap-2">
          {step.assignee ? (
            <Badge variant="primary" size="sm">
              {step.assignee}
            </Badge>
          ) : (
            <span className="text-xs text-muted/50">Unassigned</span>
          )}
          <div className="flex items-center gap-1.5" title={PRIORITY_LABEL[step.priority]}>
            <span className={`inline-block w-2 h-2 rounded-full ${PRIORITY_DOT[step.priority]}`} />
            <span className="text-xs text-muted">{PRIORITY_LABEL[step.priority]}</span>
          </div>
        </div>
      </button>
      {transitions.length > 0 && (
        <div className="flex items-center gap-1 px-3 pb-2 pt-0">
          {transitions.map((t) => (
            <button
              key={t.target}
              type="button"
              onClick={(e) => { e.stopPropagation(); onStatusChange(t.target); }}
              className="px-2 py-0.5 text-xs rounded border border-border text-muted hover:text-foreground hover:border-primary/40 hover:bg-primary/10 transition-colors duration-150"
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function DraggableStepCard({ step, onClick, onStatusChange }: StepCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: step.id });

  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={`touch-none ${isDragging ? 'opacity-30' : ''}`}>
      <StepCard step={step} onClick={onClick} onStatusChange={onStatusChange} />
    </div>
  );
}
