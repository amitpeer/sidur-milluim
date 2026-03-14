export type CellStatus = "present" | "constraint-off" | "rotation-off" | "sick" | "course";

export interface SoldierRow {
  readonly id: string;
  readonly name: string;
  readonly roles: readonly string[];
}

export interface DayColumnMeta {
  readonly date: Date;
  readonly dateStr: string;
  readonly dayName: string;
  readonly dateNumber: number;
  readonly monthLabel: string;
  readonly isMonthStart: boolean;
}

export interface MonthGroup {
  readonly month: string;
  readonly colSpan: number;
}

export interface DailyTotal {
  readonly total: number;
  readonly commander: number;
  readonly driver: number;
  readonly navigator: number;
}
