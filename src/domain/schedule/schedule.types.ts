export type AbsentReason = "sick" | "course";

export interface ScheduleAssignment {
  readonly soldierProfileId: string;
  readonly date: Date;
  readonly isOnBase: boolean;
  readonly isUnavailable: boolean;
  readonly absentReason: AbsentReason | null;
  readonly replacedById: string | null;
  readonly manualOverride: boolean;
}

export interface ScheduleVersion {
  readonly id: string;
  readonly seasonId: string;
  readonly version: number;
  readonly isActive: boolean;
  readonly assignments: readonly ScheduleAssignment[];
}

export interface ValidationWarning {
  readonly date: Date;
  readonly type: "headcount_low" | "headcount_high" | "role_missing";
  readonly message: string;
}
