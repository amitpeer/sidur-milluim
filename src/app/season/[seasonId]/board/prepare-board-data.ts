import { eachDayInRange, dateToString, parseServerDate } from "@/lib/date-utils";
import type {
  CellStatus,
  SoldierRow,
  DayColumnMeta,
  MonthGroup,
  DailyTotal,
} from "./board.types";
import type { getBoardDataAction } from "@/server/actions/schedule-actions";

type BoardData = NonNullable<Awaited<ReturnType<typeof getBoardDataAction>>>;
type ScheduleVersion = NonNullable<BoardData["schedule"]>;
type SeasonData = BoardData["season"];

export interface PreparedBoardData {
  readonly nonDrivers: readonly SoldierRow[];
  readonly drivers: readonly SoldierRow[];
  readonly allDays: readonly Date[];
  readonly dayColumns: readonly DayColumnMeta[];
  readonly monthGroups: readonly MonthGroup[];
  readonly statusMap: ReadonlyMap<string, CellStatus>;
  readonly dailyTotals: ReadonlyMap<string, DailyTotal>;
}

export function prepareBoardData(
  schedule: ScheduleVersion,
  season: SeasonData,
  constraintKeys: Set<string>,
): PreparedBoardData {
  const seasonStart = parseServerDate(season.startDate);
  const seasonEnd = parseServerDate(season.endDate);
  seasonStart.setUTCHours(0, 0, 0, 0);
  seasonEnd.setUTCHours(0, 0, 0, 0);
  const allDays = eachDayInRange(seasonStart, seasonEnd);

  const dayColumns = buildDayColumns(allDays);
  const monthGroups = buildMonthGroups(allDays);
  const { nonDrivers, drivers } = buildSoldierLists(schedule);
  const statusMap = buildStatusMap(schedule, constraintKeys);
  const dailyTotals = buildDailyTotals(schedule);

  return { nonDrivers, drivers, allDays, dayColumns, monthGroups, statusMap, dailyTotals };
}

function buildDayColumns(allDays: readonly Date[]): DayColumnMeta[] {
  let prevMonth = -1;
  return allDays.map((day) => {
    const month = day.getUTCMonth();
    const isMonthStart = month !== prevMonth;
    prevMonth = month;
    return {
      date: day,
      dateStr: dateToString(day),
      dayName: day.toLocaleDateString("he-IL", { weekday: "narrow" }),
      dateNumber: day.getUTCDate(),
      monthLabel: day.toLocaleDateString("he-IL", { month: "short" }),
      isMonthStart,
    };
  });
}

function buildMonthGroups(allDays: readonly Date[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  let prevMonth = -1;
  for (const day of allDays) {
    const month = day.getUTCMonth();
    if (month !== prevMonth) {
      groups.push({
        month: day.toLocaleDateString("he-IL", { month: "long" }),
        colSpan: 1,
      });
      prevMonth = month;
    } else {
      const last = groups[groups.length - 1] as { month: string; colSpan: number };
      last.colSpan++;
    }
  }
  return groups;
}

function buildSoldierLists(schedule: ScheduleVersion): {
  nonDrivers: SoldierRow[];
  drivers: SoldierRow[];
} {
  const soldierMap = new Map<string, SoldierRow>();
  for (const a of schedule.assignments) {
    if (!soldierMap.has(a.soldierProfile.id)) {
      soldierMap.set(a.soldierProfile.id, {
        id: a.soldierProfile.id,
        name: a.soldierProfile.fullName,
        roles: [...(a.soldierProfile.roles as string[])],
      });
    }
  }
  const sorted = [...soldierMap.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "he"),
  );
  return {
    nonDrivers: sorted.filter((s) => !s.roles.includes("driver")),
    drivers: sorted.filter((s) => s.roles.includes("driver")),
  };
}

function buildStatusMap(
  schedule: ScheduleVersion,
  constraintKeys: Set<string>,
): Map<string, CellStatus> {
  const map = new Map<string, CellStatus>();
  for (const a of schedule.assignments) {
    const dateStr = dateToString(new Date(a.date));
    const key = `${a.soldierProfileId}::${dateStr}`;
    if (a.isOnBase) {
      map.set(key, "present");
    } else if (constraintKeys.has(`${a.soldierProfileId}-${dateStr}`)) {
      map.set(key, "constraint-off");
    } else {
      map.set(key, "rotation-off");
    }
  }
  return map;
}

function buildDailyTotals(schedule: ScheduleVersion): Map<string, DailyTotal> {
  const totals = new Map<string, { total: number; commander: number; driver: number; navigator: number }>();
  for (const a of schedule.assignments) {
    if (!a.isOnBase) continue;
    const ds = dateToString(new Date(a.date));
    if (!totals.has(ds)) {
      totals.set(ds, { total: 0, commander: 0, driver: 0, navigator: 0 });
    }
    const t = totals.get(ds)!;
    t.total++;
    const roles = a.soldierProfile.roles as string[];
    if (roles.includes("commander")) t.commander++;
    if (roles.includes("driver")) t.driver++;
    if (roles.includes("navigator")) t.navigator++;
  }
  return totals;
}
