import type { SoldierRole } from "@/lib/constants";
import type { SeasonSoldier } from "@/domain/soldier/soldier.types";
import type { ScheduleAssignment } from "./schedule.types";
import { dateToString } from "@/lib/date-utils";

interface SuggestInput {
  readonly unavailableSoldierId: string;
  readonly date: Date;
  readonly soldiers: readonly SeasonSoldier[];
  readonly assignments: readonly ScheduleAssignment[];
  readonly constraints: readonly {
    readonly soldierProfileId: string;
    readonly date: Date;
  }[];
  readonly requiredRoles?: readonly SoldierRole[];
}

export interface ReplacementSuggestion {
  readonly soldierId: string;
  readonly fullName: string;
  readonly score: number;
  readonly reason: string;
}

export function suggestReplacements(
  input: SuggestInput,
): ReplacementSuggestion[] {
  const { unavailableSoldierId, date, soldiers, assignments, constraints, requiredRoles } =
    input;

  const dateStr = dateToString(date);

  const constraintSet = new Set(
    constraints
      .filter((c) => dateToString(c.date) === dateStr)
      .map((c) => c.soldierProfileId),
  );

  const assignedOnDay = new Set(
    assignments
      .filter((a) => dateToString(a.date) === dateStr && a.isOnBase)
      .map((a) => a.soldierProfileId),
  );

  const totalDaysPerSoldier = new Map<string, number>();
  for (const a of assignments) {
    if (a.isOnBase) {
      totalDaysPerSoldier.set(
        a.soldierProfileId,
        (totalDaysPerSoldier.get(a.soldierProfileId) ?? 0) + 1,
      );
    }
  }

  const candidates = soldiers.filter(
    (s) =>
      s.id !== unavailableSoldierId &&
      !constraintSet.has(s.id) &&
      !assignedOnDay.has(s.id),
  );

  const scored: ReplacementSuggestion[] = candidates.map((s) => {
    let score = 0;
    const reasons: string[] = [];

    const daysAssigned = totalDaysPerSoldier.get(s.id) ?? 0;
    const fairnessScore = 100 - daysAssigned;
    score += fairnessScore;
    reasons.push(`${daysAssigned} ימים מוקצים`);

    if (requiredRoles && requiredRoles.length > 0) {
      const hasRole = requiredRoles.some((r) => s.roles.includes(r));
      if (hasRole) {
        score += 50;
        reasons.push("בעל תפקיד נדרש");
      }
    }

    if (!s.isFarAway) {
      score += 10;
      reasons.push("קרוב");
    }

    return {
      soldierId: s.id,
      fullName: s.fullName,
      score,
      reason: reasons.join(", "),
    };
  });

  return scored.sort((a, b) => b.score - a.score);
}
