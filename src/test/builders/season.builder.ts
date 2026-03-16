import type { Season } from "@/domain/season/season.types";

let counter = 0;

export function buildSeason(overrides: Partial<Season> = {}): Season {
  counter++;
  return {
    id: `season-${counter}`,
    name: `עונה ${counter}`,
    startDate: new Date("2026-03-01T00:00:00.000Z"),
    endDate: new Date("2026-04-11T00:00:00.000Z"),
    trainingEndDate: null,
    dailyHeadcount: 8,
    roleMinimums: {},
    constraintDeadline: null,
    isActive: true,
    cityGroupingEnabled: true,
    maxConsecutiveDays: null,
    minConsecutiveDays: null,
    ...overrides,
  };
}
