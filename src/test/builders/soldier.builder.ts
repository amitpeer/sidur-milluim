import type { SeasonSoldier } from "@/domain/soldier/soldier.types";

let counter = 0;

export function buildSoldier(
  overrides: Partial<SeasonSoldier> = {},
): SeasonSoldier {
  counter++;
  return {
    id: `soldier-${counter}`,
    fullName: `חייל ${counter}`,
    phone: null,
    city: null,
    roles: [],
    isFarAway: false,
    memberRole: "soldier",
    ...overrides,
  };
}
