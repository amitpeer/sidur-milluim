import type { SoldierRole } from "@/lib/constants";
import type { Season } from "@/domain/season/season.types";
import type { SeasonSoldier } from "@/domain/soldier/soldier.types";
import type { ScheduleAssignment, ValidationWarning } from "./schedule.types";
import { eachDayInRange, dateToString } from "@/lib/date-utils";

interface ValidateInput {
  readonly season: Season;
  readonly soldiers: readonly SeasonSoldier[];
  readonly assignments: readonly ScheduleAssignment[];
}

export function validateSchedule(input: ValidateInput): ValidationWarning[] {
  const { season, soldiers, assignments } = input;
  const days = eachDayInRange(season.startDate, season.endDate);
  const warnings: ValidationWarning[] = [];

  const soldierMap = new Map(soldiers.map((s) => [s.id, s]));

  for (const day of days) {
    if (isTrainingDay(day, season.trainingEndDate)) continue;

    const dateStr = dateToString(day);
    const dayAssignments = assignments.filter(
      (a) => dateToString(a.date) === dateStr && a.isOnBase && !a.isUnavailable,
    );

    if (dayAssignments.length < season.dailyHeadcount) {
      warnings.push({
        date: day,
        type: "headcount_low",
        message: `${dayAssignments.length} חיילים בבסיס מתוך ${season.dailyHeadcount} נדרשים`,
      });
    }

    for (const [role, min] of Object.entries(season.roleMinimums) as [SoldierRole, number][]) {
      const roleCount = dayAssignments.filter((a) => {
        const soldier = soldierMap.get(a.soldierProfileId);
        return soldier?.roles.includes(role);
      }).length;

      if (roleCount < min) {
        warnings.push({
          date: day,
          type: "role_missing",
          message: `חסר ${role}: ${roleCount}/${min}`,
        });
      }
    }
  }

  return warnings;
}

function isTrainingDay(day: Date, trainingEndDate: Date | null): boolean {
  if (!trainingEndDate) return false;
  return day <= trainingEndDate;
}
