import { describe, it, expect } from "vitest";
import { suggestScheduleConfig } from "./schedule-suggester";
import { buildSeason } from "@/test/builders/season.builder";
import { buildSoldier } from "@/test/builders/soldier.builder";

describe("suggestScheduleConfig", () => {
  it("returns suggestions sorted by warning count ascending", () => {
    const season = buildSeason({
      dailyHeadcount: 8,
      startDate: new Date("2026-03-01T00:00:00.000Z"),
      endDate: new Date("2026-04-11T00:00:00.000Z"),
    });
    const soldiers = Array.from({ length: 16 }, () => buildSoldier());

    const suggestions = suggestScheduleConfig({
      season,
      soldiers,
      constraints: [],
    });

    for (let i = 1; i < suggestions.length; i++) {
      expect(suggestions[i].warningCount).toBeGreaterThanOrEqual(
        suggestions[i - 1].warningCount,
      );
    }
  });

  it("returns at most 5 suggestions", () => {
    const season = buildSeason({
      dailyHeadcount: 4,
      startDate: new Date("2026-03-01T00:00:00.000Z"),
      endDate: new Date("2026-03-28T00:00:00.000Z"),
    });
    const soldiers = Array.from({ length: 12 }, () => buildSoldier());

    const suggestions = suggestScheduleConfig({
      season,
      soldiers,
      constraints: [],
    });

    expect(suggestions.length).toBeLessThanOrEqual(5);
    expect(suggestions.length).toBeGreaterThan(0);
  });

  it("includes a label for each suggestion", () => {
    const season = buildSeason({
      dailyHeadcount: 4,
      startDate: new Date("2026-03-01T00:00:00.000Z"),
      endDate: new Date("2026-03-28T00:00:00.000Z"),
    });
    const soldiers = Array.from({ length: 12 }, () => buildSoldier());

    const suggestions = suggestScheduleConfig({
      season,
      soldiers,
      constraints: [],
    });

    for (const s of suggestions) {
      expect(s.label).toBeTruthy();
    }
  });

  it("always produces army >= home", () => {
    const season = buildSeason({
      dailyHeadcount: 8,
      startDate: new Date("2026-03-01T00:00:00.000Z"),
      endDate: new Date("2026-04-11T00:00:00.000Z"),
    });
    const soldiers = Array.from({ length: 30 }, () => buildSoldier());

    const suggestions = suggestScheduleConfig({
      season,
      soldiers,
      constraints: [],
    });

    for (const s of suggestions) {
      expect(s.avgDaysArmy).toBeGreaterThanOrEqual(s.avgDaysHome);
    }
  });

  it("produces zero or near-zero warnings when soldier pool is large enough", () => {
    const season = buildSeason({
      dailyHeadcount: 3,
      startDate: new Date("2026-03-01T00:00:00.000Z"),
      endDate: new Date("2026-03-28T00:00:00.000Z"),
    });
    const soldiers = Array.from({ length: 12 }, () => buildSoldier());

    const suggestions = suggestScheduleConfig({
      season,
      soldiers,
      constraints: [],
    });

    expect(suggestions[0].warningCount).toBeLessThanOrEqual(3);
  });

  it("ranks configs with fewer warnings higher even when constraints exist", () => {
    const soldiers = Array.from({ length: 16 }, () => buildSoldier());
    const constraints: { soldierProfileId: string; date: Date }[] = [];
    for (const s of soldiers.slice(0, 8)) {
      for (let d = 1; d <= 28; d += 5) {
        constraints.push({
          soldierProfileId: s.id,
          date: new Date(`2026-03-${String(d).padStart(2, "0")}T00:00:00.000Z`),
        });
      }
    }

    const season = buildSeason({
      dailyHeadcount: 8,
      startDate: new Date("2026-03-01T00:00:00.000Z"),
      endDate: new Date("2026-03-28T00:00:00.000Z"),
    });

    const suggestions = suggestScheduleConfig({
      season,
      soldiers,
      constraints,
    });

    for (let i = 1; i < suggestions.length; i++) {
      expect(suggestions[i].warningCount).toBeGreaterThanOrEqual(
        suggestions[i - 1].warningCount,
      );
    }
  });

  it("returns empty array when no soldiers", () => {
    const season = buildSeason({ dailyHeadcount: 4 });

    const suggestions = suggestScheduleConfig({
      season,
      soldiers: [],
      constraints: [],
    });

    expect(suggestions).toHaveLength(0);
  });
});
