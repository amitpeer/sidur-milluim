import type { getSeasonById } from "@/server/db/stores/season-store";
import type { getSeasonMembers } from "@/server/db/stores/soldier-store";
import type { SeasonSoldier } from "@/domain/soldier/soldier.types";
import type { Season } from "@/domain/season/season.types";
import type { SoldierRole } from "@/lib/constants";

export function toDomainSeason(
  season: NonNullable<Awaited<ReturnType<typeof getSeasonById>>>,
): Season {
  return {
    ...season,
    roleMinimums: (season.roleMinimums ?? {}) as Partial<Record<SoldierRole, number>>,
    cityGroupingEnabled: season.cityGroupingEnabled ?? true,
    maxConsecutiveDays: season.maxConsecutiveDays ?? null,
  };
}

export function buildSeasonSoldiers(
  members: Awaited<ReturnType<typeof getSeasonMembers>>,
): SeasonSoldier[] {
  return members.map((m) => ({
    id: m.soldierProfile.id,
    fullName: m.soldierProfile.fullName,
    phone: m.soldierProfile.phone,
    city: m.soldierProfile.city,
    roles: [...m.soldierProfile.roles] as SoldierRole[],
    isFarAway: m.soldierProfile.isFarAway,
    memberRole: m.role as "admin" | "soldier",
  }));
}
