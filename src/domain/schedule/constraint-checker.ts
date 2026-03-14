import type { ScheduleAssignment } from "./schedule.types";

export interface ConstraintChecker {
  findViolations(
    onBaseAssignments: readonly ScheduleAssignment[],
    date: Date,
  ): ScheduleAssignment[];

  isBlocked(soldierId: string, date: Date): boolean;
}
