/**
 * Schedule algorithm benchmark suite.
 *
 * Runs the scheduling algorithm across a matrix of scenarios and records
 * measurable metrics. Results are saved to schedule-benchmark-results.json
 * so we can compare before/after when changing the algorithm.
 *
 * Run with:  npx vitest run src/domain/schedule/schedule-benchmark.test.ts
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { generateSchedule } from "./schedule-generator";
import { validateSchedule } from "./schedule-validator";
import { buildSeason } from "@/test/builders/season.builder";
import { buildSoldier } from "@/test/builders/soldier.builder";
import { dateToString, eachDayInRange, addDays } from "@/lib/date-utils";
import type { Season } from "@/domain/season/season.types";
import type { SeasonSoldier } from "@/domain/soldier/soldier.types";
import type { ScheduleAssignment } from "./schedule.types";

// ---------------------------------------------------------------------------
// Scenario matrix
// ---------------------------------------------------------------------------

const SOLDIER_COUNTS = [10, 15, 20] as const;
const HEADCOUNTS = [3, 5, 7] as const;
const RATIOS = [
  { army: 7, home: 7 },
  { army: 8, home: 6 },
  { army: 9, home: 5 },
  { army: 10, home: 4 },
  { army: 11, home: 3 },
] as const;
const ROLE_CONFIGS = [
  { label: "no-roles", drivers: 0, minDrivers: 0 },
  { label: "2-drivers", drivers: 2, minDrivers: 1 },
] as const;
const CONSTRAINT_DENSITIES = [
  { label: "none", fraction: 0 },
  { label: "light-10pct", fraction: 0.1 },
  { label: "heavy-30pct", fraction: 0.3 },
] as const;

const SEASON_START = new Date("2026-03-01T00:00:00.000Z");
const SEASON_END = new Date("2026-04-11T00:00:00.000Z");
const SEED = 42;

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

interface ScenarioMetrics {
  readonly scenario: string;
  readonly soldierCount: number;
  readonly headcount: number;
  readonly army: number;
  readonly home: number;
  readonly roles: string;
  readonly constraints: string;
  readonly headcountViolationDays: number;
  readonly roleViolationDays: number;
  readonly validatorWarnings: number;
  readonly fairnessVariance: number;
  readonly maxDays: number;
  readonly minDays: number;
  readonly shortBlockCount: number;
  readonly shortBlockPct: number;
  readonly totalBlocks: number;
  readonly avgBlockLength: number;
  readonly durationMs: number;
}

function measureScenario(
  season: Season,
  soldiers: readonly SeasonSoldier[],
  constraints: readonly { soldierProfileId: string; date: Date }[],
  label: string,
): ScenarioMetrics {
  const start = performance.now();
  const assignments = generateSchedule({ season, soldiers, constraints, seed: SEED });
  const durationMs = Math.round(performance.now() - start);

  const warnings = validateSchedule({ season, soldiers, assignments });

  const days = eachDayInRange(season.startDate, season.endDate);
  const opDays = season.trainingEndDate
    ? days.filter((d) => d > season.trainingEndDate!)
    : days;

  // Headcount violations (unique days)
  const headcountViolationDays = countHeadcountViolationDays(
    assignments, opDays, season.dailyHeadcount,
  );

  // Role violations (unique days)
  const roleViolationDays = countRoleViolationDays(
    assignments, opDays, season.roleMinimums, soldiers,
  );

  // Fairness
  const daysPerSoldier = countDaysPerSoldier(assignments, soldiers);
  const counts = [...daysPerSoldier.values()];
  const maxDays = Math.max(...counts);
  const minDays = Math.min(...counts);
  const fairnessVariance = maxDays - minDays;

  // Block quality
  const { shortBlockCount, totalBlocks, avgBlockLength, shortBlockPct } =
    measureBlocks(assignments, soldiers, season.avgDaysArmy);

  return {
    scenario: label,
    soldierCount: soldiers.length,
    headcount: season.dailyHeadcount,
    army: season.avgDaysArmy ?? 7,
    home: season.avgDaysHome ?? 7,
    roles: label.includes("driver") ? "2-drivers" : "no-roles",
    constraints: label.split("|").pop()?.trim() ?? "none",
    headcountViolationDays,
    roleViolationDays,
    validatorWarnings: warnings.length,
    fairnessVariance,
    maxDays,
    minDays,
    shortBlockCount,
    shortBlockPct,
    totalBlocks,
    avgBlockLength,
    durationMs,
  };
}

// ---------------------------------------------------------------------------
// Metric helpers
// ---------------------------------------------------------------------------

function countHeadcountViolationDays(
  assignments: readonly ScheduleAssignment[],
  opDays: readonly Date[],
  headcount: number,
): number {
  let violations = 0;
  for (const day of opDays) {
    const ds = dateToString(day);
    const onBase = assignments.filter(
      (a) => dateToString(a.date) === ds && a.isOnBase && !a.isUnavailable,
    );
    if (onBase.length < headcount) violations++;
  }
  return violations;
}

function countRoleViolationDays(
  assignments: readonly ScheduleAssignment[],
  opDays: readonly Date[],
  roleMinimums: Season["roleMinimums"],
  soldiers: readonly SeasonSoldier[],
): number {
  const entries = Object.entries(roleMinimums) as [string, number][];
  if (entries.length === 0) return 0;

  const violationDays = new Set<string>();
  for (const day of opDays) {
    const ds = dateToString(day);
    const onBase = assignments.filter(
      (a) => dateToString(a.date) === ds && a.isOnBase && !a.isUnavailable,
    );
    for (const [role, min] of entries) {
      const roleCount = onBase.filter((a) => {
        const s = soldiers.find((sol) => sol.id === a.soldierProfileId);
        return s?.roles.includes(role as never);
      }).length;
      if (roleCount < min) violationDays.add(ds);
    }
  }
  return violationDays.size;
}

function countDaysPerSoldier(
  assignments: readonly ScheduleAssignment[],
  soldiers: readonly SeasonSoldier[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const s of soldiers) map.set(s.id, 0);
  for (const a of assignments) {
    if (a.isOnBase) {
      map.set(a.soldierProfileId, (map.get(a.soldierProfileId) ?? 0) + 1);
    }
  }
  return map;
}

function measureBlocks(
  assignments: readonly ScheduleAssignment[],
  soldiers: readonly SeasonSoldier[],
  avgDaysArmy: number | null,
): {
  shortBlockCount: number;
  totalBlocks: number;
  avgBlockLength: number;
  shortBlockPct: number;
} {
  const minBlock = Math.min(4, avgDaysArmy ?? 7);
  let totalBlocks = 0;
  let shortBlockCount = 0;
  let totalBlockLength = 0;

  for (const soldier of soldiers) {
    const blocks = getBlockLengths(assignments, soldier.id);
    totalBlocks += blocks.length;
    totalBlockLength += blocks.reduce((a, b) => a + b, 0);
    shortBlockCount += blocks.filter((b) => b < minBlock).length;
  }

  return {
    shortBlockCount,
    totalBlocks,
    avgBlockLength: totalBlocks > 0
      ? Math.round((totalBlockLength / totalBlocks) * 10) / 10
      : 0,
    shortBlockPct: totalBlocks > 0
      ? Math.round((shortBlockCount / totalBlocks) * 1000) / 10
      : 0,
  };
}

function getBlockLengths(
  assignments: readonly ScheduleAssignment[],
  soldierId: string,
): number[] {
  const dates = assignments
    .filter((a) => a.soldierProfileId === soldierId && a.isOnBase)
    .map((a) => a.date.getTime())
    .sort((a, b) => a - b);

  if (dates.length === 0) return [];

  const blocks: number[] = [];
  let blockLen = 1;
  for (let i = 1; i < dates.length; i++) {
    const diffDays = (dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24);
    if (diffDays === 1) {
      blockLen++;
    } else {
      blocks.push(blockLen);
      blockLen = 1;
    }
  }
  blocks.push(blockLen);
  return blocks;
}

// ---------------------------------------------------------------------------
// Constraint generation (deterministic per scenario)
// ---------------------------------------------------------------------------

function generateConstraints(
  soldiers: readonly SeasonSoldier[],
  fraction: number,
  seasonStart: Date,
  seasonEnd: Date,
): { soldierProfileId: string; date: Date }[] {
  if (fraction === 0) return [];

  const days = eachDayInRange(seasonStart, seasonEnd);
  const totalSlots = soldiers.length * days.length;
  const targetConstraints = Math.round(totalSlots * fraction);
  const constraints: { soldierProfileId: string; date: Date }[] = [];

  // Deterministic spread: every Nth slot
  const step = Math.max(1, Math.floor(totalSlots / targetConstraints));
  for (let i = 0; i < totalSlots && constraints.length < targetConstraints; i += step) {
    const soldierIdx = i % soldiers.length;
    const dayIdx = Math.floor(i / soldiers.length) % days.length;
    constraints.push({
      soldierProfileId: soldiers[soldierIdx].id,
      date: days[dayIdx],
    });
  }

  return constraints;
}

// ---------------------------------------------------------------------------
// Benchmark runner
// ---------------------------------------------------------------------------

function buildScenarioLabel(
  soldierCount: number,
  headcount: number,
  army: number,
  home: number,
  roleLabel: string,
  constraintLabel: string,
): string {
  return `${soldierCount}s|hc${headcount}|${army}/${home}|${roleLabel}|${constraintLabel}`;
}

function isValidCombo(soldierCount: number, headcount: number): boolean {
  return soldierCount >= headcount * 1.3;
}

describe("schedule-benchmark", () => {
  it("runs full benchmark matrix and saves results", { timeout: 120_000 }, () => {
    const results: ScenarioMetrics[] = [];
    let skipped = 0;

    for (const soldierCount of SOLDIER_COUNTS) {
      for (const headcount of HEADCOUNTS) {
        if (!isValidCombo(soldierCount, headcount)) {
          skipped++;
          continue;
        }

        for (const ratio of RATIOS) {
          for (const roleConfig of ROLE_CONFIGS) {
            for (const constraintConfig of CONSTRAINT_DENSITIES) {
              const soldiers: SeasonSoldier[] = [];
              for (let i = 0; i < soldierCount; i++) {
                const roles =
                  roleConfig.drivers > 0 && i < roleConfig.drivers
                    ? (["driver"] as const)
                    : ([] as const);
                soldiers.push(
                  buildSoldier({ roles: [...roles] }),
                );
              }

              const season = buildSeason({
                dailyHeadcount: headcount,
                avgDaysArmy: ratio.army,
                avgDaysHome: ratio.home,
                startDate: SEASON_START,
                endDate: SEASON_END,
                roleMinimums: roleConfig.minDrivers > 0
                  ? { driver: roleConfig.minDrivers }
                  : {},
                cityGroupingEnabled: false,
              });

              const constraints = generateConstraints(
                soldiers,
                constraintConfig.fraction,
                SEASON_START,
                SEASON_END,
              );

              const label = buildScenarioLabel(
                soldierCount,
                headcount,
                ratio.army,
                ratio.home,
                roleConfig.label,
                constraintConfig.label,
              );

              const metrics = measureScenario(season, soldiers, constraints, label);
              results.push(metrics);
            }
          }
        }
      }
    }

    // Save raw results
    const outPath = path.resolve(
      __dirname,
      "schedule-benchmark-results.json",
    );
    fs.writeFileSync(outPath, JSON.stringify(results, null, 2));

    // Print summary table
    printSummary(results);

    // Sanity: we ran a meaningful number of scenarios
    expect(results.length).toBeGreaterThan(50);
    console.log(`\nRan ${results.length} scenarios, skipped ${skipped} invalid combos`);
    console.log(`Results saved to: ${outPath}`);
  });
});

// ---------------------------------------------------------------------------
// Pretty-print summary
// ---------------------------------------------------------------------------

function printSummary(results: readonly ScenarioMetrics[]): void {
  console.log("\n=== SCHEDULE BENCHMARK RESULTS ===\n");

  // Group by ratio for comparison
  const byRatio = new Map<string, ScenarioMetrics[]>();
  for (const r of results) {
    const key = `${r.army}/${r.home}`;
    const arr = byRatio.get(key) ?? [];
    arr.push(r);
    byRatio.set(key, arr);
  }

  // Aggregate stats per ratio
  console.log("--- Per ratio aggregate ---");
  console.log(
    padR("Ratio", 8),
    padR("AvgHCViol", 10),
    padR("AvgRoleViol", 12),
    padR("AvgFairVar", 11),
    padR("AvgShort%", 10),
    padR("AvgWarn", 8),
    padR("AvgMs", 6),
  );
  for (const [ratio, items] of byRatio) {
    const avg = (fn: (m: ScenarioMetrics) => number) =>
      round(items.reduce((s, m) => s + fn(m), 0) / items.length);
    console.log(
      padR(ratio, 8),
      padR(String(avg((m) => m.headcountViolationDays)), 10),
      padR(String(avg((m) => m.roleViolationDays)), 12),
      padR(String(avg((m) => m.fairnessVariance)), 11),
      padR(String(avg((m) => m.shortBlockPct)) + "%", 10),
      padR(String(avg((m) => m.validatorWarnings)), 8),
      padR(String(avg((m) => m.durationMs)), 6),
    );
  }

  // Aggregate stats per role config
  console.log("\n--- Drivers vs no-roles ---");
  console.log(
    padR("Roles", 12),
    padR("AvgFairVar", 11),
    padR("MaxFairVar", 11),
    padR("AvgMaxDays", 11),
    padR("AvgMinDays", 11),
  );
  const byRole = new Map<string, ScenarioMetrics[]>();
  for (const r of results) {
    const arr = byRole.get(r.roles) ?? [];
    arr.push(r);
    byRole.set(r.roles, arr);
  }
  for (const [role, items] of byRole) {
    const avg = (fn: (m: ScenarioMetrics) => number) =>
      round(items.reduce((s, m) => s + fn(m), 0) / items.length);
    const max = (fn: (m: ScenarioMetrics) => number) =>
      Math.max(...items.map(fn));
    console.log(
      padR(role, 12),
      padR(String(avg((m) => m.fairnessVariance)), 11),
      padR(String(max((m) => m.fairnessVariance)), 11),
      padR(String(avg((m) => m.maxDays)), 11),
      padR(String(avg((m) => m.minDays)), 11),
    );
  }

  // Worst scenarios
  console.log("\n--- 10 worst by fairness variance ---");
  const worstFairness = [...results]
    .sort((a, b) => b.fairnessVariance - a.fairnessVariance)
    .slice(0, 10);
  for (const m of worstFairness) {
    console.log(
      `  ${m.scenario}: variance=${m.fairnessVariance} (${m.minDays}-${m.maxDays}) hcViol=${m.headcountViolationDays} roleViol=${m.roleViolationDays}`,
    );
  }

  console.log("\n--- 10 worst by headcount violations ---");
  const worstHC = [...results]
    .sort((a, b) => b.headcountViolationDays - a.headcountViolationDays)
    .slice(0, 10);
  for (const m of worstHC) {
    console.log(
      `  ${m.scenario}: hcViol=${m.headcountViolationDays} roleViol=${m.roleViolationDays} fairness=${m.fairnessVariance}`,
    );
  }
}

function padR(str: string, len: number): string {
  return str.padEnd(len);
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
