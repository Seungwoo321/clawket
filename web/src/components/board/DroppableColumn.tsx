import { useDroppable } from '@dnd-kit/core';
import type { COLUMNS } from './constants';

export function DroppableColumn({
  col,
  count,
  children,
}: {
  col: (typeof COLUMNS)[number];
  count: number;
  children: React.ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: col.key });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col min-h-0 rounded-lg border-2 transition-colors duration-150 bg-surface/50 ${
        isOver ? 'border-primary/60 bg-primary/5' : 'border-border'
      }`}
    >
      <div className={`flex-shrink-0 flex items-center justify-between px-3 py-2.5 rounded-t-lg ${col.headerBg}`}>
        <span className={`text-sm font-semibold ${col.headerText}`}>{col.label}</span>
        <span className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-xs font-medium ${col.countBg} ${col.countText}`}>
          {count}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {children}
      </div>
    </div>
  );
}
