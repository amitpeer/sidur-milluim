import { describe, it, expect } from "vitest";
import { groupScheduleBySequence } from "./group-schedule-by-sequence";

describe("groupScheduleBySequence", () => {
  it("groups consecutive same-status days into one sequence", () => {
    const days = [
      { date: new Date("2026-03-01T00:00:00Z"), status: "on-base" },
      { date: new Date("2026-03-02T00:00:00Z"), status: "on-base" },
      { date: new Date("2026-03-03T00:00:00Z"), status: "on-base" },
    ];

    const result = groupScheduleBySequence(days);

    expect(result).toEqual([
      {
        status: "on-base",
        startDate: new Date("2026-03-01T00:00:00Z"),
        endDate: new Date("2026-03-03T00:00:00Z"),
        dayCount: 3,
      },
    ]);
  });

  it("starts new sequence when status changes", () => {
    const days = [
      { date: new Date("2026-03-01T00:00:00Z"), status: "on-base" },
      { date: new Date("2026-03-02T00:00:00Z"), status: "on-base" },
      { date: new Date("2026-03-03T00:00:00Z"), status: "rotation-off" },
      { date: new Date("2026-03-04T00:00:00Z"), status: "rotation-off" },
    ];

    const result = groupScheduleBySequence(days);

    expect(result).toEqual([
      {
        status: "on-base",
        startDate: new Date("2026-03-01T00:00:00Z"),
        endDate: new Date("2026-03-02T00:00:00Z"),
        dayCount: 2,
      },
      {
        status: "rotation-off",
        startDate: new Date("2026-03-03T00:00:00Z"),
        endDate: new Date("2026-03-04T00:00:00Z"),
        dayCount: 2,
      },
    ]);
  });

  it("handles single-day sequences", () => {
    const days = [
      { date: new Date("2026-03-01T00:00:00Z"), status: "on-base" },
      { date: new Date("2026-03-02T00:00:00Z"), status: "rotation-off" },
      { date: new Date("2026-03-03T00:00:00Z"), status: "on-base" },
    ];

    const result = groupScheduleBySequence(days);

    expect(result).toHaveLength(3);
    expect(result[0].dayCount).toBe(1);
    expect(result[1].dayCount).toBe(1);
    expect(result[2].dayCount).toBe(1);
  });

  it("returns empty array for empty input", () => {
    const result = groupScheduleBySequence([]);

    expect(result).toEqual([]);
  });
});
