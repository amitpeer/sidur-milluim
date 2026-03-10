import { describe, it, expect } from "vitest";
import { buildConstraint } from "@/test/builders/constraint.builder";
import { groupConstraintsByGroupId } from "./constraint-grouping";

describe("groupConstraintsByGroupId", () => {
  it("groups constraints with the same groupId together", () => {
    const constraints = [
      buildConstraint({ groupId: "g1", date: new Date("2026-03-01") }),
      buildConstraint({ groupId: "g1", date: new Date("2026-03-02") }),
      buildConstraint({ groupId: "g2", date: new Date("2026-03-03") }),
    ];

    const groups = groupConstraintsByGroupId(constraints);

    expect(groups.get("g1")).toHaveLength(2);
    expect(groups.get("g2")).toHaveLength(1);
    expect(groups.size).toBe(2);
  });

  it("treats constraints without groupId as individual groups", () => {
    const c1 = buildConstraint({ groupId: null, date: new Date("2026-03-01") });
    const c2 = buildConstraint({ groupId: null, date: new Date("2026-03-02") });

    const groups = groupConstraintsByGroupId([c1, c2]);

    expect(groups.size).toBe(2);
    for (const [, items] of groups) {
      expect(items).toHaveLength(1);
    }
  });

  it("preserves date ordering within a group", () => {
    const constraints = [
      buildConstraint({ groupId: "g1", date: new Date("2026-03-05") }),
      buildConstraint({ groupId: "g1", date: new Date("2026-03-01") }),
      buildConstraint({ groupId: "g1", date: new Date("2026-03-03") }),
    ];

    const groups = groupConstraintsByGroupId(constraints);
    const dates = groups.get("g1")!.map((c) => c.date.getTime());

    expect(dates).toEqual([...dates].sort((a, b) => a - b));
  });
});
