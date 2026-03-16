import type { PreparedBoardData } from "@/app/season/[seasonId]/board/prepare-board-data";
import type { SoldierRow, CellStatus } from "@/app/season/[seasonId]/board/board.types";
import { getGoogleSheetsClient, getGoogleDriveClient } from "./google-auth";
import type { sheets_v4 } from "googleapis";

type RowData = sheets_v4.Schema$RowData;
type CellData = sheets_v4.Schema$CellData;

const SHEETS_FOLDER_ID = "1mUJBRkyC8u8cjXGoZlestPeJHeW-sGWp";

const GREEN = { red: 0.85, green: 0.93, blue: 0.83 };
const RED = { red: 0.96, green: 0.8, blue: 0.8 };
const DARK_RED = { red: 0.9, green: 0.6, blue: 0.6 };
const DARK_YELLOW = { red: 0.95, green: 0.85, blue: 0.4 };
const LIGHT_BLUE = { red: 0.6, green: 0.78, blue: 0.95 };
const DARK_ORANGE = { red: 0.9, green: 0.6, blue: 0.2 };
const GRAY = { red: 0.9, green: 0.9, blue: 0.9 };
const HEADER_BG = { red: 0.95, green: 0.95, blue: 0.95 };
const BOLD_FORMAT = { bold: true };

interface ScheduleMinimums {
  readonly dailyHeadcount: number;
  readonly roleMinimums: Readonly<Partial<Record<string, number>>>;
}

interface SheetLayout {
  readonly firstDataRow: number;
  readonly lastDataRow: number;
  readonly roleRows: ReadonlyMap<string, readonly number[]>;
  readonly totalRowIndex: number;
  readonly roleRowIndices: ReadonlyMap<string, number>;
}

export async function createScheduleSheet(
  data: PreparedBoardData,
  seasonName: string,
  minimums: ScheduleMinimums,
): Promise<string> {
  const sheets = await getGoogleSheetsClient();
  const layout = computeSheetLayout(data);
  const rows = buildAllRows(data, layout);

  const response = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: `${seasonName} - סידור`, locale: "iw_IL" },
      sheets: [
        {
          properties: {
            title: "סידור",
            rightToLeft: true,
            gridProperties: {
              frozenRowCount: 2,
              frozenColumnCount: 1,
              rowCount: rows.length,
              columnCount: data.dayColumns.length + 1,
            },
          },
          data: [{ startRow: 0, startColumn: 0, rowData: rows }],
        },
      ],
    },
  });

  const spreadsheetId = response.data.spreadsheetId!;
  const sheetId = response.data.sheets![0].properties!.sheetId!;

  const drive = await getGoogleDriveClient();
  await drive.files.update({
    fileId: spreadsheetId,
    addParents: SHEETS_FOLDER_ID,
    removeParents: "root",
  });

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        ...buildMonthMerges(data, sheetId),
        ...buildDriverSeparatorBorder(data, sheetId),
        ...buildConditionalFormatRules(data, sheetId),
        ...buildTotalMinimumRules(data, layout, minimums, sheetId),
        ...buildDropdownValidation(data, sheetId),
        {
          autoResizeDimensions: {
            dimensions: {
              sheetId,
              dimension: "COLUMNS",
              startIndex: 0,
              endIndex: 1,
            },
          },
        },
      ],
    },
  });

  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
}

function computeSheetLayout(data: PreparedBoardData): SheetLayout {
  const firstDataRow = 3;
  const lastDataRow = 3 + data.nonDrivers.length + data.drivers.length;

  const roleRows = new Map<string, number[]>();

  data.nonDrivers.forEach((soldier, i) => {
    const row = 3 + i;
    for (const role of soldier.roles) {
      if (!roleRows.has(role)) roleRows.set(role, []);
      roleRows.get(role)!.push(row);
    }
  });

  data.drivers.forEach((soldier, i) => {
    const row = 4 + data.nonDrivers.length + i;
    for (const role of soldier.roles) {
      if (!roleRows.has(role)) roleRows.set(role, []);
      roleRows.get(role)!.push(row);
    }
  });

  const totalRowIndex = 2 + data.nonDrivers.length + 1 + data.drivers.length;
  const roleRowIndices = new Map<string, number>([
    ["commander", totalRowIndex + 1],
    ["driver", totalRowIndex + 2],
    ["navigator", totalRowIndex + 3],
  ]);

  return { firstDataRow, lastDataRow, roleRows, totalRowIndex, roleRowIndices };
}

function buildAllRows(data: PreparedBoardData, layout: SheetLayout): RowData[] {
  const rows: RowData[] = [];

  rows.push(buildMonthHeaderRow(data));
  rows.push(buildDayHeaderRow(data));

  for (const soldier of data.nonDrivers) {
    rows.push(buildSoldierRow(soldier, data));
  }

  rows.push(buildSeparatorRow(data.dayColumns.length));

  for (const soldier of data.drivers) {
    rows.push(buildSoldierRow(soldier, data));
  }

  rows.push(buildTotalFormulaRow("סה״כ", data, layout));
  rows.push(buildRoleFormulaRow("מפקדים", data, layout, "commander"));
  rows.push(buildRoleFormulaRow("נהגים", data, layout, "driver"));
  rows.push(buildRoleFormulaRow("נווטים", data, layout, "navigator"));

  return rows;
}

function buildMonthHeaderRow(data: PreparedBoardData): RowData {
  const cells: CellData[] = [makeCell("", { bold: true }, HEADER_BG)];
  for (const group of data.monthGroups) {
    cells.push(makeCell(group.month, BOLD_FORMAT, HEADER_BG, "CENTER"));
    for (let i = 1; i < group.colSpan; i++) {
      cells.push(makeCell("", undefined, HEADER_BG));
    }
  }
  return { values: cells };
}

function buildDayHeaderRow(data: PreparedBoardData): RowData {
  const cells: CellData[] = [makeCell("שם", BOLD_FORMAT, HEADER_BG)];
  for (const col of data.dayColumns) {
    const dd = String(col.dateNumber).padStart(2, "0");
    const mm = String(col.date.getUTCMonth() + 1).padStart(2, "0");
    cells.push(
      makeCell(`${col.dayName} ${dd}/${mm}`, BOLD_FORMAT, HEADER_BG, "CENTER"),
    );
  }
  return { values: cells };
}

function buildSoldierRow(soldier: SoldierRow, data: PreparedBoardData): RowData {
  const cells: CellData[] = [makeCell(soldier.name, BOLD_FORMAT)];
  for (const col of data.dayColumns) {
    const key = `${soldier.id}::${col.dateStr}`;
    cells.push(statusCell(data.statusMap.get(key)));
  }
  return { values: cells };
}

function buildSeparatorRow(dayCount: number): RowData {
  const cells: CellData[] = [makeCell("--- נהגים ---", BOLD_FORMAT, GRAY)];
  for (let i = 0; i < dayCount; i++) {
    cells.push(makeCell("", undefined, GRAY));
  }
  return { values: cells };
}

function buildTotalFormulaRow(
  label: string,
  data: PreparedBoardData,
  layout: SheetLayout,
): RowData {
  const cells: CellData[] = [makeCell(label, BOLD_FORMAT, HEADER_BG)];
  for (let i = 0; i < data.dayColumns.length; i++) {
    const col = columnLetter(i + 1);
    const formula = `=COUNTIF(${col}${layout.firstDataRow}:${col}${layout.lastDataRow},"1")`;
    cells.push(makeFormulaCell(formula, BOLD_FORMAT, HEADER_BG, "CENTER"));
  }
  return { values: cells };
}

function buildRoleFormulaRow(
  label: string,
  data: PreparedBoardData,
  layout: SheetLayout,
  role: string,
): RowData {
  const cells: CellData[] = [makeCell(label, BOLD_FORMAT, HEADER_BG)];
  const rows = layout.roleRows.get(role) ?? [];

  for (let i = 0; i < data.dayColumns.length; i++) {
    const col = columnLetter(i + 1);
    if (rows.length === 0) {
      cells.push(makeCell("0", BOLD_FORMAT, HEADER_BG, "CENTER"));
    } else {
      const parts = rows.map((r) => `COUNTIF(${col}${r},"1")`);
      cells.push(makeFormulaCell(`=${parts.join("+")}`, BOLD_FORMAT, HEADER_BG, "CENTER"));
    }
  }
  return { values: cells };
}

function statusCell(status: CellStatus | undefined): CellData {
  if (status === "present") return makeCell("1", undefined, undefined, "CENTER");
  if (status === "constraint-off") return makeCell("X", undefined, undefined, "CENTER");
  if (status === "rotation-off") return makeCell("0", undefined, undefined, "CENTER");
  if (status === "sick") return makeCell("ג", undefined, undefined, "CENTER");
  if (status === "course") return makeCell("ק", undefined, undefined, "CENTER");
  return makeCell("", undefined, undefined, "CENTER");
}

function makeCell(
  value: string,
  format?: { bold?: boolean },
  bgColor?: { red: number; green: number; blue: number },
  alignment?: "CENTER",
): CellData {
  return {
    userEnteredValue: { stringValue: value },
    userEnteredFormat: {
      ...(format?.bold && { textFormat: { bold: true } }),
      ...(bgColor && {
        backgroundColorStyle: { rgbColor: { ...bgColor, alpha: 1 } },
      }),
      ...(alignment && { horizontalAlignment: alignment }),
    },
  };
}

function makeFormulaCell(
  formula: string,
  format?: { bold?: boolean },
  bgColor?: { red: number; green: number; blue: number },
  alignment?: "CENTER",
): CellData {
  return {
    userEnteredValue: { formulaValue: formula },
    userEnteredFormat: {
      ...(format?.bold && { textFormat: { bold: true } }),
      ...(bgColor && {
        backgroundColorStyle: { rgbColor: { ...bgColor, alpha: 1 } },
      }),
      ...(alignment && { horizontalAlignment: alignment }),
    },
  };
}

function columnLetter(index: number): string {
  let result = "";
  let n = index;
  while (n >= 0) {
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  }
  return result;
}

function buildConditionalFormatRules(
  data: PreparedBoardData,
  sheetId: number,
): sheets_v4.Schema$Request[] {
  const startRow = 2;
  const endRow = 2 + data.nonDrivers.length + 1 + data.drivers.length;
  const startCol = 1;
  const endCol = 1 + data.dayColumns.length;

  const range = {
    sheetId,
    startRowIndex: startRow,
    endRowIndex: endRow,
    startColumnIndex: startCol,
    endColumnIndex: endCol,
  };

  const rules: { text: string; color: typeof GREEN }[] = [
    { text: "1", color: GREEN },
    { text: "X", color: DARK_RED },
    { text: "0", color: RED },
    { text: "ג", color: DARK_YELLOW },
    { text: "ק", color: LIGHT_BLUE },
  ];

  return rules.map(({ text, color }, index) => ({
    addConditionalFormatRule: {
      rule: {
        ranges: [range],
        booleanRule: {
          condition: {
            type: "TEXT_EQ" as const,
            values: [{ userEnteredValue: text }],
          },
          format: {
            backgroundColorStyle: { rgbColor: { ...color, alpha: 1 } },
          },
        },
      },
      index,
    },
  }));
}

function buildTotalMinimumRules(
  data: PreparedBoardData,
  layout: SheetLayout,
  minimums: ScheduleMinimums,
  sheetId: number,
): sheets_v4.Schema$Request[] {
  const colStart = 1;
  const colEnd = 1 + data.dayColumns.length;

  const rows: { rowIndex: number; minimum: number }[] = [];

  rows.push({ rowIndex: layout.totalRowIndex, minimum: minimums.dailyHeadcount });

  for (const [role, rowIndex] of layout.roleRowIndices) {
    const min = minimums.roleMinimums[role];
    if (min != null && min > 0) {
      rows.push({ rowIndex, minimum: min });
    }
  }

  return rows.map(({ rowIndex, minimum }) => ({
    addConditionalFormatRule: {
      rule: {
        ranges: [{
          sheetId,
          startRowIndex: rowIndex,
          endRowIndex: rowIndex + 1,
          startColumnIndex: colStart,
          endColumnIndex: colEnd,
        }],
        booleanRule: {
          condition: {
            type: "NUMBER_LESS" as const,
            values: [{ userEnteredValue: String(minimum) }],
          },
          format: {
            backgroundColorStyle: { rgbColor: { ...DARK_ORANGE, alpha: 1 } },
          },
        },
      },
      index: 0,
    },
  }));
}

function buildMonthMerges(data: PreparedBoardData, sheetId: number) {
  const requests: sheets_v4.Schema$Request[] = [];
  let colOffset = 1;
  for (const group of data.monthGroups) {
    if (group.colSpan > 1) {
      requests.push({
        mergeCells: {
          range: {
            sheetId,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: colOffset,
            endColumnIndex: colOffset + group.colSpan,
          },
          mergeType: "MERGE_ALL",
        },
      });
    }
    colOffset += group.colSpan;
  }
  return requests;
}

const STATUS_VALUES = ["1", "0", "X", "ג", "ק"] as const;

function buildDropdownValidation(
  data: PreparedBoardData,
  sheetId: number,
): sheets_v4.Schema$Request[] {
  const startRow = 2;
  const endRow = 2 + data.nonDrivers.length + 1 + data.drivers.length;

  return [{
    setDataValidation: {
      range: {
        sheetId,
        startRowIndex: startRow,
        endRowIndex: endRow,
        startColumnIndex: 1,
        endColumnIndex: 1 + data.dayColumns.length,
      },
      rule: {
        condition: {
          type: "ONE_OF_LIST" as const,
          values: STATUS_VALUES.map((v) => ({ userEnteredValue: v })),
        },
        showCustomUi: true,
        strict: false,
      },
    },
  }];
}

function buildDriverSeparatorBorder(data: PreparedBoardData, sheetId: number) {
  const separatorRowIndex = 2 + data.nonDrivers.length;
  return [
    {
      updateBorders: {
        range: {
          sheetId,
          startRowIndex: separatorRowIndex,
          endRowIndex: separatorRowIndex + 1,
          startColumnIndex: 0,
          endColumnIndex: data.dayColumns.length + 1,
        },
        top: {
          style: "SOLID_THICK" as const,
          color: { red: 0, green: 0, blue: 0 },
        },
        bottom: {
          style: "SOLID_THICK" as const,
          color: { red: 0, green: 0, blue: 0 },
        },
      },
    },
  ];
}
