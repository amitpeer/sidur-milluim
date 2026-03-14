# Add Sick ("ג") and Course ("ק") Absence States

## Context
The schedule board currently has 3 cell statuses: present ("1"), constraint-off ("X"), and rotation-off ("0"). The admin needs two new states to mark soldiers as **sick** ("ג") or **in a course** ("ק"). Both mean the soldier is away and should not count toward daily totals. These must appear in the Google Sheet (dark-yellow), statistics table, and personal schedule page.

## Data Model Change

### `prisma/schema.prisma` — Add `absentReason` to `ScheduleAssignment`
```prisma
absentReason String?   // "sick" | "course" | null
```
When set, `isOnBase` must be `false`. Run `npx prisma migrate dev`.

### `src/domain/schedule/schedule.types.ts` — Add to domain type
```ts
readonly absentReason: "sick" | "course" | null;
```

## Status Type Expansion

### `src/app/season/[seasonId]/board/board.types.ts`
```ts
export type CellStatus = "present" | "constraint-off" | "rotation-off" | "sick" | "course";
```

## Files to Modify (in order)

### 1. `prisma/schema.prisma`
- Add `absentReason String?` to `ScheduleAssignment` model

### 2. `src/domain/schedule/schedule.types.ts`
- Add `absentReason` field to `ScheduleAssignment` interface

### 3. `src/app/season/[seasonId]/board/board.types.ts`
- Expand `CellStatus` with `"sick" | "course"`

### 4. `src/app/season/[seasonId]/board/prepare-board-data.ts`
- In `buildStatusMap`: check `absentReason` from assignments before the existing constraint/present/off logic. If `absentReason === "sick"` → set "sick"; if `"course"` → set "course". These take priority.
- In `buildDailyTotals`: already skips `!a.isOnBase`, so sick/course are excluded automatically.

### 5. `src/server/sheets/create-schedule-sheet.ts`
- Add `DARK_YELLOW` color constant: `{ red: 0.95, green: 0.85, blue: 0.4 }`
- In `statusCell`: add cases for `"sick"` → `makeCell("ג", ...)` and `"course"` → `makeCell("ק", ...)`
- In `buildConditionalFormatRules`: add rules for "ג" and "ק" with `DARK_YELLOW`
- In `buildTotalFormulaRow`: formula already uses `COUNTIF(..., "1")` — only counts present. No change needed.

### 6. `src/server/db/stores/schedule-store.ts`
- `getAssignmentsForSoldier`: add `absentReason` to the `select` clause
- `createScheduleVersion`: include `absentReason` in the `createMany` data mapping
- `toggleAssignment`: when toggling to `isOnBase: true`, clear `absentReason: null`
- Add new function `setAbsentReason(assignmentId, reason)`:
  ```ts
  export async function setAbsentReason(assignmentId: string, reason: "sick" | "course" | null) {
    return prisma.scheduleAssignment.update({
      where: { id: assignmentId },
      data: { absentReason: reason, isOnBase: reason ? false : undefined, manualOverride: true },
    });
  }
  ```

### 7. `src/server/actions/schedule-actions.ts`
- **`getMyScheduleAction`**: update the status logic — check `absentReason` from assignments. Add `"sick"` and `"course"` to the `ScheduleDay.status` union. Query needs `absentReason` (update the `getAssignmentsForSoldier` select).
- **`SoldierStats`**: add `sickDays: number` and `courseDays: number` fields
- **`getSoldierStatsAction`**: count assignments where `absentReason === "sick"` and `"course"` per soldier
- **`setAbsentReasonAction`**: new server action that calls `setAbsentReason` from the store

### 8. `src/app/season/[seasonId]/my-schedule/page.tsx`
- Add two new `DaySection` blocks for sick days ("ימי מחלה") and course days ("ימי קורס")
- Use `bg-yellow-100 text-yellow-700` / `bg-yellow-500` dot color for both
- Add summary badges at the top

### 9. `src/app/season/[seasonId]/admin/management/page.tsx`
- `StatsSection`: add two new columns in the stats table:
  - "ימי מחלה" (sick days) — yellow badge
  - "ימי קורס" (course days) — yellow badge

### 10. `src/app/season/[seasonId]/day/[date]/page.tsx`
- Show sick and course soldiers in separate sections below the "present" list
- Add buttons for admin to mark/unmark soldiers as sick or in-course

### 11. `src/app/season/[seasonId]/transitions/page.tsx`
- No changes needed — transitions only look at `isOnBase`, which is already false for sick/course soldiers, so they correctly show as "leaving" when going sick.

### 12. Domain schedule files (generator, patcher, replacement-suggester)
- `schedule-generator.ts`: assignments are created with `absentReason: null` → no change needed (field defaults to null)
- Wait — the generator creates plain objects. Add `absentReason: null` to all `assignments.push(...)` calls.
- `schedule-patcher.ts`: same — add `absentReason: null` to new assignments.
- `replacement-suggester.ts`: no change — it doesn't create assignments.

## Verification
1. Run `npx prisma migrate dev` — verify migration succeeds
2. Run `npx tsc --noEmit` — verify no type errors
3. Generate a schedule and export to Google Sheets — verify "ג"/"ק" cells appear dark-yellow
4. Check stats table shows sick/course columns
5. Check "my schedule" page shows sick/course sections
