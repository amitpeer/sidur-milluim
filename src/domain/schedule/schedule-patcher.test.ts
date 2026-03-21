import { describe, it, expect } from "vitest";
import { patchSchedule } from "./schedule-patcher";
import { DayOffConstraintChecker } from "./day-off-constraint-checker";
import { buildSoldier } from "@/test/builders/soldier.builder";
import { buildSeason } from "@/test/builders/season.builder";
import { buildAssignment } from "@/test/builders/assignment.builder";
import type { ConstraintChecker } from "./constraint-checker";
import type { ScheduleAssignment } from "./schedule.types";

function onBaseSoldierIds(
  assignments: readonly ScheduleAssignment[],
  dateStr: string,
): string[] {
  return assignments
    .filter(
      (a) =>
        a.isOnBase && a.date.toISOString().startsWith(dateStr),
    )
    .map((a) => a.soldierProfileId)
    .sort();
}

describe("patchSchedule", () => {
  describe("phase 1: remove deleted soldiers", () => {
    it("removes assignments for soldiers no longer in the roster", () => {
      const s1 = buildSoldier({ id: "s1" });
      const s2 = buildSoldier({ id: "s2" });
      const season = buildSeason({
        startDate: new Date("2026-03-01T00:00:00.000Z"),
        endDate: new Date("2026-03-02T00:00:00.000Z"),
        dailyHeadcount: 1,
      });
      const assignments = [
        buildAssignment({ soldierProfileId: "s1", dateStr: "2026-03-01" }),
        buildAssignment({ soldierProfileId: "s2", dateStr: "2026-03-01" }),
        buildAssignment({ soldierProfileId: "removed-soldier", dateStr: "2026-03-01" }),
      ];

      const result = patchSchedule({
        assignments,
        constraintCheckers: [],
        soldiers: [s1, s2],
        season,
      });

      const ids = onBaseSoldierIds(result.assignments, "2026-03-01");
      expect(ids).not.toContain("removed-soldier");
      expect(ids).toContain("s1");
      expect(ids).toContain("s2");
      expect(result.changeCount).toBeGreaterThan(0);
    });
  });

  describe("phase 2: remove constraint violations", () => {
    it("removes on-base assignments that violate a day-off constraint", () => {
      const s1 = buildSoldier({ id: "s1" });
      const s2 = buildSoldier({ id: "s2" });
      const s3 = buildSoldier({ id: "s3" });
      const season = buildSeason({
        startDate: new Date("2026-03-01T00:00:00.000Z"),
        endDate: new Date("2026-03-01T00:00:00.000Z"),
        dailyHeadcount: 1,
      });
      const assignments = [
        buildAssignment({ soldierProfileId: "s1", dateStr: "2026-03-01" }),
        buildAssignment({ soldierProfileId: "s2", dateStr: "2026-03-01" }),
      ];
      const checker = new DayOffConstraintChecker([
        { soldierProfileId: "s1", date: new Date("2026-03-01T00:00:00.000Z") },
      ]);

      const result = patchSchedule({
        assignments,
        constraintCheckers: [checker],
        soldiers: [s1, s2, s3],
        season,
      });

      const ids = onBaseSoldierIds(result.assignments, "2026-03-01");
      expect(ids).not.toContain("s1");
      expect(result.changeCount).toBeGreaterThan(0);
    });

    it("respects a custom constraint checker implementation", () => {
      const s1 = buildSoldier({ id: "s1" });
      const s2 = buildSoldier({ id: "s2" });
      const season = buildSeason({
        startDate: new Date("2026-03-01T00:00:00.000Z"),
        endDate: new Date("2026-03-01T00:00:00.000Z"),
        dailyHeadcount: 2,
      });
      const assignments = [
        buildAssignment({ soldierProfileId: "s1", dateStr: "2026-03-01" }),
        buildAssignment({ soldierProfileId: "s2", dateStr: "2026-03-01" }),
      ];

      const customChecker: ConstraintChecker = {
        findViolations(onBase) {
          return onBase.filter((a) => a.soldierProfileId === "s2");
        },
        isBlocked(soldierId) {
          return soldierId === "s2";
        },
      };

      const result = patchSchedule({
        assignments,
        constraintCheckers: [customChecker],
        soldiers: [s1, s2],
        season,
      });

      const ids = onBaseSoldierIds(result.assignments, "2026-03-01");
      expect(ids).not.toContain("s2");
    });

    it("removes sick/course assignments that violate a day-off constraint", () => {
      const s1 = buildSoldier({ id: "s1" });
      const s2 = buildSoldier({ id: "s2" });
      const season = buildSeason({
        startDate: new Date("2026-03-01T00:00:00.000Z"),
        endDate: new Date("2026-03-01T00:00:00.000Z"),
        dailyHeadcount: 1,
      });
      const assignments = [
        buildAssignment({ soldierProfileId: "s1", dateStr: "2026-03-01", isOnBase: false, absentReason: "sick" }),
        buildAssignment({ soldierProfileId: "s2", dateStr: "2026-03-01" }),
      ];
      const checker = new DayOffConstraintChecker([
        { soldierProfileId: "s1", date: new Date("2026-03-01T00:00:00.000Z") },
      ]);

      const result = patchSchedule({
        assignments,
        constraintCheckers: [checker],
        soldiers: [s1, s2],
        season,
      });

      const s1Assignments = result.assignments.filter(
        (a) => a.soldierProfileId === "s1" && a.date.toISOString().startsWith("2026-03-01"),
      );
      expect(s1Assignments).toHaveLength(0);
    });
  });

  describe("phase 4: fill understaffed days", () => {
    it("adds soldiers to reach daily headcount", () => {
      const soldiers = [
        buildSoldier({ id: "s1" }),
        buildSoldier({ id: "s2" }),
        buildSoldier({ id: "s3" }),
      ];
      const season = buildSeason({
        startDate: new Date("2026-03-01T00:00:00.000Z"),
        endDate: new Date("2026-03-01T00:00:00.000Z"),
        dailyHeadcount: 2,
      });
      const assignments = [
        buildAssignment({ soldierProfileId: "s1", dateStr: "2026-03-01" }),
      ];

      const result = patchSchedule({
        assignments,
        constraintCheckers: [],
        soldiers,
        season,
      });

      const ids = onBaseSoldierIds(result.assignments, "2026-03-01");
      expect(ids).toHaveLength(2);
      expect(ids).toContain("s1");
    });

    it("prefers soldiers with fewer assigned days (fairness)", () => {
      const soldiers = [
        buildSoldier({ id: "s1" }),
        buildSoldier({ id: "s2" }),
        buildSoldier({ id: "s3" }),
      ];
      const season = buildSeason({
        startDate: new Date("2026-03-01T00:00:00.000Z"),
        endDate: new Date("2026-03-02T00:00:00.000Z"),
        dailyHeadcount: 1,
      });
      const assignments = [
        buildAssignment({ soldierProfileId: "s1", dateStr: "2026-03-01" }),
        buildAssignment({ soldierProfileId: "s2", dateStr: "2026-03-01", isOnBase: false }),
      ];

      const result = patchSchedule({
        assignments,
        constraintCheckers: [],
        soldiers,
        season,
      });

      const day2Ids = onBaseSoldierIds(result.assignments, "2026-03-02");
      expect(day2Ids).toHaveLength(1);
      expect(["s2", "s3"]).toContain(day2Ids[0]);
    });

    it("does not assign soldiers blocked by a constraint checker", () => {
      const soldiers = [
        buildSoldier({ id: "s1" }),
        buildSoldier({ id: "s2" }),
      ];
      const season = buildSeason({
        startDate: new Date("2026-03-01T00:00:00.000Z"),
        endDate: new Date("2026-03-01T00:00:00.000Z"),
        dailyHeadcount: 2,
      });
      const checker = new DayOffConstraintChecker([
        { soldierProfileId: "s2", date: new Date("2026-03-01T00:00:00.000Z") },
      ]);

      const result = patchSchedule({
        assignments: [
          buildAssignment({ soldierProfileId: "s1", dateStr: "2026-03-01" }),
        ],
        constraintCheckers: [checker],
        soldiers,
        season,
      });

      const ids = onBaseSoldierIds(result.assignments, "2026-03-01");
      expect(ids).not.toContain("s2");
    });

    it("picks new soldiers first since they have 0 assigned days", () => {
      const soldiers = [
        buildSoldier({ id: "s1" }),
        buildSoldier({ id: "s2" }),
        buildSoldier({ id: "new-soldier" }),
      ];
      const season = buildSeason({
        startDate: new Date("2026-03-01T00:00:00.000Z"),
        endDate: new Date("2026-03-02T00:00:00.000Z"),
        dailyHeadcount: 2,
      });
      const assignments = [
        buildAssignment({ soldierProfileId: "s1", dateStr: "2026-03-01" }),
        buildAssignment({ soldierProfileId: "s2", dateStr: "2026-03-01" }),
        buildAssignment({ soldierProfileId: "s1", dateStr: "2026-03-02" }),
      ];

      const result = patchSchedule({
        assignments,
        constraintCheckers: [],
        soldiers,
        season,
      });

      const newSoldierOnBase = result.assignments.filter(
        (a) => a.soldierProfileId === "new-soldier" && a.isOnBase,
      ).length;
      expect(newSoldierOnBase).toBeGreaterThan(0);
    });
  });

  describe("phase 5: fix role coverage", () => {
    it("adds a role-holder when below minimum", () => {
      const soldiers = [
        buildSoldier({ id: "s1", roles: [] }),
        buildSoldier({ id: "s2", roles: ["driver"] }),
      ];
      const season = buildSeason({
        startDate: new Date("2026-03-01T00:00:00.000Z"),
        endDate: new Date("2026-03-01T00:00:00.000Z"),
        dailyHeadcount: 2,
        roleMinimums: { driver: 1 },
      });
      const assignments = [
        buildAssignment({ soldierProfileId: "s1", dateStr: "2026-03-01" }),
      ];

      const result = patchSchedule({
        assignments,
        constraintCheckers: [],
        soldiers,
        season,
      });

      const ids = onBaseSoldierIds(result.assignments, "2026-03-01");
      expect(ids).toContain("s2");
    });

    it("swaps a non-role soldier for a role-holder when at headcount", () => {
      const soldiers = [
        buildSoldier({ id: "s1", roles: [] }),
        buildSoldier({ id: "s2", roles: [] }),
        buildSoldier({ id: "s3", roles: ["driver"] }),
      ];
      const season = buildSeason({
        startDate: new Date("2026-03-01T00:00:00.000Z"),
        endDate: new Date("2026-03-01T00:00:00.000Z"),
        dailyHeadcount: 2,
        roleMinimums: { driver: 1 },
      });
      const assignments = [
        buildAssignment({ soldierProfileId: "s1", dateStr: "2026-03-01" }),
        buildAssignment({ soldierProfileId: "s2", dateStr: "2026-03-01" }),
      ];

      const result = patchSchedule({
        assignments,
        constraintCheckers: [],
        soldiers,
        season,
      });

      const ids = onBaseSoldierIds(result.assignments, "2026-03-01");
      expect(ids).toContain("s3");
      expect(ids).toHaveLength(2);
    });
  });

  describe("phase 3: rebalance assignments", () => {
    it("rebalances when new soldiers are added", () => {
      const soldiers = [
        buildSoldier({ id: "s1" }),
        buildSoldier({ id: "s2" }),
        buildSoldier({ id: "s3" }),
        buildSoldier({ id: "new-1" }),
        buildSoldier({ id: "new-2" }),
      ];
      const season = buildSeason({
        startDate: new Date("2026-03-01T00:00:00.000Z"),
        endDate: new Date("2026-03-03T00:00:00.000Z"),
        dailyHeadcount: 2,
      });
      const assignments = [
        buildAssignment({ soldierProfileId: "s1", dateStr: "2026-03-01" }),
        buildAssignment({ soldierProfileId: "s2", dateStr: "2026-03-01" }),
        buildAssignment({ soldierProfileId: "s1", dateStr: "2026-03-02" }),
        buildAssignment({ soldierProfileId: "s3", dateStr: "2026-03-02" }),
        buildAssignment({ soldierProfileId: "s2", dateStr: "2026-03-03" }),
        buildAssignment({ soldierProfileId: "s3", dateStr: "2026-03-03" }),
      ];

      const result = patchSchedule({
        assignments,
        constraintCheckers: [],
        soldiers,
        season,
      });

      const newSoldierDays = result.assignments.filter(
        (a) => (a.soldierProfileId === "new-1" || a.soldierProfileId === "new-2") && a.isOnBase,
      ).length;
      expect(newSoldierDays).toBeGreaterThan(0);
    });

    it("does not remove manual override assignments during rebalancing", () => {
      const soldiers = [
        buildSoldier({ id: "s1" }),
        buildSoldier({ id: "s2" }),
        buildSoldier({ id: "new-soldier" }),
      ];
      const season = buildSeason({
        startDate: new Date("2026-03-01T00:00:00.000Z"),
        endDate: new Date("2026-03-02T00:00:00.000Z"),
        dailyHeadcount: 1,
      });
      const assignments = [
        buildAssignment({ soldierProfileId: "s1", dateStr: "2026-03-01", manualOverride: true }),
        buildAssignment({ soldierProfileId: "s1", dateStr: "2026-03-02", manualOverride: true }),
      ];

      const result = patchSchedule({
        assignments,
        constraintCheckers: [],
        soldiers,
        season,
      });

      const s1Days = result.assignments.filter(
        (a) => a.soldierProfileId === "s1" && a.isOnBase,
      ).length;
      expect(s1Days).toBe(2);
    });

    it("does not rebalance when all soldiers are balanced", () => {
      const soldiers = [
        buildSoldier({ id: "s1" }),
        buildSoldier({ id: "s2" }),
      ];
      const season = buildSeason({
        startDate: new Date("2026-03-01T00:00:00.000Z"),
        endDate: new Date("2026-03-02T00:00:00.000Z"),
        dailyHeadcount: 1,
      });
      const assignments = [
        buildAssignment({ soldierProfileId: "s1", dateStr: "2026-03-01" }),
        buildAssignment({ soldierProfileId: "s2", dateStr: "2026-03-02" }),
      ];

      const result = patchSchedule({
        assignments,
        constraintCheckers: [],
        soldiers,
        season,
      });

      expect(result.changeCount).toBe(0);
    });
  });

  describe("fromDate scoping", () => {
    it("does not modify assignments before fromDate", () => {
      const s1 = buildSoldier({ id: "s1" });
      const s2 = buildSoldier({ id: "s2" });
      const s3 = buildSoldier({ id: "s3" });
      const season = buildSeason({
        startDate: new Date("2026-03-01T00:00:00.000Z"),
        endDate: new Date("2026-03-03T00:00:00.000Z"),
        dailyHeadcount: 1,
      });
      const checker = new DayOffConstraintChecker([
        { soldierProfileId: "s1", date: new Date("2026-03-01T00:00:00.000Z") },
      ]);
      const assignments = [
        buildAssignment({ soldierProfileId: "s1", dateStr: "2026-03-01" }),
        buildAssignment({ soldierProfileId: "s2", dateStr: "2026-03-02" }),
      ];

      const result = patchSchedule({
        assignments,
        constraintCheckers: [checker],
        soldiers: [s1, s2, s3],
        season,
        fromDate: new Date("2026-03-02T00:00:00.000Z"),
      });

      const day1Ids = onBaseSoldierIds(result.assignments, "2026-03-01");
      expect(day1Ids).toContain("s1");
    });

    it("only fills understaffed days from fromDate onward", () => {
      const soldiers = [
        buildSoldier({ id: "s1" }),
        buildSoldier({ id: "s2" }),
        buildSoldier({ id: "s3" }),
      ];
      const season = buildSeason({
        startDate: new Date("2026-03-01T00:00:00.000Z"),
        endDate: new Date("2026-03-03T00:00:00.000Z"),
        dailyHeadcount: 2,
      });
      const assignments = [
        buildAssignment({ soldierProfileId: "s1", dateStr: "2026-03-01" }),
        buildAssignment({ soldierProfileId: "s1", dateStr: "2026-03-02" }),
        buildAssignment({ soldierProfileId: "s1", dateStr: "2026-03-03" }),
      ];

      const result = patchSchedule({
        assignments,
        constraintCheckers: [],
        soldiers,
        season,
        fromDate: new Date("2026-03-02T00:00:00.000Z"),
      });

      const day1Count = result.assignments.filter(
        (a) => a.isOnBase && a.date.toISOString().startsWith("2026-03-01"),
      ).length;
      expect(day1Count).toBe(1);

      const day2Count = result.assignments.filter(
        (a) => a.isOnBase && a.date.toISOString().startsWith("2026-03-02"),
      ).length;
      expect(day2Count).toBe(2);

      const day3Count = result.assignments.filter(
        (a) => a.isOnBase && a.date.toISOString().startsWith("2026-03-03"),
      ).length;
      expect(day3Count).toBe(2);
    });
  });

  describe("season config enforcement", () => {
    it("does not assign soldiers past hard max (avgDaysArmy + 5) when filling understaffed days", () => {
      const soldiers = [
        buildSoldier({ id: "s1" }),
        buildSoldier({ id: "s2" }),
      ];
      const season = buildSeason({
        startDate: new Date("2026-03-01T00:00:00.000Z"),
        endDate: new Date("2026-03-10T00:00:00.000Z"),
        dailyHeadcount: 1,
        avgDaysArmy: 2,
      });
      const assignments = [
        buildAssignment({ soldierProfileId: "s1", dateStr: "2026-03-03", manualOverride: true }),
        buildAssignment({ soldierProfileId: "s1", dateStr: "2026-03-04", manualOverride: true }),
        buildAssignment({ soldierProfileId: "s1", dateStr: "2026-03-05", manualOverride: true }),
        buildAssignment({ soldierProfileId: "s1", dateStr: "2026-03-06", manualOverride: true }),
        buildAssignment({ soldierProfileId: "s1", dateStr: "2026-03-07", manualOverride: true }),
        buildAssignment({ soldierProfileId: "s1", dateStr: "2026-03-08", manualOverride: true }),
        buildAssignment({ soldierProfileId: "s1", dateStr: "2026-03-09", manualOverride: true }),
        buildAssignment({ soldierProfileId: "s2", dateStr: "2026-03-01" }),
        buildAssignment({ soldierProfileId: "s2", dateStr: "2026-03-02" }),
      ];

      const result = patchSchedule({
        assignments,
        constraintCheckers: [],
        soldiers,
        season,
      });

      const day10Ids = onBaseSoldierIds(result.assignments, "2026-03-10");
      expect(day10Ids).not.toContain("s1");
      expect(day10Ids).toContain("s2");
    });

    it("does not swap in soldiers past hard max (avgDaysArmy + 5) when fixing role coverage", () => {
      const soldiers = [
        buildSoldier({ id: "s1", roles: [] }),
        buildSoldier({ id: "s2", roles: ["driver"] }),
        buildSoldier({ id: "s3", roles: ["driver"] }),
      ];
      const season = buildSeason({
        startDate: new Date("2026-03-01T00:00:00.000Z"),
        endDate: new Date("2026-03-10T00:00:00.000Z"),
        dailyHeadcount: 1,
        avgDaysArmy: 2,
        roleMinimums: { driver: 1 },
      });
      const assignments = [
        buildAssignment({ soldierProfileId: "s1", dateStr: "2026-03-01" }),
        buildAssignment({ soldierProfileId: "s2", dateStr: "2026-03-02" }),
        buildAssignment({ soldierProfileId: "s2", dateStr: "2026-03-03" }),
        buildAssignment({ soldierProfileId: "s2", dateStr: "2026-03-04" }),
        buildAssignment({ soldierProfileId: "s2", dateStr: "2026-03-05" }),
        buildAssignment({ soldierProfileId: "s2", dateStr: "2026-03-06" }),
        buildAssignment({ soldierProfileId: "s2", dateStr: "2026-03-07" }),
        buildAssignment({ soldierProfileId: "s2", dateStr: "2026-03-08" }),
        buildAssignment({ soldierProfileId: "s3", dateStr: "2026-03-09" }),
      ];

      const result = patchSchedule({
        assignments,
        constraintCheckers: [],
        soldiers,
        season,
      });

      const day1Ids = onBaseSoldierIds(result.assignments, "2026-03-01");
      expect(day1Ids).not.toContain("s2");
      expect(day1Ids).toContain("s3");
    });

    it("prefers soldiers with adjacent assignments when avgDaysArmy is set", () => {
      const soldiers = [
        buildSoldier({ id: "s1" }),
        buildSoldier({ id: "s2" }),
        buildSoldier({ id: "s3" }),
      ];
      const season = buildSeason({
        startDate: new Date("2026-03-01T00:00:00.000Z"),
        endDate: new Date("2026-03-03T00:00:00.000Z"),
        dailyHeadcount: 1,
        avgDaysArmy: 3,
      });
      const assignments = [
        buildAssignment({ soldierProfileId: "s1", dateStr: "2026-03-01" }),
        buildAssignment({ soldierProfileId: "s2", dateStr: "2026-03-02" }),
      ];

      const result = patchSchedule({
        assignments,
        constraintCheckers: [],
        soldiers,
        season,
      });

      const day3Ids = onBaseSoldierIds(result.assignments, "2026-03-03");
      expect(day3Ids).toContain("s2");
    });

    it("prefers soldiers from same city when cityGroupingEnabled is true", () => {
      const soldiers = [
        buildSoldier({ id: "s1", city: "תל אביב" }),
        buildSoldier({ id: "s3", city: "חיפה" }),
        buildSoldier({ id: "s2", city: "תל אביב" }),
      ];
      const season = buildSeason({
        startDate: new Date("2026-03-01T00:00:00.000Z"),
        endDate: new Date("2026-03-03T00:00:00.000Z"),
        dailyHeadcount: 2,
        cityGroupingEnabled: true,
      });
      const assignments = [
        buildAssignment({ soldierProfileId: "s1", dateStr: "2026-03-01" }),
        buildAssignment({ soldierProfileId: "s1", dateStr: "2026-03-02" }),
        buildAssignment({ soldierProfileId: "s3", dateStr: "2026-03-02" }),
        buildAssignment({ soldierProfileId: "s3", dateStr: "2026-03-03" }),
        buildAssignment({ soldierProfileId: "s2", dateStr: "2026-03-02" }),
        buildAssignment({ soldierProfileId: "s2", dateStr: "2026-03-03" }),
      ];

      const result = patchSchedule({
        assignments,
        constraintCheckers: [],
        soldiers,
        season,
      });

      const day1Ids = onBaseSoldierIds(result.assignments, "2026-03-01");
      expect(day1Ids).toContain("s2");
    });
  });

  describe("phase 5: fix role coverage", () => {
    it("returns zero changeCount when schedule is already valid", () => {
      const soldiers = [
        buildSoldier({ id: "s1" }),
        buildSoldier({ id: "s2" }),
      ];
      const season = buildSeason({
        startDate: new Date("2026-03-01T00:00:00.000Z"),
        endDate: new Date("2026-03-01T00:00:00.000Z"),
        dailyHeadcount: 2,
      });
      const assignments = [
        buildAssignment({ soldierProfileId: "s1", dateStr: "2026-03-01" }),
        buildAssignment({ soldierProfileId: "s2", dateStr: "2026-03-01" }),
      ];

      const result = patchSchedule({
        assignments,
        constraintCheckers: [],
        soldiers,
        season,
      });

      expect(result.changeCount).toBe(0);
      expect(result.assignments).toHaveLength(2);
    });
  });
});
