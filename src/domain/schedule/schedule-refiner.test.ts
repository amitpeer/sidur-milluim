import { describe, it, expect } from "vitest";
import { refineSchedule } from "./schedule-refiner";
import { generateSchedule } from "./schedule-generator";
import { buildSoldier } from "@/test/builders/soldier.builder";
import { buildSeason } from "@/test/builders/season.builder";
import { buildAssignment } from "@/test/builders/assignment.builder";
import { dateToString, eachDayInRange, addDays } from "@/lib/date-utils";

describe("refineSchedule", () => {
  it("maintains headcount on every day", () => {
    const season = buildSeason({
      dailyHeadcount: 5,
      avgDaysArmy: 7,
      startDate: new Date("2026-03-01T00:00:00.000Z"),
      endDate: new Date("2026-04-11T00:00:00.000Z"),
    });
    const soldiers = Array.from({ length: 15 }, () => buildSoldier());

    const greedy = generateSchedule({ season, soldiers, constraints: [], seed: 1 });
    const refined = refineSchedule({
      assignments: greedy,
      season,
      soldiers,
      constraints: [],
      seed: 1,
    });

    const days = eachDayInRange(season.startDate, season.endDate);
    for (const day of days) {
      const dateStr = dateToString(day);
      const onBase = refined.filter(
        (a) => dateToString(a.date) === dateStr && a.isOnBase,
      );
      expect(onBase.length).toBe(5);
    }
  });

  it("does not violate constraints", () => {
    const season = buildSeason({
      dailyHeadcount: 5,
      avgDaysArmy: 7,
      startDate: new Date("2026-03-01T00:00:00.000Z"),
      endDate: new Date("2026-04-11T00:00:00.000Z"),
    });
    const soldiers = Array.from({ length: 15 }, () => buildSoldier());
    const constraints = [
      { soldierProfileId: soldiers[0].id, date: new Date("2026-03-05T00:00:00.000Z") },
      { soldierProfileId: soldiers[1].id, date: new Date("2026-03-10T00:00:00.000Z") },
      { soldierProfileId: soldiers[2].id, date: new Date("2026-03-15T00:00:00.000Z") },
    ];

    const greedy = generateSchedule({ season, soldiers, constraints, seed: 1 });
    const refined = refineSchedule({
      assignments: greedy,
      season,
      soldiers,
      constraints,
      seed: 1,
    });

    for (const c of constraints) {
      const violation = refined.find(
        (a) =>
          a.soldierProfileId === c.soldierProfileId &&
          dateToString(a.date) === dateToString(c.date) &&
          a.isOnBase,
      );
      expect(violation).toBeUndefined();
    }
  });

  it("does not violate role minimums", () => {
    const season = buildSeason({
      dailyHeadcount: 4,
      avgDaysArmy: 7,
      roleMinimums: { driver: 1 },
      startDate: new Date("2026-03-01T00:00:00.000Z"),
      endDate: new Date("2026-04-11T00:00:00.000Z"),
    });
    const soldiers = [
      buildSoldier({ roles: ["driver"] }),
      buildSoldier({ roles: ["driver"] }),
      ...Array.from({ length: 8 }, () => buildSoldier()),
    ];

    const greedy = generateSchedule({ season, soldiers, constraints: [], seed: 1 });
    const refined = refineSchedule({
      assignments: greedy,
      season,
      soldiers,
      constraints: [],
      seed: 1,
    });

    const days = eachDayInRange(season.startDate, season.endDate);
    const opDays = season.trainingEndDate
      ? days.filter((d) => d > season.trainingEndDate!)
      : days;

    for (const day of opDays) {
      const dateStr = dateToString(day);
      const driversOnBase = refined.filter(
        (a) =>
          dateToString(a.date) === dateStr &&
          a.isOnBase &&
          soldiers.find((s) => s.id === a.soldierProfileId)?.roles.includes("driver"),
      );
      expect(driversOnBase.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("reduces fairness variance on a biased input", () => {
    const startDate = new Date("2026-03-01T00:00:00.000Z");
    const endDate = new Date("2026-03-28T00:00:00.000Z");
    const season = buildSeason({
      dailyHeadcount: 3,
      avgDaysArmy: 7,
      startDate,
      endDate,
    });
    const soldiers = Array.from({ length: 9 }, () => buildSoldier());

    const biased = buildBiasedAssignments(soldiers, startDate, endDate, 3);
    const biasedVariance = computeVariance(biased, soldiers);

    const refined = refineSchedule({
      assignments: biased,
      season,
      soldiers,
      constraints: [],
      seed: 1,
    });

    const refinedVariance = computeVariance(refined, soldiers);

    expect(biasedVariance).toBeGreaterThan(5);
    expect(refinedVariance).toBeLessThan(biasedVariance);
  });

  it("respects hard max consecutive days", () => {
    const season = buildSeason({
      dailyHeadcount: 5,
      avgDaysArmy: 7,
      startDate: new Date("2026-03-01T00:00:00.000Z"),
      endDate: new Date("2026-04-11T00:00:00.000Z"),
    });
    const soldiers = Array.from({ length: 15 }, () => buildSoldier());
    const hardMax = 7 + 5;

    const greedy = generateSchedule({ season, soldiers, constraints: [], seed: 1 });
    const refined = refineSchedule({
      assignments: greedy,
      season,
      soldiers,
      constraints: [],
      seed: 1,
    });

    for (const soldier of soldiers) {
      const blocks = getBlockLengths(refined, soldier.id);
      for (const blockLen of blocks) {
        expect(blockLen).toBeLessThanOrEqual(hardMax);
      }
    }
  });

  it("produces different results with different seeds", () => {
    const season = buildSeason({
      dailyHeadcount: 5,
      avgDaysArmy: 7,
      startDate: new Date("2026-03-01T00:00:00.000Z"),
      endDate: new Date("2026-04-11T00:00:00.000Z"),
    });
    const soldiers = Array.from({ length: 15 }, () => buildSoldier());

    const greedy = generateSchedule({ season, soldiers, constraints: [], seed: 1 });

    const refined1 = refineSchedule({
      assignments: greedy,
      season,
      soldiers,
      constraints: [],
      seed: 100,
    });
    const refined2 = refineSchedule({
      assignments: greedy,
      season,
      soldiers,
      constraints: [],
      seed: 200,
    });

    const fingerprint = (assignments: typeof refined1) =>
      assignments
        .filter((a) => a.isOnBase)
        .map((a) => `${a.soldierProfileId}:${dateToString(a.date)}`)
        .sort()
        .join("|");

    expect(fingerprint(refined1)).not.toBe(fingerprint(refined2));
  });
});

function computeVariance(
  assignments: Array<{ soldierProfileId: string; isOnBase: boolean }>,
  soldiers: Array<{ id: string }>,
): number {
  const map = new Map<string, number>();
  for (const s of soldiers) map.set(s.id, 0);
  for (const a of assignments) {
    if (a.isOnBase) {
      map.set(a.soldierProfileId, (map.get(a.soldierProfileId) ?? 0) + 1);
    }
  }
  const counts = [...map.values()];
  return Math.max(...counts) - Math.min(...counts);
}

function buildBiasedAssignments(
  soldiers: Array<{ id: string }>,
  startDate: Date,
  endDate: Date,
  headcount: number,
): Array<{
  soldierProfileId: string;
  date: Date;
  isOnBase: boolean;
  isUnavailable: boolean;
  absentReason: null;
  replacedById: null;
  manualOverride: boolean;
}> {
  const days: Date[] = [];
  let current = new Date(startDate);
  while (current <= endDate) {
    days.push(new Date(current));
    current = addDays(current, 1);
  }

  const schedule: string[][] = [
    [soldiers[0].id, soldiers[1].id, soldiers[2].id],
    [soldiers[3].id, soldiers[4].id, soldiers[5].id],
    [soldiers[6].id, soldiers[7].id, soldiers[8].id],
    [soldiers[0].id, soldiers[1].id, soldiers[2].id],
  ];
  const blockSize = 7;

  const assignments: Array<{
    soldierProfileId: string;
    date: Date;
    isOnBase: boolean;
    isUnavailable: boolean;
    absentReason: null;
    replacedById: null;
    manualOverride: boolean;
  }> = [];

  for (let i = 0; i < days.length; i++) {
    const groupIdx = Math.min(Math.floor(i / blockSize), schedule.length - 1);
    const group = schedule[groupIdx];
    for (let j = 0; j < headcount && j < group.length; j++) {
      assignments.push({
        soldierProfileId: group[j],
        date: days[i],
        isOnBase: true,
        isUnavailable: false,
        absentReason: null,
        replacedById: null,
        manualOverride: false,
      });
    }
  }

  return assignments;
}

function countDaysPerSoldier(
  assignments: Array<{ soldierProfileId: string; isOnBase: boolean }>,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const a of assignments) {
    if (a.isOnBase) {
      map.set(a.soldierProfileId, (map.get(a.soldierProfileId) ?? 0) + 1);
    }
  }
  return map;
}

function getBlockLengths(
  assignments: Array<{ soldierProfileId: string; date: Date; isOnBase: boolean }>,
  soldierId: string,
): number[] {
  const dates = assignments
    .filter((a) => a.soldierProfileId === soldierId && a.isOnBase)
    .map((a) => a.date.getTime())
    .sort((a, b) => a - b);

  if (dates.length === 0) return [];

  const blocks: number[] = [];
  let blockLen = 1;
  for (let i = 1; i < dates.length; i++) {
    const diffDays = (dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24);
    if (diffDays === 1) {
      blockLen++;
    } else {
      blocks.push(blockLen);
      blockLen = 1;
    }
  }
  blocks.push(blockLen);
  return blocks;
}
