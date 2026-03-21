import { describe, it, expect } from "vitest";
import { applySheetSync } from "./apply-sheet-sync";
import type { ScheduleAssignment } from "./schedule.types";

function buildAssignment(overrides: Partial<ScheduleAssignment> & { dateStr: string }): ScheduleAssignment {
  const { dateStr, ...rest } = overrides;
  return {
    soldierProfileId: "s1",
    date: new Date(dateStr + "T00:00:00.000Z"),
    isOnBase: true,
    isUnavailable: false,
    absentReason: null,
    replacedById: null,
    manualOverride: false,
    ...rest,
  };
}

describe("applySheetSync", () => {
  it("detects change from on-base to sick", () => {
    const assignments = [
      buildAssignment({ soldierProfileId: "s1", dateStr: "2026-04-01" }),
    ];
    const sheetRows = [
      { soldierId: "s1", cells: [{ dateKey: "2026-04-01", value: "ג" }] },
    ];

    const result = applySheetSync(assignments, sheetRows);

    expect(result.changeCount).toBe(1);
    const updated = result.assignments.find(
      (a) => a.soldierProfileId === "s1",
    )!;
    expect(updated.isOnBase).toBe(false);
    expect(updated.absentReason).toBe("sick");
    expect(updated.manualOverride).toBe(true);
  });

  it("detects change from rotation-off to sick when no assignment exists", () => {
    const assignments: ScheduleAssignment[] = [];
    const sheetRows = [
      { soldierId: "s1", cells: [{ dateKey: "2026-04-01", value: "ג" }] },
    ];

    const result = applySheetSync(assignments, sheetRows);

    expect(result.changeCount).toBe(1);
    const created = result.assignments.find(
      (a) => a.soldierProfileId === "s1",
    )!;
    expect(created).toBeDefined();
    expect(created.isOnBase).toBe(false);
    expect(created.absentReason).toBe("sick");
    expect(created.manualOverride).toBe(true);
  });

  it("detects change from rotation-off to course when no assignment exists", () => {
    const assignments: ScheduleAssignment[] = [];
    const sheetRows = [
      { soldierId: "s1", cells: [{ dateKey: "2026-04-01", value: "ק" }] },
    ];

    const result = applySheetSync(assignments, sheetRows);

    expect(result.changeCount).toBe(1);
    const created = result.assignments.find(
      (a) => a.soldierProfileId === "s1",
    )!;
    expect(created.isOnBase).toBe(false);
    expect(created.absentReason).toBe("course");
  });

  it("detects change from rotation-off to on-base when no assignment exists", () => {
    const assignments: ScheduleAssignment[] = [];
    const sheetRows = [
      { soldierId: "s1", cells: [{ dateKey: "2026-04-01", value: "1" }] },
    ];

    const result = applySheetSync(assignments, sheetRows);

    expect(result.changeCount).toBe(1);
    const created = result.assignments.find(
      (a) => a.soldierProfileId === "s1",
    )!;
    expect(created.isOnBase).toBe(true);
    expect(created.absentReason).toBeNull();
  });

  it("syncs constraint-off cells (X) as not on base", () => {
    const assignments = [
      buildAssignment({ soldierProfileId: "s1", dateStr: "2026-04-01", isOnBase: true }),
    ];
    const sheetRows = [
      { soldierId: "s1", cells: [{ dateKey: "2026-04-01", value: "X" }] },
    ];

    const result = applySheetSync(assignments, sheetRows);

    expect(result.changeCount).toBe(1);
    const updated = result.assignments.find(
      (a) => a.soldierProfileId === "s1",
    )!;
    expect(updated.isOnBase).toBe(false);
    expect(updated.absentReason).toBeNull();
  });

  it("does not change when constraint-off matches existing off-base state", () => {
    const assignments = [
      buildAssignment({ soldierProfileId: "s1", dateStr: "2026-04-01", isOnBase: false }),
    ];
    const sheetRows = [
      { soldierId: "s1", cells: [{ dateKey: "2026-04-01", value: "X" }] },
    ];

    const result = applySheetSync(assignments, sheetRows);

    expect(result.changeCount).toBe(0);
  });

  it("reports unmatched cell values", () => {
    const assignments = [
      buildAssignment({ soldierProfileId: "s1", dateStr: "2026-04-01" }),
    ];
    const sheetRows = [
      { soldierId: "s1", cells: [{ dateKey: "2026-04-01", value: "???" }] },
    ];

    const result = applySheetSync(assignments, sheetRows);

    expect(result.changeCount).toBe(0);
    expect(result.unmatchedValues).toContain("???");
  });

  it("does not change when sheet matches existing state", () => {
    const assignments = [
      buildAssignment({ soldierProfileId: "s1", dateStr: "2026-04-01", isOnBase: false, absentReason: "sick" }),
    ];
    const sheetRows = [
      { soldierId: "s1", cells: [{ dateKey: "2026-04-01", value: "ג" }] },
    ];

    const result = applySheetSync(assignments, sheetRows);

    expect(result.changeCount).toBe(0);
  });

  it("does not change when rotation-off matches 0 in sheet", () => {
    const assignments: ScheduleAssignment[] = [];
    const sheetRows = [
      { soldierId: "s1", cells: [{ dateKey: "2026-04-01", value: "0" }] },
    ];

    const result = applySheetSync(assignments, sheetRows);

    expect(result.changeCount).toBe(0);
  });
});
