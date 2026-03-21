/**
 * Export real DB data as JSON fixtures for benchmarking.
 *
 * Run only when production data changes (new soldiers, constraints, season config).
 * Requires DATABASE_URL in .env.
 *
 * Usage:  npx vitest run src/domain/schedule/benchmarks/export-fixtures.test.ts
 */
import { describe, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import dotenv from "dotenv";

dotenv.config();

describe("export-fixtures", () => {
  it("exports active seasons from DB", { timeout: 30_000 }, async () => {
    const { prisma } = await import("@/server/db/client");

    const seasons = await prisma.season.findMany({
      where: { isActive: true },
      include: {
        members: { include: { soldierProfile: true } },
      },
    });

    const fixtures = [];

    for (const season of seasons) {
      const constraints = await prisma.dayOffConstraint.findMany({
        where: { seasonId: season.id },
        select: { soldierProfileId: true, date: true },
      });

      fixtures.push({
        name: season.name,
        season: {
          id: season.id,
          name: season.name,
          startDate: season.startDate.toISOString(),
          endDate: season.endDate.toISOString(),
          trainingEndDate: season.trainingEndDate?.toISOString() ?? null,
          dailyHeadcount: season.dailyHeadcount,
          roleMinimums: season.roleMinimums,
          constraintDeadline: season.constraintDeadline?.toISOString() ?? null,
          isActive: season.isActive,
          cityGroupingEnabled: season.cityGroupingEnabled,
          avgDaysArmy: season.avgDaysArmy,
          avgDaysHome: season.avgDaysHome,
          farAwayExtraDays: season.farAwayExtraDays,
        },
        soldiers: season.members.map((m) => ({
          id: m.soldierProfile.id,
          fullName: m.soldierProfile.fullName,
          phone: m.soldierProfile.phone,
          city: m.soldierProfile.city,
          roles: m.soldierProfile.roles,
          isFarAway: m.soldierProfile.isFarAway,
          memberRole: m.role,
        })),
        constraints: constraints.map((c) => ({
          soldierProfileId: c.soldierProfileId,
          date: c.date.toISOString(),
        })),
      });

      console.log(`Exported "${season.name}": ${season.members.length} soldiers, ${constraints.length} constraints`);
    }

    const outPath = path.resolve(__dirname, "fixtures/real-data.json");
    fs.writeFileSync(outPath, JSON.stringify(fixtures, null, 2));
    console.log(`\nSaved to: ${outPath}`);
  });
});
