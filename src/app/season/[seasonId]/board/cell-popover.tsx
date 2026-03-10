"use client";

import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { CellStatus } from "./board.types";

interface CellPopoverProps {
  readonly onSelect: (status: CellStatus) => void;
  readonly cellRef: React.RefObject<HTMLTableCellElement | null>;
}

export function CellPopover({ onSelect, cellRef }: CellPopoverProps) {
  const [style, setStyle] = useState<React.CSSProperties>({ opacity: 0 });

  useLayoutEffect(() => {
    const el = cellRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openAbove = spaceBelow < 60;

    setStyle({
      position: "fixed",
      left: rect.left + rect.width / 2,
      top: openAbove ? rect.top - 4 : rect.bottom + 4,
      transform: openAbove ? "translate(-50%, -100%)" : "translate(-50%, 0)",
      zIndex: 9999,
      opacity: 1,
    });
  }, [cellRef]);

  return createPortal(
    <div
      style={style}
      className="rounded-lg border border-zinc-200 bg-white p-1.5 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
    >
      <div className="flex gap-1">
        <button
          onClick={(e) => { e.stopPropagation(); onSelect("present"); }}
          className="rounded px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-100 dark:text-green-300 dark:hover:bg-green-900"
          title="נוכח"
        >
          V
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onSelect("rotation-off"); }}
          className="rounded px-2 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          title="חופש רוטציה"
        >
          —
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onSelect("constraint-off"); }}
          className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-100 dark:text-red-300 dark:hover:bg-red-900"
          title="חופש אילוץ"
        >
          X
        </button>
      </div>
    </div>,
    document.body,
  );
}
