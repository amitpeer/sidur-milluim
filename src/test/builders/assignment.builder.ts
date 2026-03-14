import type { ScheduleAssignment } from "@/domain/schedule/schedule.types";

export function buildAssignment(
  overrides: Partial<ScheduleAssignment> & {
    soldierProfileId: string;
    dateStr: string;
  },
): ScheduleAssignment {
  return {
    date: new Date(overrides.dateStr + "T00:00:00.000Z"),
    isOnBase: true,
    isUnavailable: false,
    absentReason: null,
    replacedById: null,
    manualOverride: false,
    ...overrides,
    soldierProfileId: overrides.soldierProfileId,
  };
}
