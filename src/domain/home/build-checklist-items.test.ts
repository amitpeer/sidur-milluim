import { describe, it, expect } from "vitest";
import { buildChecklistItems } from "./build-checklist-items";

describe("buildChecklistItems", () => {
  const baseInput = {
    hasCity: true,
    hasConstraints: true,
    constraintDeadline: null as Date | null,
    hasActiveSchedule: false,
    now: new Date("2026-03-14T10:00:00.000Z"),
  };

  it("returns incomplete item when city is missing", () => {
    const items = buildChecklistItems({ ...baseInput, hasCity: false });

    const cityItem = items.find((i) => i.key === "city");
    expect(cityItem).toBeDefined();
    expect(cityItem!.isComplete).toBe(false);
  });

  it("returns complete item when city is set", () => {
    const items = buildChecklistItems({ ...baseInput, hasCity: true });

    const cityItem = items.find((i) => i.key === "city");
    expect(cityItem).toBeDefined();
    expect(cityItem!.isComplete).toBe(true);
  });

  it("shows days left until constraint deadline", () => {
    const items = buildChecklistItems({
      ...baseInput,
      hasConstraints: false,
      constraintDeadline: new Date("2026-03-17T00:00:00.000Z"),
    });

    const constraintItem = items.find((i) => i.key === "constraints");
    expect(constraintItem).toBeDefined();
    expect(constraintItem!.daysLeft).toBe(3);
    expect(constraintItem!.urgency).toBe("warning");
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
