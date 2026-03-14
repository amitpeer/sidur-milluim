import { eachDayInRange, dateToString, parseServerDate } from "@/lib/date-utils";
import type {
  CellStatus,
  SoldierRow,
  DayColumnMeta,
  MonthGroup,
  DailyTotal,
} from "./board.types";
import type { getActiveScheduleVersion } from "@/server/db/stores/schedule-store";
import type { getSeasonConfig } from "@/server/db/stores/season-store";

type ScheduleVersion = NonNullable<Awaited<ReturnType<typeof getActiveScheduleVersion>>>;
type SeasonData = NonNullable<Awaited<ReturnType<typeof getSeasonConfig>>>;

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
  const allSoldiers = [...nonDrivers, ...drivers];
  const statusMap = buildStatusMap(schedule, allSoldiers, dayColumns, constraintKeys);
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
  soldiers: readonly SoldierRow[],
  dayColumns: readonly DayColumnMeta[],
  constraintKeys: Set<string>,
): Map<string, CellStatus> {
  const onBaseKeys = new Set<string>();
  const absentReasonMap = new Map<string, "sick" | "course">();
  for (const a of schedule.assignments) {
    const key = `${a.soldierProfileId}::${dateToString(new Date(a.date))}`;
    if (a.isOnBase) {
      onBaseKeys.add(key);
    }
    if (a.absentReason === "sick" || a.absentReason === "course") {
      absentReasonMap.set(key, a.absentReason);
    }
  }

  const map = new Map<string, CellStatus>();
  for (const soldier of soldiers) {
    for (const col of dayColumns) {
      const key = `${soldier.id}::${col.dateStr}`;
      const absentReason = absentReasonMap.get(key);
      if (absentReason) {
        map.set(key, absentReason);
      } else if (constraintKeys.has(`${soldier.id}-${col.dateStr}`)) {
        map.set(key, "constraint-off");
      } else if (onBaseKeys.has(key)) {
        map.set(key, "present");
      } else {
        map.set(key, "rotation-off");
      }
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
