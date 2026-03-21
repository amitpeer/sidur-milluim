import type { ScheduleAssignment } from "./schedule.types";
import { dateToString } from "@/lib/date-utils";

const SHEET_VALUE_MAP: Record<
  string,
  { readonly isOnBase: boolean; readonly absentReason: "sick" | "course" | null }
> = {
  "1": { isOnBase: true, absentReason: null },
  "0": { isOnBase: false, absentReason: null },
  "X": { isOnBase: false, absentReason: null },
  "ג": { isOnBase: false, absentReason: "sick" },
  "ק": { isOnBase: false, absentReason: "course" },
  "": { isOnBase: false, absentReason: null },
};

interface SheetCell {
  readonly dateKey: string;
  readonly value: string;
}

interface SheetRow {
  readonly soldierId: string;
  readonly cells: readonly SheetCell[];
}

interface SyncResult {
  readonly assignments: ScheduleAssignment[];
  readonly changeCount: number;
  readonly unmatchedValues: readonly string[];
}

export function applySheetSync(
  existing: readonly ScheduleAssignment[],
  sheetRows: readonly SheetRow[],
): SyncResult {
  const existingByKey = new Map<string, ScheduleAssignment>();
  for (const a of existing) {
    existingByKey.set(`${a.soldierProfileId}::${dateToString(a.date)}`, a);
  }

  const updated = [...existing];
  let changeCount = 0;
  const unmatchedValues = new Set<string>();

  for (const row of sheetRows) {
    for (const cell of row.cells) {
      const mapped = SHEET_VALUE_MAP[cell.value];
      if (mapped === undefined) {
        unmatchedValues.add(cell.value);
        continue;
      }

      const key = `${row.soldierId}::${cell.dateKey}`;
      const current = existingByKey.get(key);

      if (!current) {
        // No existing assignment — soldier was rotation-off.
        // "0" and "" map to the same state, so no change needed.
        if (!mapped.isOnBase && mapped.absentReason === null) continue;

        // Sheet says something different (on-base, sick, course) — create assignment.
        const newAssignment: ScheduleAssignment = {
          soldierProfileId: row.soldierId,
          date: new Date(cell.dateKey + "T00:00:00.000Z"),
          isOnBase: mapped.isOnBase,
          isUnavailable: false,
          absentReason: mapped.absentReason,
          replacedById: null,
          manualOverride: true,
        };
        updated.push(newAssignment);
        changeCount++;
        continue;
      }

      const needsUpdate =
        current.isOnBase !== mapped.isOnBase ||
        (current.absentReason ?? null) !== mapped.absentReason;

      if (!needsUpdate) continue;

      const idx = updated.findIndex(
        (a) =>
          a.soldierProfileId === row.soldierId &&
          dateToString(a.date) === cell.dateKey,
      );
      if (idx === -1) continue;

      updated[idx] = {
        ...updated[idx],
        isOnBase: mapped.isOnBase,
        absentReason: mapped.absentReason,
        manualOverride: true,
      };
      changeCount++;
    }
  }

  return { assignments: updated, changeCount, unmatchedValues: [...unmatchedValues] };
}
