"use server";

import { auth } from "@/server/auth/auth";
import {
  addDayOffConstraint,
  addDayOffConstraintBatch,
  removeDayOffConstraint,
  removeConstraintGroup,
  getConstraintsForSeason,
  getConstraintsForSoldier,
  updateConstraint,
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
  reason?: string,
): Promise<ConstraintActionState> {
  const deadlineError = await checkConstraintDeadline(seasonId);
  if (deadlineError) return deadlineError;

  const date = new Date(dateStr + "T00:00:00.000Z");
  await addDayOffConstraint({ seasonId, soldierProfileId, date, reason });
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

export async function addConstraintGroupAction(
  seasonId: string,
  dateStrings: string[],
  reason?: string,
): Promise<ConstraintActionState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "לא מחובר" };

  const profile = await getSoldierProfile(session.user.id);
  if (!profile) return { error: "פרופיל לא נמצא" };

  const deadlineError = await checkConstraintDeadline(seasonId);
  if (deadlineError) return deadlineError;

  const dates = dateStrings.map((s) => new Date(s + "T00:00:00.000Z"));
  const groupId = crypto.randomUUID();

  await addDayOffConstraintBatch({
    seasonId,
    soldierProfileId: profile.id,
    dates,
    reason,
    groupId,
  });

  return { success: true };
}

export async function removeConstraintGroupAction(
  seasonId: string,
  groupId: string,
): Promise<ConstraintActionState> {
  const deadlineError = await checkConstraintDeadline(seasonId);
  if (deadlineError) return deadlineError;

  await removeConstraintGroup(groupId);
  return { success: true };
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

export async function adminEditConstraintAction(
  constraintId: string,
  seasonId: string,
  updates: { reason?: string | null },
): Promise<ConstraintActionState> {
  const { isAdmin, error } = await verifyAdmin(seasonId);
  if (!isAdmin) return { error: error! };

  await updateConstraint(constraintId, updates);
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
  reason?: string,
): Promise<ConstraintActionState> {
  const { isAdmin, error } = await verifyAdmin(seasonId);
  if (!isAdmin) return { error: error! };

  const dates = dateStrings.map((s) => new Date(s + "T00:00:00.000Z"));
  const groupId = crypto.randomUUID();

  await addDayOffConstraintBatch({
    seasonId,
    soldierProfileId,
    dates,
    reason,
    groupId,
  });

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
