"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { adminSetCellStatusAction } from "@/server/actions/schedule-actions";
import type { SoldierRole } from "@/lib/constants";
import type { CellStatus } from "./board.types";
import { prepareBoardData } from "./prepare-board-data";
import { useOptimisticStatus } from "./use-optimistic-status";
import { BoardHeader } from "./board-header";
import { BoardBody } from "./board-body";
import { BoardFooter } from "./board-footer";
import type { getBoardDataAction } from "@/server/actions/schedule-actions";

type BoardData = NonNullable<Awaited<ReturnType<typeof getBoardDataAction>>>;
type ScheduleVersion = NonNullable<BoardData["schedule"]>;
type SeasonData = BoardData["season"];

interface ScheduleBoardProps {
  readonly schedule: ScheduleVersion;
  readonly season: SeasonData;
  readonly constraintKeys: Set<string>;
  readonly isAdmin: boolean;
  readonly seasonId: string;
  readonly onCellChange: () => Promise<void>;
}

export function ScheduleBoard({
  schedule,
  season,
  constraintKeys,
  isAdmin,
  seasonId,
  onCellChange,
}: ScheduleBoardProps) {
  const data = useMemo(
    () => prepareBoardData(schedule, season, constraintKeys),
    [schedule, season, constraintKeys],
  );

  const { overrides, applyOverride } = useOptimisticStatus(schedule);

  const scrollRef = useRef<HTMLDivElement>(null);
  const monthRowRef = useRef<HTMLTableRowElement>(null);
  const [monthRowHeight, setMonthRowHeight] = useState(0);

  // Measure available height for the scroll container.
  // This bypasses the flex chain entirely — we measure where the container
  // starts and compute how much viewport remains below it.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const update = () => {
      const top = el.getBoundingClientRect().top;
      // On mobile (<768px), reserve 64px for the fixed bottom nav
      const bottomOffset = window.innerWidth < 768 ? 64 : 0;
      el.style.height = `${window.innerHeight - top - bottomOffset}px`;
    };

    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useLayoutEffect(() => {
    if (monthRowRef.current) {
      setMonthRowHeight(monthRowRef.current.offsetHeight);
    }
  }, [data.dayColumns]);

  const handleStatusChange = (soldierId: string, dateStr: string, status: CellStatus) => {
    applyOverride(`${soldierId}::${dateStr}`, status);
    adminSetCellStatusAction(seasonId, soldierId, dateStr, status).then(
      () => onCellChange(),
    );
  };

  const roleMinimums = (season.roleMinimums ?? {}) as Partial<Record<SoldierRole, number>>;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center px-3 py-1.5 md:mb-4 md:px-0 md:py-0">
        <h2 className="text-sm font-semibold md:text-xl">
          לוח סידור
          <span className="mr-2 text-xs font-normal text-zinc-400 md:text-sm">
            סידור {schedule.version}
          </span>
        </h2>
      </div>

      <div
        ref={scrollRef}
        className="overflow-auto overscroll-contain"
      >
        <table className="border-separate border-spacing-0 text-xs">
          <BoardHeader
            monthGroups={data.monthGroups}
            dayColumns={data.dayColumns}
            monthRowRef={monthRowRef}
            monthRowHeight={monthRowHeight}
          />
          <BoardBody
            nonDrivers={data.nonDrivers}
            drivers={data.drivers}
            dayColumns={data.dayColumns}
            statusMap={data.statusMap}
            optimisticOverrides={overrides}
            isAdmin={isAdmin}
            onStatusChange={handleStatusChange}
          />
          <BoardFooter
            dayColumns={data.dayColumns}
            dailyTotals={data.dailyTotals}
            dailyMin={season.dailyHeadcount}
            roleMinimums={roleMinimums}
          />
        </table>
      </div>
    </div>
  );
}
