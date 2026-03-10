/*
  Warnings:

  - You are about to drop the column `baseLat` on the `Season` table. All the data in the column will be lost.
  - You are about to drop the column `baseLng` on the `Season` table. All the data in the column will be lost.
  - You are about to drop the column `baseLocation` on the `Season` table. All the data in the column will be lost.
  - You are about to drop the column `farAwayThresholdKm` on the `Season` table. All the data in the column will be lost.
  - You are about to drop the column `distanceKm` on the `SoldierProfile` table. All the data in the column will be lost.
  - You are about to drop the column `isFarAwayOverride` on the `SoldierProfile` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Season" DROP COLUMN "baseLat",
DROP COLUMN "baseLng",
DROP COLUMN "baseLocation",
DROP COLUMN "farAwayThresholdKm",
ADD COLUMN     "trainingEndDate" DATE;

-- AlterTable
ALTER TABLE "SoldierProfile" DROP COLUMN "distanceKm",
DROP COLUMN "isFarAwayOverride",
ADD COLUMN     "isFarAway" BOOLEAN NOT NULL DEFAULT false;
