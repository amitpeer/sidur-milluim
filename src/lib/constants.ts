export const SOLDIER_ROLES = ["commander", "driver", "navigator"] as const;

export type SoldierRole = (typeof SOLDIER_ROLES)[number];

export const SOLDIER_ROLE_LABELS: Record<SoldierRole, string> = {
  commander: "מפקד",
  driver: "נהג",
  navigator: "נווט",
};

export const MEMBER_ROLES = ["admin", "soldier"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];
