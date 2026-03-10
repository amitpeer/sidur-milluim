"use client";

import type { CellStatus, DayColumnMeta, SoldierRow } from "./board.types";
import { BoardCell } from "./board-cell";
import { SOLDIER_ROLE_LABELS } from "@/lib/constants";

interface BoardBodyProps {
  readonly nonDrivers: readonly SoldierRow[];
  readonly drivers: readonly SoldierRow[];
  readonly dayColumns: readonly DayColumnMeta[];
  readonly statusMap: ReadonlyMap<string, CellStatus>;
  readonly optimisticOverrides: ReadonlyMap<string, CellStatus>;
  readonly isAdmin: boolean;
  readonly onStatusChange: (soldierId: string, dateStr: string, status: CellStatus) => void;
}

const STICKY_NAME =
  "sticky right-0 z-20 shadow-[inset_-2px_0_4px_-2px_rgba(0,0,0,0.08)]";

export function BoardBody({
  nonDrivers,
  drivers,
  dayColumns,
  statusMap,
  optimisticOverrides,
  isAdmin,
  onStatusChange,
}: BoardBodyProps) {
  return (
    <tbody>
      {nonDrivers.map((soldier) => (
        <SoldierRowComponent
          key={soldier.id}
          soldier={soldier}
          dayColumns={dayColumns}
          statusMap={statusMap}
          optimisticOverrides={optimisticOverrides}
          isAdmin={isAdmin}
          onStatusChange={onStatusChange}
          rowBg="bg-white dark:bg-zinc-950"
        />
      ))}
      {drivers.length > 0 && (
        <tr>
          <td
            colSpan={dayColumns.length + 1}
            className="border border-zinc-200 bg-blue-50 px-3 py-1.5 text-[11px] font-semibold text-blue-700 dark:border-zinc-700 dark:bg-blue-950 dark:text-blue-300"
          >
            {SOLDIER_ROLE_LABELS.driver} ({drivers.length})
          </td>
        </tr>
      )}
      {drivers.map((soldier) => (
        <SoldierRowComponent
          key={soldier.id}
          soldier={soldier}
          dayColumns={dayColumns}
          statusMap={statusMap}
          optimisticOverrides={optimisticOverrides}
          isAdmin={isAdmin}
          onStatusChange={onStatusChange}
          rowBg="bg-blue-50 dark:bg-blue-950/40"
        />
      ))}
    </tbody>
  );
}

interface SoldierRowComponentProps {
  readonly soldier: SoldierRow;
  readonly dayColumns: readonly DayColumnMeta[];
  readonly statusMap: ReadonlyMap<string, CellStatus>;
  readonly optimisticOverrides: ReadonlyMap<string, CellStatus>;
  readonly isAdmin: boolean;
  readonly onStatusChange: (soldierId: string, dateStr: string, status: CellStatus) => void;
  readonly rowBg: string;
}

function SoldierRowComponent({
  soldier,
  dayColumns,
  statusMap,
  optimisticOverrides,
  isAdmin,
  onStatusChange,
  rowBg,
}: SoldierRowComponentProps) {
  return (
    <tr>
      <td
        className={`${STICKY_NAME} whitespace-nowrap border border-zinc-200 ${rowBg} px-3 py-2 font-medium dark:border-zinc-700`}
      >
        {soldier.name}
      </td>
      {dayColumns.map((col) => (
        <BoardCell
          key={col.dateStr}
          soldierId={soldier.id}
          dateStr={col.dateStr}
          statusMap={statusMap}
          optimisticOverrides={optimisticOverrides}
          isAdmin={isAdmin}
          isMonthStart={col.isMonthStart}
          onStatusChange={onStatusChange}
        />
      ))}
    </tr>
  );
}
