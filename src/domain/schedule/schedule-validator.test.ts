import { describe, it, expect } from "vitest";
import { validateSchedule } from "./schedule-validator";
import { buildSoldier } from "@/test/builders/soldier.builder";
import { buildSeason } from "@/test/builders/season.builder";
import { dateToString } from "@/lib/date-utils";
import type { ScheduleAssignment } from "./schedule.types";

describe("validateSchedule", () => {
  it("returns no warnings for a valid schedule", () => {
    const season = buildSeason({
      dailyHeadcount: 2,
      startDate: new Date("2026-03-01T00:00:00.000Z"),
      endDate: new Date("2026-03-03T00:00:00.000Z"),
    });
    const soldiers = [buildSoldier(), buildSoldier(), buildSoldier()];
    const assignments: ScheduleAssignment[] = [];

    for (let d = 1; d <= 3; d++) {
      assignments.push(
        makeAssignment(soldiers[0].id, `2026-03-0${d}`),
        makeAssignment(soldiers[1].id, `2026-03-0${d}`),
      );
    }

    const warnings = validateSchedule({ season, soldiers, assignments });

    expect(warnings).toHaveLength(0);
  });

  it("warns about headcount below target", () => {
    const season = buildSeason({
      dailyHeadcount: 3,
      startDate: new Date("2026-03-01T00:00:00.000Z"),
      endDate: new Date("2026-03-01T00:00:00.000Z"),
    });
    const soldiers = [buildSoldier(), buildSoldier()];
    const assignments: ScheduleAssignment[] = [
      makeAssignment(soldiers[0].id, "2026-03-01"),
    ];

    const warnings = validateSchedule({ season, soldiers, assignments });

    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0].type).toBe("headcount_low");
  });

  it("warns about missing role coverage", () => {
    const season = buildSeason({
      dailyHeadcount: 2,
      roleMinimums: { commander: 1 },
      startDate: new Date("2026-03-01T00:00:00.000Z"),
      endDate: new Date("2026-03-01T00:00:00.000Z"),
    });
    const soldiers = [
      buildSoldier({ roles: ["driver"] }),
      buildSoldier({ roles: ["driver"] }),
    ];
    const assignments: ScheduleAssignment[] = [
      makeAssignment(soldiers[0].id, "2026-03-01"),
      makeAssignment(soldiers[1].id, "2026-03-01"),
    ];

    const warnings = validateSchedule({ season, soldiers, assignments });

    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0].type).toBe("role_missing");
  });

  it("produces no warnings for training days even with low headcount", () => {
    const season = buildSeason({
      dailyHeadcount: 3,
      trainingEndDate: new Date("2026-03-02T00:00:00.000Z"),
      startDate: new Date("2026-03-01T00:00:00.000Z"),
      endDate: new Date("2026-03-03T00:00:00.000Z"),
    });
    const soldiers = [buildSoldier(), buildSoldier(), buildSoldier()];
    const assignments: ScheduleAssignment[] = [
      makeAssignment(soldiers[0].id, "2026-03-01"),
      makeAssignment(soldiers[0].id, "2026-03-02"),
      makeAssignment(soldiers[0].id, "2026-03-03"),
      makeAssignment(soldiers[1].id, "2026-03-03"),
      makeAssignment(soldiers[2].id, "2026-03-03"),
    ];

    const warnings = validateSchedule({ season, soldiers, assignments });

    expect(warnings).toHaveLength(0);
  });

  it("still validates operational days normally after training ends", () => {
    const season = buildSeason({
      dailyHeadcount: 3,
      trainingEndDate: new Date("2026-03-01T00:00:00.000Z"),
      startDate: new Date("2026-03-01T00:00:00.000Z"),
      endDate: new Date("2026-03-02T00:00:00.000Z"),
    });
    const soldiers = [buildSoldier(), buildSoldier()];
    const assignments: ScheduleAssignment[] = [
      makeAssignment(soldiers[0].id, "2026-03-01"),
      makeAssignment(soldiers[1].id, "2026-03-01"),
      makeAssignment(soldiers[0].id, "2026-03-02"),
    ];

    const warnings = validateSchedule({ season, soldiers, assignments });

    const operationalWarnings = warnings.filter(
      (w) => dateToString(w.date) === "2026-03-02",
    );
    expect(operationalWarnings.length).toBeGreaterThan(0);
    expect(operationalWarnings[0].type).toBe("headcount_low");
  });

  it("does not warn when role minimums are met", () => {
    const season = buildSeason({
      dailyHeadcount: 2,
      roleMinimums: { commander: 1 },
      startDate: new Date("2026-03-01T00:00:00.000Z"),
      endDate: new Date("2026-03-01T00:00:00.000Z"),
    });
    const soldiers = [
      buildSoldier({ roles: ["commander"] }),
      buildSoldier({ roles: ["driver"] }),
    ];
    const assignments: ScheduleAssignment[] = [
      makeAssignment(soldiers[0].id, "2026-03-01"),
      makeAssignment(soldiers[1].id, "2026-03-01"),
    ];

    const warnings = validateSchedule({ season, soldiers, assignments });

    expect(warnings).toHaveLength(0);
  });
});

function makeAssignment(
  soldierProfileId: string,
  dateStr: string,
): ScheduleAssignment {
  return {
    soldierProfileId,
    date: new Date(dateStr + "T00:00:00.000Z"),
    isOnBase: true,
    isUnavailable: false,
    replacedById: null,
    manualOverride: false,
  };
}
