import { eachDayInRange } from "@/lib/date-utils";

export const WEEKDAY_HEADERS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];

export const MONTH_NAMES_HE: Record<number, string> = {
  0: "ינואר",
  1: "פברואר",
  2: "מרץ",
  3: "אפריל",
  4: "מאי",
  5: "יוני",
  6: "יולי",
  7: "אוגוסט",
  8: "ספטמבר",
  9: "אוקטובר",
  10: "נובמבר",
  11: "דצמבר",
};

export interface MonthData {
  readonly year: number;
  readonly month: number;
  readonly days: Date[];
}

export function buildFullMonths(
  seasonStart: Date,
  seasonEnd: Date,
): MonthData[] {
  const startYear = seasonStart.getUTCFullYear();
  const startMonth = seasonStart.getUTCMonth();
  const endYear = seasonEnd.getUTCFullYear();
  const endMonth = seasonEnd.getUTCMonth();

  const months: MonthData[] = [];
  let y = startYear;
  let m = startMonth;

  while (y < endYear || (y === endYear && m <= endMonth)) {
    const firstDay = new Date(Date.UTC(y, m, 1));
    const lastDay = new Date(Date.UTC(y, m + 1, 0));
    months.push({ year: y, month: m, days: eachDayInRange(firstDay, lastDay) });

    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
  }

  return months;
}
