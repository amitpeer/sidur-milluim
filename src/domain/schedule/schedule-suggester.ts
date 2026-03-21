import type { Season } from "@/domain/season/season.types";
import type { SeasonSoldier } from "@/domain/soldier/soldier.types";
import type { ValidationWarning } from "./schedule.types";
import { generateSchedule } from "./schedule-generator";
import { validateSchedule } from "./schedule-validator";

interface SuggestionInput {
  readonly season: Season;
  readonly soldiers: readonly SeasonSoldier[];
  readonly constraints: readonly {
    readonly soldierProfileId: string;
    readonly date: Date;
  }[];
}

interface ScheduleSuggestion {
  readonly avgDaysArmy: number;
  readonly avgDaysHome: number;
  readonly label: string;
  readonly warningCount: number;
  readonly feasibilityScore: number;
  readonly notes: string[];
}

const CANDIDATES: readonly { army: number; home: number }[] = [
  { army: 7, home: 7 },
  { army: 8, home: 6 },
  { army: 9, home: 5 },
  { army: 10, home: 4 },
  { army: 11, home: 3 },
  { army: 12, home: 2 },
];

const MAX_RESULTS = 5;

export function suggestScheduleConfig(
  input: SuggestionInput,
): ScheduleSuggestion[] {
  const { season, soldiers, constraints } = input;

  if (soldiers.length === 0 || season.dailyHeadcount <= 0) return [];

  const results: ScheduleSuggestion[] = [];

  for (let idx = 0; idx < CANDIDATES.length; idx++) {
    const { army, home } = CANDIDATES[idx];
    const testSeason: Season = { ...season, avgDaysArmy: army, avgDaysHome: home };

    const assignments = generateSchedule({
      season: testSeason,
      soldiers,
      constraints,
      seed: idx + 1,
    });

    const warnings = validateSchedule({
      season: testSeason,
      soldiers,
      assignments,
    });

    const warningDays = countUniqueWarningDays(warnings);
    const score = Math.max(0, 100 - warningDays * 10);
    const notes = buildNotes(warnings, soldiers.length, season.dailyHeadcount);

    results.push({
      avgDaysArmy: army,
      avgDaysHome: home,
      label: buildLabel(army, home),
      warningCount: warningDays,
      feasibilityScore: score,
      notes,
    });
  }

  results.sort((a, b) => a.warningCount - b.warningCount);
  return results.slice(0, MAX_RESULTS);
}

function buildLabel(army: number, home: number): string {
  if (army === home && army === 7) return "שבוע-שבוע";
  return `${army} צבא / ${home} בית`;
}

function buildNotes(
  warnings: readonly ValidationWarning[],
  soldierCount: number,
  headcount: number,
): string[] {
  const notes: string[] = [];

  const headcountDays = countUniqueWarningDays(warnings, "headcount_low");
  const roleDays = countUniqueWarningDays(warnings, "role_missing");

  if (headcountDays > 0) {
    notes.push(`${headcountDays} ימים עם חוסר בכ״א`);
  }
  if (roleDays > 0) {
    notes.push(`${roleDays} ימים עם חוסר בתפקיד`);
  }

  const ratio = soldierCount / headcount;
  if (ratio < 1.5) {
    notes.push("יחס חיילים/מתח נמוך");
  }

  return notes;
}

function countUniqueWarningDays(
  warnings: readonly ValidationWarning[],
  type?: ValidationWarning["type"],
): number {
  const days = new Set<number>();
  for (const w of warnings) {
    if (type && w.type !== type) continue;
    days.add(w.date.getTime());
  }
  return days.size;
}
