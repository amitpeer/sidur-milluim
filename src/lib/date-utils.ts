export function dateToString(date: Date): string {
  return date.toISOString().split("T")[0];
}

export function stringToDate(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00.000Z");
}

/**
 * Safely parse a date from a server action response.
 * Handles Date objects, ISO strings, and date-only strings.
 */
export function parseServerDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  if (typeof value === "string" && !value.includes("T")) {
    return new Date(value + "T00:00:00.000Z");
  }
  return new Date(value);
}

export function daysBetween(start: Date, end: Date): number {
  const diffMs = end.getTime() - start.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function eachDayInRange(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  let current = new Date(start);
  while (current <= end) {
    days.push(new Date(current));
    current = addDays(current, 1);
  }
  return days;
}
