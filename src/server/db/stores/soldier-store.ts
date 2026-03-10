import { prisma } from "@/server/db/client";

export async function getOrCreateSoldierProfile(userId: string, data: {
  fullName: string;
  phone?: string;
  city?: string;
  roles?: string[];
}) {
  return prisma.soldierProfile.upsert({
    where: { userId },
    create: {
      userId,
      fullName: data.fullName,
      phone: data.phone ?? null,
      city: data.city ?? null,
      roles: data.roles ?? [],
    },
    update: {
      fullName: data.fullName,
      phone: data.phone,
      city: data.city,
      roles: data.roles,
    },
  });
}

export async function getSoldierProfile(userId: string) {
  return prisma.soldierProfile.findUnique({
    where: { userId },
  });
}

export async function getSoldierProfileWithEmail(userId: string) {
  return prisma.soldierProfile.findUnique({
    where: { userId },
    include: { user: { select: { email: true } } },
  });
}

export async function getSoldierProfileById(id: string) {
  return prisma.soldierProfile.findUnique({
    where: { id },
  });
}

export async function updateSoldierProfile(
  id: string,
  data: {
    fullName?: string;
    phone?: string | null;
    city?: string | null;
    roles?: string[];
    isFarAway?: boolean;
  },
) {
  return prisma.soldierProfile.update({ where: { id }, data });
}

export async function updateFarAway(profileId: string, isFarAway: boolean) {
  return prisma.soldierProfile.update({
    where: { id: profileId },
    data: { isFarAway },
  });
}

export async function addSeasonMember(
  seasonId: string,
  soldierProfileId: string,
  role: string = "soldier",
) {
  return prisma.seasonMember.upsert({
    where: {
      seasonId_soldierProfileId: { seasonId, soldierProfileId },
    },
    create: { seasonId, soldierProfileId, role },
    update: { role },
  });
}

export async function removeSeasonMember(
  seasonId: string,
  soldierProfileId: string,
) {
  return prisma.seasonMember.delete({
    where: {
      seasonId_soldierProfileId: { seasonId, soldierProfileId },
    },
  });
}

export async function isSeasonMember(
  seasonId: string,
  soldierProfileId: string,
) {
  const member = await prisma.seasonMember.findUnique({
    where: {
      seasonId_soldierProfileId: { seasonId, soldierProfileId },
    },
    select: { id: true },
  });
  return !!member;
}

export async function isSeasonAdmin(
  seasonId: string,
  soldierProfileId: string,
) {
  const member = await prisma.seasonMember.findUnique({
    where: {
      seasonId_soldierProfileId: { seasonId, soldierProfileId },
    },
    select: { role: true },
  });
  return member?.role === "admin";
}

export async function getSeasonMembers(seasonId: string) {
  return prisma.seasonMember.findMany({
    where: { seasonId },
    include: {
      soldierProfile: {
        include: { user: { select: { email: true } } },
      },
    },
  });
}

export async function getSeasonMemberNames(seasonId: string) {
  return prisma.seasonMember.findMany({
    where: { seasonId },
    select: {
      soldierProfileId: true,
      soldierProfile: { select: { id: true, fullName: true } },
    },
  });
}
