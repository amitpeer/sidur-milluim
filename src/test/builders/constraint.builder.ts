import type { DayOffConstraint } from "@/domain/constraint/constraint.types";

let counter = 0;

export function buildConstraint(
  overrides: Partial<DayOffConstraint> = {},
): DayOffConstraint {
  counter++;
  return {
    id: `constraint-${counter}`,
    seasonId: `season-1`,
    soldierProfileId: `soldier-1`,
    date: new Date("2026-03-01T00:00:00.000Z"),
    ...overrides,
  };
}
