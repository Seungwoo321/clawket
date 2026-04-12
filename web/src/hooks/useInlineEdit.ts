import { useState, useCallback } from 'react';

export function useInlineEdit(onSave: (id: string, field: string, value: string) => Promise<void>) {
  const [editId, setEditId] = useState<string | null>(null);
  const [editField, setEditField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const start = useCallback((id: string, field: string, value: string) => {
    setEditId(id);
    setEditField(field);
    setEditValue(value);
  }, []);

  const cancel = useCallback(() => {
    setEditId(null);
    setEditField(null);
  }, []);

  const save = useCallback(async () => {
    if (editId && editField && editValue.trim()) {
      await onSave(editId, editField, editValue.trim());
    }
    cancel();
  }, [editId, editField, editValue, onSave, cancel]);

  return { editId, editField, editValue, setEditValue, start, cancel, save };
}
