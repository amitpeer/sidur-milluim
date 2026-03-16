import { addDays } from "@/lib/date-utils";
import { getGoogleSheetsClient } from "./google-auth";

interface SheetSoldierRow {
  readonly name: string;
  readonly cellValues: readonly string[];
}

export interface ParsedSheet {
  readonly soldierRows: readonly SheetSoldierRow[];
  readonly columnDates: readonly Date[];
  readonly skippedRows: readonly string[];
}

const HEADER_ROW_COUNT = 2;
const SKIP_PREFIXES = ["---"];
const FOOTER_LABELS = new Set(["סה״כ", "מפקדים", "נהגים", "נווטים"]);

function isSkippableRow(name: string): boolean {
  if (FOOTER_LABELS.has(name)) return true;
  return SKIP_PREFIXES.some((prefix) => name.startsWith(prefix));
}

/**
 * Infer the full Date of the first sheet column from its day-of-month header
 * and a reference date (season start). The sheet may have been exported with
 * different season dates, so the first column's day-of-month can differ from
 * the current season start. We pick the closest date to seasonStart that has
 * the matching day-of-month.
 */
function inferColumnStartDate(firstDayOfMonth: number, seasonStart: Date): Date {
  const year = seasonStart.getUTCFullYear();
  const month = seasonStart.getUTCMonth();

  const sameMonth = new Date(Date.UTC(year, month, firstDayOfMonth));
  const prevMonth = new Date(Date.UTC(year, month - 1, firstDayOfMonth));
  const nextMonth = new Date(Date.UTC(year, month + 1, firstDayOfMonth));

  const candidates = [prevMonth, sameMonth, nextMonth];
  let best = sameMonth;
  let bestDiff = Infinity;

  for (const candidate of candidates) {
    if (candidate.getUTCDate() !== firstDayOfMonth) continue;
    const diff = Math.abs(candidate.getTime() - seasonStart.getTime());
    if (diff < bestDiff) {
      bestDiff = diff;
      best = candidate;
    }
  }

  return best;
}

function parseDayNumber(header: string): number | null {
  // New format: "א 15/03" — extract dd from dd/mm
  const slashMatch = header.match(/(\d{1,2})\/(\d{1,2})/);
  if (slashMatch) return parseInt(slashMatch[1], 10);

  // Legacy format: "15 א" — leading number
  const num = parseInt(header, 10);
  return isNaN(num) ? null : num;
}

function parseDayHeaders(headerRow: unknown[], seasonStart: Date): Date[] {
  const headers = headerRow.slice(1);
  if (headers.length === 0) return [];

  const firstDay = parseDayNumber(String(headers[0] ?? ""));
  if (firstDay === null) return [];

  const startDate = inferColumnStartDate(firstDay, seasonStart);
  return headers.map((_, i) => addDays(startDate, i));
}

export async function readScheduleSheet(
  spreadsheetId: string,
  seasonStart: Date,
): Promise<ParsedSheet> {
  const sheets = await getGoogleSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "סידור",
  });

  const allRows = response.data.values ?? [];
  const dayHeaderRow = allRows[1] ?? [];
  const columnDates = parseDayHeaders(dayHeaderRow, seasonStart);
  const dataRows = allRows.slice(HEADER_ROW_COUNT);

  const soldierRows: SheetSoldierRow[] = [];
  const skippedRows: string[] = [];

  for (const row of dataRows) {
    const name = String(row[0] ?? "").trim();
    if (!name) continue;

    if (isSkippableRow(name)) {
      skippedRows.push(name);
      continue;
    }

    const cellValues = row.slice(1).map((cell: unknown) => String(cell ?? "").trim());
    soldierRows.push({ name, cellValues });
  }

  return { soldierRows, columnDates, skippedRows };
}
