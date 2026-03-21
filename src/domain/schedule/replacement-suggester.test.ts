import { describe, it, expect } from "vitest";
import { suggestReplacements } from "./replacement-suggester";
import { buildSoldier } from "@/test/builders/soldier.builder";
import type { ScheduleAssignment } from "./schedule.types";

describe("suggestReplacements", () => {
  it("suggests available soldiers sorted by fewest assigned days", () => {
    const soldiers = [
      buildSoldier({ id: "s1" }),
      buildSoldier({ id: "s2" }),
      buildSoldier({ id: "s3" }),
    ];
    const assignments: ScheduleAssignment[] = [
      makeAssignment("s1", "2026-03-01"),
      makeAssignment("s1", "2026-03-02"),
      makeAssignment("s2", "2026-03-02"),
    ];

    const suggestions = suggestReplacements({
      unavailableSoldierId: "s1",
      date: new Date("2026-03-01T00:00:00.000Z"),
      soldiers,
      assignments,
      constraints: [],
    });

    expect(suggestions[0].soldierId).toBe("s3");
    expect(suggestions[1].soldierId).toBe("s2");
  });

  it("excludes soldiers with constraints on the date", () => {
    const soldiers = [
      buildSoldier({ id: "s1" }),
      buildSoldier({ id: "s2" }),
      buildSoldier({ id: "s3" }),
    ];
    const assignments: ScheduleAssignment[] = [
      makeAssignment("s1", "2026-03-01"),
    ];
    const constraints = [
      {
        soldierProfileId: "s3",
        date: new Date("2026-03-01T00:00:00.000Z"),
      },
    ];

    const suggestions = suggestReplacements({
      unavailableSoldierId: "s1",
      date: new Date("2026-03-01T00:00:00.000Z"),
      soldiers,
      assignments,
      constraints,
    });

    expect(suggestions.map((s) => s.soldierId)).not.toContain("s3");
  });

  it("prefers soldiers with the needed role", () => {
    const soldiers = [
      buildSoldier({ id: "s1", roles: ["commander"] }),
      buildSoldier({ id: "s2", roles: ["driver"] }),
      buildSoldier({ id: "s3", roles: ["commander"] }),
    ];
    const assignments: ScheduleAssignment[] = [
      makeAssignment("s1", "2026-03-01"),
    ];

    const suggestions = suggestReplacements({
      unavailableSoldierId: "s1",
      date: new Date("2026-03-01T00:00:00.000Z"),
      soldiers,
      assignments,
      constraints: [],
      requiredRoles: ["commander"],
    });

    expect(suggestions[0].soldierId).toBe("s3");
  });

  it("excludes soldiers already assigned on that day", () => {
    const soldiers = [
      buildSoldier({ id: "s1" }),
      buildSoldier({ id: "s2" }),
      buildSoldier({ id: "s3" }),
    ];
    const assignments: ScheduleAssignment[] = [
      makeAssignment("s1", "2026-03-01"),
      makeAssignment("s2", "2026-03-01"),
    ];

    const suggestions = suggestReplacements({
      unavailableSoldierId: "s1",
      date: new Date("2026-03-01T00:00:00.000Z"),
      soldiers,
      assignments,
      constraints: [],
    });

    expect(suggestions.map((s) => s.soldierId)).not.toContain("s2");
  });

  it("excludes soldiers who would exceed maxConsecutiveDays", () => {
    const soldiers = [
      buildSoldier({ id: "s1" }),
      buildSoldier({ id: "s2" }),
      buildSoldier({ id: "s3" }),
    ];
    const assignments: ScheduleAssignment[] = [
      makeAssignment("s2", "2026-03-01"),
      makeAssignment("s2", "2026-03-02"),
      makeAssignment("s2", "2026-03-03"),
    ];

    const suggestions = suggestReplacements({
      unavailableSoldierId: "s1",
      date: new Date("2026-03-04T00:00:00.000Z"),
      soldiers,
      assignments,
      constraints: [],
      maxConsecutiveDays: 3,
    });

    expect(suggestions.map((s) => s.soldierId)).not.toContain("s2");
    expect(suggestions.map((s) => s.soldierId)).toContain("s3");
  });

  it("does not filter by maxConsecutiveDays when not set", () => {
    const soldiers = [
      buildSoldier({ id: "s1" }),
      buildSoldier({ id: "s2" }),
    ];
    const assignments: ScheduleAssignment[] = [
      makeAssignment("s2", "2026-03-01"),
      makeAssignment("s2", "2026-03-02"),
      makeAssignment("s2", "2026-03-03"),
    ];

    const suggestions = suggestReplacements({
      unavailableSoldierId: "s1",
      date: new Date("2026-03-04T00:00:00.000Z"),
      soldiers,
      assignments,
      constraints: [],
    });

    expect(suggestions.map((s) => s.soldierId)).toContain("s2");
  });

  it("prefers soldiers with adjacent assignments when minConsecutiveDays is set", () => {
    const soldiers = [
      buildSoldier({ id: "s1" }),
      buildSoldier({ id: "s2" }),
      buildSoldier({ id: "s3" }),
    ];
    const assignments: ScheduleAssignment[] = [
      makeAssignment("s2", "2026-03-01"),
    ];

    const suggestions = suggestReplacements({
      unavailableSoldierId: "s1",
      date: new Date("2026-03-02T00:00:00.000Z"),
      soldiers,
      assignments,
      constraints: [],
      minConsecutiveDays: 3,
    });

    expect(suggestions[0].soldierId).toBe("s2");
  });

  it("prefers soldiers from same city when cityGroupingEnabled is true", () => {
    const soldiers = [
      buildSoldier({ id: "s1", city: "תל אביב" }),
      buildSoldier({ id: "s2", city: "תל אביב" }),
      buildSoldier({ id: "s3", city: "חיפה" }),
      buildSoldier({ id: "s4", city: "תל אביב" }),
    ];
    const assignments: ScheduleAssignment[] = [
      makeAssignment("s4", "2026-03-01"),
      makeAssignment("s2", "2026-03-02"),
    ];

    const suggestions = suggestReplacements({
      unavailableSoldierId: "s1",
      date: new Date("2026-03-01T00:00:00.000Z"),
      soldiers,
      assignments,
      constraints: [],
      cityGroupingEnabled: true,
    });

    const s2Index = suggestions.findIndex((s) => s.soldierId === "s2");
    const s3Index = suggestions.findIndex((s) => s.soldierId === "s3");
    expect(s2Index).toBeLessThan(s3Index);
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
    absentReason: null,
    replacedById: null,
    manualOverride: false,
  };
}
