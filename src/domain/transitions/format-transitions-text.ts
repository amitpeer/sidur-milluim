interface TransitionSection {
  readonly dayOfWeek: string;
  readonly shortDate: string;
  readonly arriving: readonly string[];
  readonly leaving: readonly string[];
}

export function formatTransitionsText(
  sections: readonly TransitionSection[],
): string {
  return sections
    .map((section) => {
      const header = `*${section.dayOfWeek} ,${section.shortDate}*`;

      const arrivingText =
        section.arriving.length > 0
          ? `*מגיעים:* ${section.arriving.join(", ")}`
          : "*מגיעים:* אין שינוי";

      const leavingText =
        section.leaving.length > 0
          ? `*עוזבים:* ${section.leaving.join(", ")}`
          : "*עוזבים:* אין שינוי";

      return [header, arrivingText, leavingText].join("\n");
    })
    .join("\n\n");
}
