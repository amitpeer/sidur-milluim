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
