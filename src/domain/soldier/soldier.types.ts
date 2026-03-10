import type { SoldierRole } from "@/lib/constants";

export interface Soldier {
  readonly id: string;
  readonly fullName: string;
  readonly phone: string | null;
  readonly city: string | null;
  readonly roles: readonly SoldierRole[];
  readonly isFarAway: boolean;
}

export interface SeasonSoldier extends Soldier {
  readonly memberRole: "admin" | "soldier";
}
