/**
 * Schedule algorithm benchmark.
 *
 * Loads real data from fixtures/real-data.json (no DB needed) and measures
 * the current algorithm against key metrics. Results are saved to
 * results/<timestamp>.json with an auto-generated summary.
 *
 * Run:  npx vitest run src/domain/schedule/benchmarks/benchmark.test.ts
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { generateSchedule } from "../schedule-generator";
import { dateToString, eachDayInRange } from "@/lib/date-utils";
import type { Season } from "@/domain/season/season.types";
import type { SeasonSoldier } from "@/domain/soldier/soldier.types";
import type { SoldierRole } from "@/lib/constants";
import type { ScheduleAssignment } from "../schedule.types";

interface FixtureSeason {
  readonly id: string;
  readonly name: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly trainingEndDate: string | null;
  readonly dailyHeadcount: number;
  readonly roleMinimums: Partial<Record<SoldierRole, number>>;
  readonly constraintDeadline: string | null;
  readonly isActive: boolean;
  readonly cityGroupingEnabled: boolean;
  readonly avgDaysArmy: number | null;
  readonly avgDaysHome: number | null;
  readonly farAwayExtraDays: number | null;
}

interface FixtureSoldier {
  readonly id: string;
  readonly fullName: string;
  readonly phone: string | null;
  readonly city: string | null;
  readonly roles: SoldierRole[];
  readonly isFarAway: boolean;
  readonly memberRole: "admin" | "soldier";
}

interface Fixture {
  readonly name: string;
  readonly season: FixtureSeason;
  readonly soldiers: FixtureSoldier[];
  readonly constraints: { soldierProfileId: string; date: string }[];
}

interface BenchmarkResult {
  readonly scenarioName: string;
  readonly config: {
    soldiers: number;
    headcount: number;
    avgDaysArmy: number | null;
    avgDaysHome: number | null;
    roleMinimums: Partial<Record<SoldierRole, number>>;
    constraints: number;
    cityGrouping: boolean;
  };
  readonly metrics: {
    durationMs: number;
    headcountViolations: number;
    totalOpDays: number;
    roleViolations: number;
    constraintViolations: number;
    totalConstraints: number;
    fairnessVariance: number;
    minDays: number;
    maxDays: number;
    shortBlockCount: number;
    totalBlocks: number;
    shortBlockPct: number;
    blockDistribution: Record<number, number>;
  };
  readonly perSoldier: {
    name: string;
    days: number;
    roles: string[];
    isFarAway: boolean;
  }[];
}

function loadFixtures(): Fixture[] {
  const fixturePath = path.resolve(__dirname, "fixtures/real-data.json");
  return JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
}

function parseSeason(fixture: Fixture): Season {
  const s = fixture.season;
  return {
    id: s.id,
    name: s.name,
    startDate: new Date(s.startDate),
    endDate: new Date(s.endDate),
    trainingEndDate: s.trainingEndDate ? new Date(s.trainingEndDate) : null,
    dailyHeadcount: s.dailyHeadcount,
    roleMinimums: s.roleMinimums as Partial<Record<SoldierRole, number>>,
    constraintDeadline: s.constraintDeadline ? new Date(s.constraintDeadline) : null,
    isActive: s.isActive,
    cityGroupingEnabled: s.cityGroupingEnabled,
    avgDaysArmy: s.avgDaysArmy,
    avgDaysHome: s.avgDaysHome,
    farAwayExtraDays: s.farAwayExtraDays,
  };
}

function parseConstraints(
  fixture: Fixture,
): { soldierProfileId: string; date: Date }[] {
  return fixture.constraints.map((c) => ({
    soldierProfileId: c.soldierProfileId,
    date: new Date(c.date),
  }));
}

function measure(
  season: Season,
  soldiers: readonly SeasonSoldier[],
  constraints: readonly { soldierProfileId: string; date: Date }[],
  scenarioName: string,
): BenchmarkResult {
  const start = performance.now();
  const assignments = generateSchedule({ season, soldiers, constraints, seed: 42 });
  const durationMs = Math.round(performance.now() - start);

  const days = eachDayInRange(season.startDate, season.endDate);
  const opDays = season.trainingEndDate
    ? days.filter((d) => d > season.trainingEndDate!)
    : days;

  const headcountViolations = countHeadcountViolations(assignments, opDays, season.dailyHeadcount);
  const roleViolations = countRoleViolations(assignments, opDays, season.roleMinimums, soldiers);
  const constraintViolations = countConstraintViolations(assignments, constraints);
  const { fairnessVariance, minDays, maxDays, perSoldier } = measureFairness(assignments, soldiers);
  const { shortBlockCount, totalBlocks, shortBlockPct, blockDistribution } =
    measureBlocks(assignments, soldiers, season.avgDaysArmy);

  return {
    scenarioName,
    config: {
      soldiers: soldiers.length,
      headcount: season.dailyHeadcount,
      avgDaysArmy: season.avgDaysArmy,
      avgDaysHome: season.avgDaysHome,
      roleMinimums: season.roleMinimums,
      constraints: constraints.length,
      cityGrouping: season.cityGroupingEnabled,
    },
    metrics: {
      durationMs,
      headcountViolations,
      totalOpDays: opDays.length,
      roleViolations,
      constraintViolations,
      totalConstraints: constraints.length,
      fairnessVariance,
      minDays,
      maxDays,
      shortBlockCount,
      totalBlocks,
      shortBlockPct,
      blockDistribution,
    },
    perSoldier,
  };
}

function countHeadcountViolations(
  assignments: readonly ScheduleAssignment[],
  opDays: readonly Date[],
  headcount: number,
): number {
  let violations = 0;
  for (const day of opDays) {
    const ds = dateToString(day);
    const count = assignments.filter(
      (a) => dateToString(a.date) === ds && a.isOnBase && !a.isUnavailable,
    ).length;
    if (count !== headcount) violations++;
  }
  return violations;
}

function countRoleViolations(
  assignments: readonly ScheduleAssignment[],
  opDays: readonly Date[],
  roleMinimums: Partial<Record<SoldierRole, number>>,
  soldiers: readonly SeasonSoldier[],
): number {
  const entries = Object.entries(roleMinimums) as [SoldierRole, number][];
  if (entries.length === 0) return 0;

  let violations = 0;
  for (const day of opDays) {
    const ds = dateToString(day);
    const onBase = assignments.filter(
      (a) => dateToString(a.date) === ds && a.isOnBase,
    );
    for (const [role, min] of entries) {
      const roleCount = onBase.filter((a) => {
        const s = soldiers.find((sol) => sol.id === a.soldierProfileId);
        return s?.roles.includes(role);
      }).length;
      if (roleCount < min) violations++;
    }
  }
  return violations;
}

function countConstraintViolations(
  assignments: readonly ScheduleAssignment[],
  constraints: readonly { soldierProfileId: string; date: Date }[],
): number {
  let violations = 0;
  for (const c of constraints) {
    const match = assignments.find(
      (a) =>
        a.soldierProfileId === c.soldierProfileId &&
        dateToString(a.date) === dateToString(c.date) &&
        a.isOnBase,
    );
    if (match) violations++;
  }
  return violations;
}

function measureFairness(
  assignments: readonly ScheduleAssignment[],
  soldiers: readonly SeasonSoldier[],
): {
  fairnessVariance: number;
  minDays: number;
  maxDays: number;
  perSoldier: BenchmarkResult["perSoldier"];
} {
  const daysMap = new Map<string, number>();
  for (const s of soldiers) daysMap.set(s.id, 0);
  for (const a of assignments) {
    if (a.isOnBase) {
      daysMap.set(a.soldierProfileId, (daysMap.get(a.soldierProfileId) ?? 0) + 1);
    }
  }

  const counts = [...daysMap.values()];
  const maxDays = Math.max(...counts);
  const minDays = Math.min(...counts);

  const perSoldier = soldiers
    .map((s) => ({
      name: s.fullName,
      days: daysMap.get(s.id) ?? 0,
      roles: [...s.roles],
      isFarAway: s.isFarAway,
    }))
    .sort((a, b) => b.days - a.days);

  return { fairnessVariance: maxDays - minDays, minDays, maxDays, perSoldier };
}

function measureBlocks(
  assignments: readonly ScheduleAssignment[],
  soldiers: readonly SeasonSoldier[],
  avgDaysArmy: number | null,
): {
  shortBlockCount: number;
  totalBlocks: number;
  shortBlockPct: number;
  blockDistribution: Record<number, number>;
} {
  const minBlock = Math.min(4, avgDaysArmy ?? 7);
  let totalBlocks = 0;
  let shortBlockCount = 0;
  const dist: Record<number, number> = {};

  for (const soldier of soldiers) {
    const dates = assignments
      .filter((a) => a.soldierProfileId === soldier.id && a.isOnBase)
      .map((a) => a.date.getTime())
      .sort((a, b) => a - b);

    if (dates.length === 0) continue;

    let blockLen = 1;
    for (let i = 1; i < dates.length; i++) {
      const diff = (dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24);
      if (diff === 1) {
        blockLen++;
      } else {
        totalBlocks++;
        if (blockLen < minBlock) shortBlockCount++;
        dist[blockLen] = (dist[blockLen] ?? 0) + 1;
        blockLen = 1;
      }
    }
    totalBlocks++;
    if (blockLen < minBlock) shortBlockCount++;
    dist[blockLen] = (dist[blockLen] ?? 0) + 1;
  }

  return {
    shortBlockCount,
    totalBlocks,
    shortBlockPct: totalBlocks > 0
      ? Math.round((shortBlockCount / totalBlocks) * 1000) / 10
      : 0,
    blockDistribution: dist,
  };
}

function printResult(r: BenchmarkResult): void {
  console.log(`\n========== ${r.scenarioName} ==========`);
  console.log(`Config: ${r.config.soldiers} soldiers, hc=${r.config.headcount}, ` +
    `army=${r.config.avgDaysArmy}/${r.config.avgDaysHome}, ` +
    `roles=${JSON.stringify(r.config.roleMinimums)}, ` +
    `constraints=${r.config.constraints}`);
  console.log(`Duration: ${r.metrics.durationMs}ms`);
  console.log(`Headcount violations: ${r.metrics.headcountViolations} / ${r.metrics.totalOpDays}`);
  console.log(`Role violations: ${r.metrics.roleViolations}`);
  console.log(`Constraint violations: ${r.metrics.constraintViolations} / ${r.metrics.totalConstraints}`);
  console.log(`Fairness: ${r.metrics.minDays}-${r.metrics.maxDays} (variance=${r.metrics.fairnessVariance})`);
  console.log(`Short blocks (<4d): ${r.metrics.shortBlockCount}/${r.metrics.totalBlocks} (${r.metrics.shortBlockPct}%)`);

  const sortedDist = Object.entries(r.metrics.blockDistribution)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([size, count]) => `${size}d:${count}`)
    .join(", ");
  console.log(`Blocks: ${sortedDist}`);

  console.log(`Per soldier:`);
  for (const s of r.perSoldier) {
    const tags = [
      ...s.roles.map((r) => `[${r}]`),
      ...(s.isFarAway ? ["[far]"] : []),
    ].join("");
    console.log(`  ${String(s.days).padStart(2)}d  ${s.name} ${tags}`);
  }
}

describe("schedule-benchmark", () => {
  it("benchmarks current algorithm", { timeout: 60_000 }, () => {
    const fixtures = loadFixtures();
    const results: BenchmarkResult[] = [];

    for (const fixture of fixtures) {
      const season = parseSeason(fixture);
      const soldiers = fixture.soldiers as SeasonSoldier[];
      const constraints = parseConstraints(fixture);

      const result = measure(season, soldiers, constraints, fixture.name);
      results.push(result);
      printResult(result);
    }

    // Save results with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const outPath = path.resolve(__dirname, `results/${timestamp}.json`);
    fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
    console.log(`\nResults saved to: ${outPath}`);

    expect(results.length).toBeGreaterThan(0);
  });

});
