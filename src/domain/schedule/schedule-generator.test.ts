import { describe, it, expect } from "vitest";
import { generateSchedule } from "./schedule-generator";
import { buildSoldier } from "@/test/builders/soldier.builder";
import { buildSeason } from "@/test/builders/season.builder";
import { daysBetween, dateToString, eachDayInRange } from "@/lib/date-utils";

describe("generateSchedule", () => {
  it("assigns exactly the required headcount per day when possible", () => {
    const season = buildSeason({ dailyHeadcount: 3 });
    const soldiers = Array.from({ length: 10 }, () => buildSoldier());

    const assignments = generateSchedule({ season, soldiers, constraints: [] });

    const days = eachDayInRange(season.startDate, season.endDate);
    for (const day of days) {
      const dateStr = dateToString(day);
      const onBase = assignments.filter(
        (a) => dateToString(a.date) === dateStr && a.isOnBase,
      );
      expect(onBase.length).toBe(3);
    }
  });

  it("does not assign soldiers on their constraint days", () => {
    const season = buildSeason({
      dailyHeadcount: 3,
      startDate: new Date("2026-03-01T00:00:00.000Z"),
      endDate: new Date("2026-03-14T00:00:00.000Z"),
    });
    const soldiers = Array.from({ length: 10 }, () => buildSoldier());
    const constraints = [
      {
        soldierProfileId: soldiers[0].id,
        date: new Date("2026-03-05T00:00:00.000Z"),
      },
      {
        soldierProfileId: soldiers[0].id,
        date: new Date("2026-03-06T00:00:00.000Z"),
      },
    ];

    const assignments = generateSchedule({ season, soldiers, constraints });

    const soldier0OnMarch5 = assignments.find(
      (a) =>
        a.soldierProfileId === soldiers[0].id &&
        dateToString(a.date) === "2026-03-05" &&
        a.isOnBase,
    );
    expect(soldier0OnMarch5).toBeUndefined();
  });

  it("gives far soldiers longer blocks", () => {
    const season = buildSeason({
      dailyHeadcount: 3,
      startDate: new Date("2026-03-01T00:00:00.000Z"),
      endDate: new Date("2026-04-11T00:00:00.000Z"),
    });
    const nearSoldier = buildSoldier({ isFarAway: false });
    const farSoldier = buildSoldier({ isFarAway: true });
    const soldiers = [
      nearSoldier,
      farSoldier,
      ...Array.from({ length: 8 }, () => buildSoldier()),
    ];

    const assignments = generateSchedule({ season, soldiers, constraints: [] });

    const farBlocks = getBlockLengths(assignments, farSoldier.id);
    const nearBlocks = getBlockLengths(assignments, nearSoldier.id);

    if (farBlocks.length > 0 && nearBlocks.length > 0) {
      const avgFarBlock =
        farBlocks.reduce((a, b) => a + b, 0) / farBlocks.length;
      const avgNearBlock =
        nearBlocks.reduce((a, b) => a + b, 0) / nearBlocks.length;
      expect(avgFarBlock).toBeGreaterThanOrEqual(avgNearBlock);
    }
  });

  it("distributes days fairly across soldiers", () => {
    const season = buildSeason({
      dailyHeadcount: 5,
      startDate: new Date("2026-03-01T00:00:00.000Z"),
      endDate: new Date("2026-04-11T00:00:00.000Z"),
    });
    const soldiers = Array.from({ length: 15 }, () => buildSoldier());

    const assignments = generateSchedule({ season, soldiers, constraints: [] });

    const totalDays = daysBetween(season.startDate, season.endDate) + 1;
    const expectedPerSoldier = (totalDays * season.dailyHeadcount) / soldiers.length;

    const daysPerSoldier = new Map<string, number>();
    for (const a of assignments) {
      if (a.isOnBase) {
        daysPerSoldier.set(
          a.soldierProfileId,
          (daysPerSoldier.get(a.soldierProfileId) ?? 0) + 1,
        );
      }
    }

    for (const [, days] of daysPerSoldier) {
      expect(days).toBeGreaterThan(expectedPerSoldier * 0.5);
      expect(days).toBeLessThan(expectedPerSoldier * 1.5);
    }
  });

  it("handles a season with exactly enough soldiers for headcount", () => {
    const season = buildSeason({
      dailyHeadcount: 5,
      startDate: new Date("2026-03-01T00:00:00.000Z"),
      endDate: new Date("2026-03-07T00:00:00.000Z"),
    });
    const soldiers = Array.from({ length: 5 }, () => buildSoldier());

    const assignments = generateSchedule({ season, soldiers, constraints: [] });

    const days = eachDayInRange(season.startDate, season.endDate);
    for (const day of days) {
      const dateStr = dateToString(day);
      const onBase = assignments.filter(
        (a) => dateToString(a.date) === dateStr && a.isOnBase,
      );
      expect(onBase.length).toBe(5);
    }
  });

  it("assigns all soldiers on base during training days", () => {
    const season = buildSeason({
      dailyHeadcount: 3,
      startDate: new Date("2026-03-01T00:00:00.000Z"),
      endDate: new Date("2026-03-14T00:00:00.000Z"),
      trainingEndDate: new Date("2026-03-03T00:00:00.000Z"),
    });
    const soldiers = Array.from({ length: 10 }, () => buildSoldier());

    const assignments = generateSchedule({ season, soldiers, constraints: [] });

    const trainingDates = ["2026-03-01", "2026-03-02", "2026-03-03"];
    for (const dateStr of trainingDates) {
      const onBase = assignments.filter(
        (a) => dateToString(a.date) === dateStr && a.isOnBase,
      );
      expect(onBase.length).toBe(10);
    }
  });

  it("respects day-off constraints during training days", () => {
    const season = buildSeason({
      dailyHeadcount: 3,
      startDate: new Date("2026-03-01T00:00:00.000Z"),
      endDate: new Date("2026-03-14T00:00:00.000Z"),
      trainingEndDate: new Date("2026-03-03T00:00:00.000Z"),
    });
    const soldiers = Array.from({ length: 10 }, () => buildSoldier());
    const constraints = [
      { soldierProfileId: soldiers[0].id, date: new Date("2026-03-02T00:00:00.000Z") },
    ];

    const assignments = generateSchedule({ season, soldiers, constraints });

    const soldier0OnMarch2 = assignments.find(
      (a) =>
        a.soldierProfileId === soldiers[0].id &&
        dateToString(a.date) === "2026-03-02" &&
        a.isOnBase,
    );
    expect(soldier0OnMarch2).toBeUndefined();

    const othersOnMarch2 = assignments.filter(
      (a) => dateToString(a.date) === "2026-03-02" && a.isOnBase,
    );
    expect(othersOnMarch2.length).toBe(9);
  });

  it("applies normal headcount rules after training ends", () => {
    const season = buildSeason({
      dailyHeadcount: 3,
      startDate: new Date("2026-03-01T00:00:00.000Z"),
      endDate: new Date("2026-03-07T00:00:00.000Z"),
      trainingEndDate: new Date("2026-03-02T00:00:00.000Z"),
    });
    const soldiers = Array.from({ length: 10 }, () => buildSoldier());

    const assignments = generateSchedule({ season, soldiers, constraints: [] });

    const operationalDates = ["2026-03-03", "2026-03-04", "2026-03-05", "2026-03-06", "2026-03-07"];
    for (const dateStr of operationalDates) {
      const onBase = assignments.filter(
        (a) => dateToString(a.date) === dateStr && a.isOnBase,
      );
      expect(onBase.length).toBe(3);
    }
  });

  it("prefers scheduling soldiers from the same city in overlapping blocks", () => {
    const season = buildSeason({
      dailyHeadcount: 3,
      startDate: new Date("2026-03-01T00:00:00.000Z"),
      endDate: new Date("2026-03-14T00:00:00.000Z"),
      cityGroupingEnabled: true,
    });
    const tlvSoldiers = Array.from({ length: 4 }, (_, i) =>
      buildSoldier({ city: "תל אביב", id: `tlv-${i}` }),
    );
    const haifaSoldiers = Array.from({ length: 4 }, (_, i) =>
      buildSoldier({ city: "חיפה", id: `haifa-${i}` }),
    );
    const otherSoldiers = Array.from({ length: 4 }, (_, i) =>
      buildSoldier({ city: "באר שבע", id: `other-${i}` }),
    );
    const soldiers = [...tlvSoldiers, ...haifaSoldiers, ...otherSoldiers];

    const assignments = generateSchedule({ season, soldiers, constraints: [] });

    const days = eachDayInRange(season.startDate, season.endDate);
    let sameCityPairs = 0;
    let totalPairs = 0;

    for (const day of days) {
      const dateStr = dateToString(day);
      const onBase = assignments
        .filter((a) => dateToString(a.date) === dateStr && a.isOnBase)
        .map((a) => soldiers.find((s) => s.id === a.soldierProfileId)?.city);

      for (let i = 0; i < onBase.length; i++) {
        for (let j = i + 1; j < onBase.length; j++) {
          totalPairs++;
          if (onBase[i] && onBase[j] && onBase[i] === onBase[j]) {
            sameCityPairs++;
          }
        }
      }
    }

    const sameCityRatio = totalPairs > 0 ? sameCityPairs / totalPairs : 0;
    expect(sameCityRatio).toBeGreaterThan(0.2);
  });

  it("still meets headcount and role coverage even with city grouping", () => {
    const season = buildSeason({
      dailyHeadcount: 4,
      roleMinimums: { commander: 1 },
      startDate: new Date("2026-03-01T00:00:00.000Z"),
      endDate: new Date("2026-03-14T00:00:00.000Z"),
      cityGroupingEnabled: true,
    });
    const soldiers = [
      buildSoldier({ city: "תל אביב", roles: ["commander"] }),
      buildSoldier({ city: "תל אביב", roles: ["commander"] }),
      ...Array.from({ length: 4 }, () =>
        buildSoldier({ city: "חיפה" }),
      ),
      ...Array.from({ length: 4 }, () =>
        buildSoldier({ city: "באר שבע" }),
      ),
    ];

    const assignments = generateSchedule({ season, soldiers, constraints: [] });

    const days = eachDayInRange(season.startDate, season.endDate);
    for (const day of days) {
      const dateStr = dateToString(day);
      const onBase = assignments.filter(
        (a) => dateToString(a.date) === dateStr && a.isOnBase,
      );
      expect(onBase.length).toBe(4);

      const commandersOnBase = onBase.filter((a) =>
        soldiers.find((s) => s.id === a.soldierProfileId)?.roles.includes("commander"),
      );
      expect(commandersOnBase.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("does not assign a soldier more than maxConsecutiveDays in a row", () => {
    const season = buildSeason({
      maxConsecutiveDays: 3,
      dailyHeadcount: 3,
      startDate: new Date("2026-03-01T00:00:00.000Z"),
      endDate: new Date("2026-03-14T00:00:00.000Z"),
    });
    const soldiers = Array.from({ length: 10 }, () => buildSoldier());

    const assignments = generateSchedule({ season, soldiers, constraints: [] });

    for (const soldier of soldiers) {
      const blocks = getBlockLengths(assignments, soldier.id);
      for (const blockLen of blocks) {
        expect(blockLen).toBeLessThanOrEqual(3);
      }
    }
  });

  it("creates blocks of at least minConsecutiveDays for most soldiers", () => {
    const season = buildSeason({
      minConsecutiveDays: 4,
      dailyHeadcount: 3,
      startDate: new Date("2026-03-01T00:00:00.000Z"),
      endDate: new Date("2026-03-28T00:00:00.000Z"),
    });
    const soldiers = Array.from({ length: 10 }, () => buildSoldier());

    const assignments = generateSchedule({ season, soldiers, constraints: [] });

    let totalBlocks = 0;
    let blocksAtMin = 0;
    for (const soldier of soldiers) {
      const blocks = getBlockLengths(assignments, soldier.id);
      totalBlocks += blocks.length;
      blocksAtMin += blocks.filter((b) => b >= 4).length;
    }
    expect(blocksAtMin / totalBlocks).toBeGreaterThan(0.6);
  });

  it("prefers soldiers with adjacent assignments in fillUnderfilledDays", () => {
    const season = buildSeason({
      minConsecutiveDays: 3,
      dailyHeadcount: 2,
      startDate: new Date("2026-03-01T00:00:00.000Z"),
      endDate: new Date("2026-03-14T00:00:00.000Z"),
    });
    const soldiers = Array.from({ length: 8 }, () => buildSoldier());

    const assignments = generateSchedule({ season, soldiers, constraints: [] });

    for (const soldier of soldiers) {
      const blocks = getBlockLengths(assignments, soldier.id);
      const isolatedStints = blocks.filter((b) => b < 3);
      expect(isolatedStints.length).toBeLessThanOrEqual(1);
    }
  });

  it("still meets headcount even when minConsecutiveDays cannot be satisfied", () => {
    const season = buildSeason({
      minConsecutiveDays: 5,
      dailyHeadcount: 3,
      startDate: new Date("2026-03-01T00:00:00.000Z"),
      endDate: new Date("2026-03-14T00:00:00.000Z"),
    });
    const soldiers = Array.from({ length: 10 }, () => buildSoldier());

    const assignments = generateSchedule({ season, soldiers, constraints: [] });

    const days = eachDayInRange(season.startDate, season.endDate);
    for (const day of days) {
      const dateStr = dateToString(day);
      const onBase = assignments.filter(
        (a) => dateToString(a.date) === dateStr && a.isOnBase,
      );
      expect(onBase.length).toBe(3);
    }
  });

  it("respects both minConsecutiveDays and maxConsecutiveDays together", () => {
    const season = buildSeason({
      minConsecutiveDays: 4,
      maxConsecutiveDays: 6,
      dailyHeadcount: 3,
      startDate: new Date("2026-03-01T00:00:00.000Z"),
      endDate: new Date("2026-03-28T00:00:00.000Z"),
    });
    const soldiers = Array.from({ length: 10 }, () => buildSoldier());

    const assignments = generateSchedule({ season, soldiers, constraints: [] });

    for (const soldier of soldiers) {
      const blocks = getBlockLengths(assignments, soldier.id);
      for (const blockLen of blocks) {
        expect(blockLen).toBeLessThanOrEqual(6);
      }
    }

    const days = eachDayInRange(season.startDate, season.endDate);
    for (const day of days) {
      const dateStr = dateToString(day);
      const onBase = assignments.filter(
        (a) => dateToString(a.date) === dateStr && a.isOnBase,
      );
      expect(onBase.length).toBe(3);
    }
  });

  it("respects role minimums when specified", () => {
    const season = buildSeason({
      dailyHeadcount: 4,
      roleMinimums: { commander: 1 },
      startDate: new Date("2026-03-01T00:00:00.000Z"),
      endDate: new Date("2026-03-14T00:00:00.000Z"),
    });
    const soldiers = [
      buildSoldier({ roles: ["commander"] }),
      buildSoldier({ roles: ["commander"] }),
      ...Array.from({ length: 8 }, () => buildSoldier()),
    ];

    const assignments = generateSchedule({ season, soldiers, constraints: [] });

    const days = eachDayInRange(season.startDate, season.endDate);
    for (const day of days) {
      const dateStr = dateToString(day);
      const commandersOnBase = assignments.filter(
        (a) =>
          dateToString(a.date) === dateStr &&
          a.isOnBase &&
          soldiers.find((s) => s.id === a.soldierProfileId)?.roles.includes("commander"),
      );
      expect(commandersOnBase.length).toBeGreaterThanOrEqual(1);
    }
  });
});

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
