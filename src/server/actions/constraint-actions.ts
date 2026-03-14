"use server";

import { auth } from "@/server/auth/auth";
import {
  addDayOffConstraint,
  removeDayOffConstraint,
  getConstraintsForSeason,
  getConstraintsForSoldier,
  deleteConstraint,
} from "@/server/db/stores/constraint-store";
import { getSeasonSchedule, getSeasonDates, getConstraintDeadline } from "@/server/db/stores/season-store";
import { getSoldierProfile, isSeasonMember, isSeasonAdmin, getSeasonMemberNames } from "@/server/db/stores/soldier-store";

export type ConstraintActionState = {
  error?: string;
  success?: boolean;
};

export async function addConstraintAction(
  seasonId: string,
  soldierProfileId: string,
  dateStr: string,
): Promise<ConstraintActionState> {
  const deadlineError = await checkConstraintDeadline(seasonId);
  if (deadlineError) return deadlineError;

  const date = new Date(dateStr + "T00:00:00.000Z");
  await addDayOffConstraint({ seasonId, soldierProfileId, date });
  return { success: true };
}

export async function removeConstraintAction(
  seasonId: string,
  soldierProfileId: string,
  dateStr: string,
): Promise<ConstraintActionState> {
  const deadlineError = await checkConstraintDeadline(seasonId);
  if (deadlineError) return deadlineError;

  const date = new Date(dateStr + "T00:00:00.000Z");
  await removeDayOffConstraint(seasonId, soldierProfileId, date);
  return { success: true };
}

export async function getSeasonConstraintsAction(seasonId: string) {
  const session = await auth();
  if (!session?.user?.id) return [];
  return getConstraintsForSeason(seasonId);
}

export async function getMyConstraintsAction(seasonId: string) {
  const session = await auth();
  if (!session?.user?.id) return [];

  const profile = await getSoldierProfile(session.user.id);
  if (!profile) return [];

  return getConstraintsForSoldier(seasonId, profile.id);
}

export async function getMyProfileIdAction(
  seasonId: string,
): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const profile = await getSoldierProfile(session.user.id);
  if (!profile) return null;

  const isMember = await isSeasonMember(seasonId, profile.id);
  if (!isMember) return null;

  return profile.id;
}

async function verifyAdmin(seasonId: string): Promise<{ isAdmin: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { isAdmin: false, error: "לא מחובר" };

  const profile = await getSoldierProfile(session.user.id);
  if (!profile) return { isAdmin: false, error: "אין הרשאה" };

  const admin = await isSeasonAdmin(seasonId, profile.id);
  if (!admin) return { isAdmin: false, error: "אין הרשאה" };

  return { isAdmin: true };
}

async function checkConstraintDeadline(
  seasonId: string,
): Promise<ConstraintActionState | null> {
  const session = await auth();
  if (!session?.user?.id) return { error: "לא מחובר" };

  const profile = await getSoldierProfile(session.user.id);
  if (!profile) return { error: "פרופיל לא נמצא" };

  const admin = await isSeasonAdmin(seasonId, profile.id);
  if (admin) return null;

  const season = await getConstraintDeadline(seasonId);
  if (!season) return { error: "עונה לא נמצאה" };

  if (season.constraintDeadline && new Date() > new Date(season.constraintDeadline)) {
    return { error: "המועד האחרון להגשת אילוצים עבר" };
  }

  return null;
}

export async function saveConstraintChangesAction(
  seasonId: string,
  adds: string[],
  removes: string[],
): Promise<ConstraintActionState> {
  const deadlineError = await checkConstraintDeadline(seasonId);
  if (deadlineError) return deadlineError;

  const session = await auth();
  if (!session?.user?.id) return { error: "לא מחובר" };

  const profile = await getSoldierProfile(session.user.id);
  if (!profile) return { error: "פרופיל לא נמצא" };

  for (const dateStr of removes) {
    const date = new Date(dateStr + "T00:00:00.000Z");
    await removeDayOffConstraint(seasonId, profile.id, date);
  }

  for (const dateStr of adds) {
    const date = new Date(dateStr + "T00:00:00.000Z");
    await addDayOffConstraint({ seasonId, soldierProfileId: profile.id, date });
  }

  return { success: true };
}

export async function adminDeleteConstraintAction(
  constraintId: string,
  seasonId: string,
): Promise<ConstraintActionState> {
  const { isAdmin, error } = await verifyAdmin(seasonId);
  if (!isAdmin) return { error: error! };

  await deleteConstraint(constraintId);
  return { success: true };
}

export async function getProfileCompletionStatusAction(
  seasonId: string,
): Promise<{ hasCity: boolean; hasConstraints: boolean } | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const profile = await getSoldierProfile(session.user.id);
  if (!profile) return null;

  const constraints = await getConstraintsForSoldier(seasonId, profile.id);
  return {
    hasCity: !!profile.city,
    hasConstraints: constraints.length > 0,
  };
}

export async function getConstraintsPageDataAction(seasonId: string) {
  const session = await auth();
  if (!session?.user?.id) return null;

  const profile = await getSoldierProfile(session.user.id);
  if (!profile) return null;

  const [season, constraints, isMember] = await Promise.all([
    getSeasonSchedule(seasonId),
    getConstraintsForSoldier(seasonId, profile.id),
    isSeasonMember(seasonId, profile.id),
  ]);
  if (!season || !isMember) return null;

  return {
    season,
    constraints,
    profileId: profile.id,
  };
}

export async function adminAddConstraintAction(
  seasonId: string,
  soldierProfileId: string,
  dateStrings: string[],
): Promise<ConstraintActionState> {
  const { isAdmin, error } = await verifyAdmin(seasonId);
  if (!isAdmin) return { error: error! };

  for (const s of dateStrings) {
    const date = new Date(s + "T00:00:00.000Z");
    await addDayOffConstraint({ seasonId, soldierProfileId, date });
  }

  return { success: true };
}

export async function getAdminConstraintsPageDataAction(seasonId: string) {
  const session = await auth();
  if (!session?.user?.id) return null;

  const [constraints, members, seasonDates] = await Promise.all([
    getConstraintsForSeason(seasonId),
    getSeasonMemberNames(seasonId),
    getSeasonDates(seasonId),
  ]);
  if (!seasonDates) return null;

  return { constraints, members, seasonDates };
}
