import { describe, it, expect } from "vitest";
import { buildChecklistItems } from "./build-checklist-items";

describe("buildChecklistItems", () => {
  const baseInput = {
    seasonId: "s1",
    hasCity: true,
    hasConstraints: true,
    constraintDeadline: null as Date | null,
    hasActiveSchedule: false,
    now: new Date("2026-03-14T10:00:00.000Z"),
  };

  it("returns incomplete item when city is missing with href to profile", () => {
    const items = buildChecklistItems({ ...baseInput, hasCity: false });

    const cityItem = items.find((i) => i.key === "city");
    expect(cityItem).toBeDefined();
    expect(cityItem!.isComplete).toBe(false);
    expect(cityItem!.href).toBe("/season/s1/profile");
  });

  it("returns complete item when city is set with no href", () => {
    const items = buildChecklistItems({ ...baseInput, hasCity: true });

    const cityItem = items.find((i) => i.key === "city");
    expect(cityItem).toBeDefined();
    expect(cityItem!.isComplete).toBe(true);
    expect(cityItem!.href).toBeNull();
  });

  it("shows days left until constraint deadline with href to my-schedule", () => {
    const items = buildChecklistItems({
      ...baseInput,
      hasConstraints: false,
      constraintDeadline: new Date("2026-03-17T00:00:00.000Z"),
    });

    const constraintItem = items.find((i) => i.key === "constraints");
    expect(constraintItem).toBeDefined();
    expect(constraintItem!.daysLeft).toBe(3);
    expect(constraintItem!.urgency).toBe("warning");
    expect(constraintItem!.href).toBe("/season/s1/my-schedule");
  });

  it("marks overdue when deadline passed", () => {
    const items = buildChecklistItems({
      ...baseInput,
      hasConstraints: false,
      constraintDeadline: new Date("2026-03-10T00:00:00.000Z"),
    });

    const constraintItem = items.find((i) => i.key === "constraints");
    expect(constraintItem).toBeDefined();
    expect(constraintItem!.daysLeft).toBe(-4);
    expect(constraintItem!.urgency).toBe("overdue");
  });

  it("returns all complete when everything is done", () => {
    const items = buildChecklistItems(baseInput);

    expect(items.every((i) => i.isComplete)).toBe(true);
    expect(items.length).toBeGreaterThan(0);
  });
});
