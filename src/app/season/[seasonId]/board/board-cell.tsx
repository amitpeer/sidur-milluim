"use client";

import { memo, useEffect, useRef, useState } from "react";
import type { CellStatus } from "./board.types";
import { CellPopover } from "./cell-popover";

interface BoardCellProps {
  readonly soldierId: string;
  readonly dateStr: string;
  readonly statusMap: ReadonlyMap<string, CellStatus>;
  readonly optimisticOverrides: ReadonlyMap<string, CellStatus>;
  readonly isAdmin: boolean;
  readonly isMonthStart: boolean;
  readonly onStatusChange: (soldierId: string, dateStr: string, status: CellStatus) => void;
}

const STATUS_STYLES: Record<CellStatus, { className: string; text: string }> = {
  present: {
    className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    text: "V",
  },
  "constraint-off": {
    className: "bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-300",
    text: "X",
  },
  "rotation-off": {
    className: "bg-zinc-50 text-zinc-300 dark:bg-zinc-900 dark:text-zinc-600",
    text: "\u2014",
  },
};

export const BoardCell = memo(function BoardCell({
  soldierId,
  dateStr,
  statusMap,
  optimisticOverrides,
  isAdmin,
  isMonthStart,
  onStatusChange,
}: BoardCellProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const cellRef = useRef<HTMLTableCellElement>(null);

  useEffect(() => {
    if (!popoverOpen) return;
    const handler = (e: MouseEvent) => {
      if (cellRef.current && !cellRef.current.contains(e.target as Node)) {
        setPopoverOpen(false);
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [popoverOpen]);

  const key = `${soldierId}::${dateStr}`;
  const status = optimisticOverrides.get(key) ?? statusMap.get(key) ?? "rotation-off";
  const { className, text } = STATUS_STYLES[status];

  const handleSelect = (newStatus: CellStatus) => {
    setPopoverOpen(false);
    onStatusChange(soldierId, dateStr, newStatus);
  };

  const activeRing = popoverOpen
    ? "ring-2 ring-blue-500 ring-inset z-10"
    : "";

  return (
    <td
      ref={cellRef}
      className={`min-w-[2.5rem] border border-zinc-200 px-2 py-2 text-center dark:border-zinc-700 ${className} ${activeRing} ${isAdmin ? "cursor-pointer" : ""} ${isMonthStart ? "border-r-2 border-r-zinc-400 dark:border-r-zinc-500" : ""}`}
      onClick={isAdmin ? () => setPopoverOpen(!popoverOpen) : undefined}
    >
      {text}
      {popoverOpen && isAdmin && (
        <CellPopover onSelect={handleSelect} cellRef={cellRef} />
      )}
    </td>
  );
});
