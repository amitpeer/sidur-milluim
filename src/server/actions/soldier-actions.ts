"use server";

import * as z from "zod/v4";
import { getApprovedSession } from "@/server/auth/approval";
import {
  getOrCreateSoldierProfile,
  addSeasonMember,
  removeSeasonMember,
  getSeasonMembers,
  updateFarAway,
  updateSoldierProfile,
  getSoldierProfileWithEmail,
  getSoldierProfile,
  isSeasonMember,
  isSeasonAdmin,
} from "@/server/db/stores/soldier-store";
import { prisma } from "@/server/db/client";
import { SOLDIER_ROLES, type SoldierRole } from "@/lib/constants";

const addSoldierSchema = z.object({
  email: z.email("כתובת אימייל לא תקינה"),
  fullName: z.string().min(1, "שם מלא נדרש"),
  phone: z.string().optional(),
  city: z.string().optional(),
});

export type SoldierActionState = {
  error?: string;
  success?: boolean;
};

type PendingApprovalUser = {
  id: string;
  email: string;
  name: string | null;
  createdAt: Date;
};

async function requireSeasonAdmin(seasonId: string) {
  const session = await getApprovedSession();
  if (!session) return null;

  const profile = await getSoldierProfile(session.user.id);
  if (!profile) return null;

  const admin = await isSeasonAdmin(seasonId, profile.id);
  if (!admin) return null;

  return session;
}

export async function addSoldierToSeasonAction(
  seasonId: string,
  _prevState: SoldierActionState,
  formData: FormData,
): Promise<SoldierActionState> {
  const session = await getApprovedSession();
  if (!session) return { error: "לא מחובר" };

  const parsed = addSoldierSchema.safeParse({
    email: formData.get("email"),
    fullName: formData.get("fullName"),
    phone: formData.get("phone") || undefined,
    city: formData.get("city") || undefined,
  });

  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { error: firstError ?? "נתונים לא תקינים" };
  }

  const { email, fullName, phone, city } = parsed.data;

  const rawRoles = formData.getAll("roles") as string[];
  const rolesList = rawRoles.filter((r): r is SoldierRole =>
    (SOLDIER_ROLES as readonly string[]).includes(r),
  );

  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({ data: { email, name: fullName } });
  }

  const soldierProfile = await getOrCreateSoldierProfile(user.id, {
    fullName,
    phone,
    city,
    roles: rolesList,
  });

  await addSeasonMember(seasonId, soldierProfile.id);
  return { success: true };
}

export async function removeSoldierFromSeasonAction(
  seasonId: string,
  soldierProfileId: string,
): Promise<SoldierActionState> {
  const session = await getApprovedSession();
  if (!session) return { error: "לא מחובר" };

  await removeSeasonMember(seasonId, soldierProfileId);
  return { success: true };
}

export async function toggleFarAwayAction(
  profileId: string,
  isFarAway: boolean,
): Promise<SoldierActionState> {
  const session = await getApprovedSession();
  if (!session) return { error: "לא מחובר" };

  await updateFarAway(profileId, isFarAway);
  return { success: true };
}

export async function updateSoldierProfileAction(
  profileId: string,
  field: "city" | "roles" | "fullName",
  value: string | string[],
): Promise<SoldierActionState> {
  const session = await getApprovedSession();
  if (!session) return { error: "לא מחובר" };

  if (field === "fullName") {
    const name = typeof value === "string" ? value.trim() : "";
    if (!name) return { error: "שם מלא נדרש" };
    await updateSoldierProfile(profileId, { fullName: name });
  } else if (field === "city") {
    const cityValue = typeof value === "string" ? value : value[0] ?? "";
    await updateSoldierProfile(profileId, { city: cityValue || null });
  } else if (field === "roles") {
    const rawRoles = Array.isArray(value) ? value : [value];
    const roles = rawRoles.filter((r): r is SoldierRole =>
      (SOLDIER_ROLES as readonly string[]).includes(r),
    );
    await updateSoldierProfile(profileId, { roles });
  }

  return { success: true };
}

export async function getMyProfileAction(seasonId: string) {
  const session = await getApprovedSession();
  if (!session) return null;

  const profile = await getSoldierProfileWithEmail(session.user.id);
  if (!profile) return null;

  const isMember = await isSeasonMember(seasonId, profile.id);
  if (!isMember) return null;

  return {
    id: profile.id,
    fullName: profile.fullName,
    email: profile.user.email,
    city: profile.city,
    roles: profile.roles,
    isFarAway: profile.isFarAway,
  };
}

export async function setMemberRoleAction(
  seasonId: string,
  soldierProfileId: string,
  role: "admin" | "soldier",
): Promise<SoldierActionState> {
  const session = await getApprovedSession();
  if (!session) return { error: "לא מחובר" };

  await addSeasonMember(seasonId, soldierProfileId, role);
  return { success: true };
}

export async function getSeasonMembersAction(seasonId: string) {
  const session = await getApprovedSession();
  if (!session) return [];

  const members = await getSeasonMembers(seasonId);

  return members.map((m) => ({
    ...m,
    soldierProfile: {
      ...m.soldierProfile,
      isFarAway: m.soldierProfile.isFarAway,
    },
  }));
}

export async function getPendingApprovalUsersAction(
  seasonId: string,
): Promise<PendingApprovalUser[]> {
  const session = await requireSeasonAdmin(seasonId);
  if (!session) return [];

  return prisma.user.findMany({
    where: { isApproved: false },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function deleteUserAction(
  seasonId: string,
  userId: string,
): Promise<SoldierActionState> {
  const session = await requireSeasonAdmin(seasonId);
  if (!session) return { error: "אין הרשאה" };

  await prisma.user.delete({ where: { id: userId } });
  return { success: true };
}

export async function approveUserAction(
  seasonId: string,
  userId: string,
): Promise<SoldierActionState> {
  const session = await requireSeasonAdmin(seasonId);
  if (!session) return { error: "אין הרשאה" };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isApproved: true },
  });
  if (!user) return { error: "משתמש לא נמצא" };
  if (user.isApproved) return { success: true };

  const fullUser = await prisma.user.update({
    where: { id: userId },
    data: { isApproved: true },
  });

  const soldierProfile = await getOrCreateSoldierProfile(userId, {
    fullName: fullUser.name ?? fullUser.email ?? "ללא שם",
  });

  await addSeasonMember(seasonId, soldierProfile.id);

  return { success: true };
}
