import { dateToString } from "@/lib/date-utils";
import type { ConstraintChecker } from "./constraint-checker";
import type { ScheduleAssignment } from "./schedule.types";

export class DayOffConstraintChecker implements ConstraintChecker {
  private readonly blocked: Set<string>;

  constructor(
    constraints: readonly {
      readonly soldierProfileId: string;
      readonly date: Date;
    }[],
  ) {
    this.blocked = new Set(
      constraints.map((c) => `${c.soldierProfileId}:${dateToString(c.date)}`),
    );
  }

  findViolations(
    onBaseAssignments: readonly ScheduleAssignment[],
    date: Date,
  ): ScheduleAssignment[] {
    return onBaseAssignments.filter((a) => this.isBlocked(a.soldierProfileId, date));
  }

  isBlocked(soldierId: string, date: Date): boolean {
    return this.blocked.has(`${soldierId}:${dateToString(date)}`);
  }
}
