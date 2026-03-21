import type { SeasonSoldier } from "@/domain/soldier/soldier.types";
import type { Season } from "@/domain/season/season.types";
import type { SoldierRole } from "@/lib/constants";

export interface SeasonRow {
  readonly id: string;
  readonly name: string;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly trainingEndDate: Date | null;
  readonly dailyHeadcount: number;
  readonly roleMinimums: unknown;
  readonly constraintDeadline: Date | null;
  readonly isActive: boolean;
  readonly cityGroupingEnabled: boolean;
  readonly avgDaysArmy: number | null;
  readonly avgDaysHome: number | null;
  readonly farAwayExtraDays: number | null;
}

export interface MemberRow {
  readonly role: string;
  readonly soldierProfile: {
    readonly id: string;
    readonly fullName: string;
    readonly phone: string | null;
    readonly city: string | null;
    readonly roles: string[];
    readonly isFarAway: boolean;
  };
}

export function toDomainSeason(season: SeasonRow): Season {
  return {
    ...season,
    roleMinimums: (season.roleMinimums ?? {}) as Partial<Record<SoldierRole, number>>,
    cityGroupingEnabled: season.cityGroupingEnabled ?? true,
    avgDaysArmy: season.avgDaysArmy ?? null,
    avgDaysHome: season.avgDaysHome ?? null,
    farAwayExtraDays: season.farAwayExtraDays ?? null,
  };
}

export function buildSeasonSoldiers(
  members: readonly MemberRow[],
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
