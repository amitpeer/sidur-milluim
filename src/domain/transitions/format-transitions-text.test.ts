import { describe, it, expect } from "vitest";
import { formatTransitionsText } from "./format-transitions-text";

describe("formatTransitionsText", () => {
  it("formats header with bold markers, day of week and DD/MM", () => {
    const sections = [
      {
        dayOfWeek: "ראשון",
        shortDate: "15/03",
        arriving: ["דני", "יוסי"],
        leaving: ["משה", "עמית"],
      },
    ];

    const result = formatTransitionsText(sections);

    expect(result).toContain("*ראשון ,15/03*");
  });

  it("lists arriving and leaving with bold labels, names comma-separated", () => {
    const sections = [
      {
        dayOfWeek: "ראשון",
        shortDate: "15/03",
        arriving: ["דני", "יוסי"],
        leaving: ["משה"],
      },
    ];

    const result = formatTransitionsText(sections);

    expect(result).toContain("*מגיעים:* דני, יוסי");
    expect(result).toContain("*עוזבים:* משה");
  });

  it("shows no-change message when lists empty", () => {
    const sections = [
      {
        dayOfWeek: "ראשון",
        shortDate: "15/03",
        arriving: [],
        leaving: [],
      },
    ];

    const result = formatTransitionsText(sections);

    expect(result).toContain("*מגיעים:* אין שינוי");
    expect(result).toContain("*עוזבים:* אין שינוי");
  });

  it("separates multiple sections with blank lines", () => {
    const sections = [
      { dayOfWeek: "ראשון", shortDate: "15/03", arriving: ["דני"], leaving: [] },
      { dayOfWeek: "שני", shortDate: "16/03", arriving: [], leaving: ["משה"] },
    ];

    const result = formatTransitionsText(sections);

    expect(result).toContain("*ראשון ,15/03*");
    expect(result).toContain("*שני ,16/03*");
    expect(result.indexOf("*שני")).toBeGreaterThan(result.indexOf("*ראשון"));
  });
});
