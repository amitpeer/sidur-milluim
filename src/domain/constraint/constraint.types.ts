export interface DayOffConstraint {
  readonly id: string;
  readonly seasonId: string;
  readonly soldierProfileId: string;
  readonly date: Date;
}
