import type { SoldierRole } from "@/lib/constants";

export interface Season {
  readonly id: string;
  readonly name: string;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly trainingEndDate: Date | null;
  readonly dailyHeadcount: number;
  readonly roleMinimums: Readonly<Partial<Record<SoldierRole, number>>>;
  readonly constraintDeadline: Date | null;
  readonly isActive: boolean;
  readonly cityGroupingEnabled: boolean;
  readonly maxConsecutiveDays: number | null;
}
