"use server";

import { auth } from "@/server/auth/auth";
import { getSoldierProfile } from "@/server/db/stores/soldier-store";
import { getConstraintsForSoldier } from "@/server/db/stores/constraint-store";
import { getActiveSheetUrl } from "@/server/db/stores/sheet-store";
import { getConstraintDeadline } from "@/server/db/stores/season-store";
import { getActiveScheduleVersionId } from "@/server/db/stores/schedule-store";

interface HomePageData {
  readonly hasCity: boolean;
  readonly hasConstraints: boolean;
  readonly constraintDeadline: Date | null;
  readonly hasActiveSchedule: boolean;
  readonly sheetUrl: string | null;
}

export async function getHomePageDataAction(
  seasonId: string,
): Promise<HomePageData | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const profile = await getSoldierProfile(session.user.id);
  if (!profile) return null;

  const [constraints, sheetUrl, season, activeVersion] = await Promise.all([
    getConstraintsForSoldier(seasonId, profile.id),
    getActiveSheetUrl(seasonId),
    getConstraintDeadline(seasonId),
    getActiveScheduleVersionId(seasonId),
  ]);

  return {
    hasCity: !!profile.city,
    hasConstraints: constraints.length > 0,
    constraintDeadline: season?.constraintDeadline ?? null,
    hasActiveSchedule: !!activeVersion,
    sheetUrl: sheetUrl ?? null,
  };
}
