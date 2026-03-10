"use server";

import * as z from "zod/v4";
import { auth } from "@/server/auth/auth";
import { redirect } from "next/navigation";
import {
  createSeason,
  getSeasonById,
  getActiveSeasons,
  updateSeason,
  deleteSeason,
} from "@/server/db/stores/season-store";
import {
  getOrCreateSoldierProfile,
  addSeasonMember,
  isSeasonAdmin,
} from "@/server/db/stores/soldier-store";

const createSeasonSchema = z.object({
  name: z.string().min(1, "שם עונה נדרש"),
  startDate: z.string().min(1, "תאריך התחלה נדרש"),
  endDate: z.string().min(1, "תאריך סיום נדרש"),
  dailyHeadcount: z.coerce.number().int().min(1).default(8),
  trainingEndDate: z.string().optional(),
});

export type CreateSeasonState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export async function createSeasonAction(
  _prevState: CreateSeasonState,
  formData: FormData,
): Promise<CreateSeasonState> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "לא מחובר" };
  }

  const parsed = createSeasonSchema.safeParse({
    name: formData.get("name"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    dailyHeadcount: formData.get("dailyHeadcount"),
    trainingEndDate: formData.get("trainingEndDate") || undefined,
  });

  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const { name, startDate, endDate, dailyHeadcount, trainingEndDate } =
    parsed.data;

  const season = await createSeason({
    name,
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    dailyHeadcount,
    trainingEndDate: trainingEndDate ? new Date(trainingEndDate) : null,
  });

  const soldierProfile = await getOrCreateSoldierProfile(session.user.id, {
    fullName: session.user.name ?? "Unknown",
  });
  await addSeasonMember(season.id, soldierProfile.id, "admin");

  redirect(`/season/${season.id}/board`);
}

export async function getSeasonAction(id: string) {
  const session = await auth();
  if (!session?.user?.id) return null;
  return getSeasonById(id);
}

export async function getActiveSeasonsAction() {
  const session = await auth();
  if (!session?.user?.id) return [];
  return getActiveSeasons();
}

const updateSeasonSchema = z.object({
  name: z.string().min(1).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  dailyHeadcount: z.coerce.number().int().min(1).optional(),
  trainingEndDate: z.string().optional(),
  constraintDeadline: z.string().optional(),
  roleMinimums: z.string().optional(),
  cityGroupingEnabled: z.string().optional(),
  maxConsecutiveDays: z.string().optional(),
});

export async function updateSeasonAction(
  seasonId: string,
  _prevState: CreateSeasonState,
  formData: FormData,
): Promise<CreateSeasonState> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "לא מחובר" };
  }

  const parsed = updateSeasonSchema.safeParse({
    name: formData.get("name") || undefined,
    startDate: formData.get("startDate") || undefined,
    endDate: formData.get("endDate") || undefined,
    dailyHeadcount: formData.get("dailyHeadcount") || undefined,
    trainingEndDate: formData.get("trainingEndDate") || undefined,
    constraintDeadline: formData.get("constraintDeadline") || undefined,
    roleMinimums: formData.get("roleMinimums") || undefined,
    cityGroupingEnabled: formData.get("cityGroupingEnabled") || undefined,
    maxConsecutiveDays: formData.get("maxConsecutiveDays") ?? undefined,
  });

  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const data: Parameters<typeof updateSeason>[1] = {};
  if (parsed.data.name) data.name = parsed.data.name;
  if (parsed.data.startDate) {
    const start = new Date(parsed.data.startDate);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    if (start < today) return { error: "תאריך התחלה לא יכול להיות בעבר" };
    if (parsed.data.endDate && start > new Date(parsed.data.endDate)) {
      return { error: "תאריך התחלה חייב להיות לפני תאריך סיום" };
    }
    data.startDate = start;
  }
  if (parsed.data.endDate) data.endDate = new Date(parsed.data.endDate);
  if (parsed.data.dailyHeadcount) data.dailyHeadcount = parsed.data.dailyHeadcount;
  if (parsed.data.trainingEndDate !== undefined) {
    data.trainingEndDate = parsed.data.trainingEndDate
      ? new Date(parsed.data.trainingEndDate)
      : null;
  }
  if (parsed.data.constraintDeadline !== undefined) {
    data.constraintDeadline = parsed.data.constraintDeadline
      ? new Date(parsed.data.constraintDeadline)
      : null;
  }
  if (parsed.data.roleMinimums !== undefined) {
    try {
      data.roleMinimums = JSON.parse(parsed.data.roleMinimums);
    } catch {
      return { error: "פורמט מינימום תפקידים לא תקין" };
    }
  }
  if (parsed.data.cityGroupingEnabled !== undefined) {
    data.cityGroupingEnabled = parsed.data.cityGroupingEnabled === "true";
  }
  if (parsed.data.maxConsecutiveDays !== undefined) {
    const raw = parsed.data.maxConsecutiveDays.trim();
    data.maxConsecutiveDays = raw === "" ? null : parseInt(raw, 10);
  }

  await updateSeason(seasonId, data);
  return {};
}

export async function deleteSeasonAction(
  seasonId: string,
): Promise<CreateSeasonState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "לא מחובר" };

  const profile = await getOrCreateSoldierProfile(session.user.id, {
    fullName: session.user.name ?? "Unknown",
  });

  const admin = await isSeasonAdmin(seasonId, profile.id);
  if (!admin) return { error: "אין הרשאה" };

  await deleteSeason(seasonId);
  redirect("/");
}
