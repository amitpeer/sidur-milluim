-- AlterTable
ALTER TABLE "Season" ADD COLUMN IF NOT EXISTS "minConsecutiveDays" INTEGER;
ALTER TABLE "Season" RENAME COLUMN "maxConsecutiveDays" TO "avgDaysArmy";
ALTER TABLE "Season" RENAME COLUMN "minConsecutiveDays" TO "avgDaysHome";
