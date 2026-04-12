import { useState } from 'react';
import type { Bolt } from '../../types';
import api from '../../api';
import { Button, Input, Label, Modal } from '../ui';

export function NewBoltModal({
  projectId,
  onCreated,
  onClose,
}: {
  projectId: string;
  onCreated: (bolt: Bolt) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState('');
  const [goal, setGoal] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setFormError('Title is required');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const newBolt = await api.createBolt({
        project_id: projectId,
        title: trimmedTitle,
        goal: goal.trim() || undefined,
      });
      onCreated(newBolt);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create bolt');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal.Overlay onClose={onClose}>
      <Modal.Content>
        <Modal.Header>New Bolt</Modal.Header>
        <Modal.Body>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="bolt-title">Title</Label>
              <Input id="bolt-title" size="md" placeholder="e.g. Sprint 1 - Core features" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bolt-goal">Goal (optional)</Label>
              <Input id="bolt-goal" size="md" placeholder="What should this bolt achieve?" value={goal} onChange={(e) => setGoal(e.target.value)} />
            </div>
            {formError && <p className="text-danger text-sm">{formError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={submitting}>Cancel</Button>
              <Button type="submit" variant="primary" size="sm" disabled={submitting}>{submitting ? 'Creating...' : 'Create Bolt'}</Button>
            </div>
          </form>
        </Modal.Body>
      </Modal.Content>
    </Modal.Overlay>
  );
}
