import type { DayOffConstraint } from "./constraint.types";

export function groupConstraintsByGroupId(
  constraints: readonly DayOffConstraint[],
): Map<string, DayOffConstraint[]> {
  const groups = new Map<string, DayOffConstraint[]>();
  let ungroupedCounter = 0;

  for (const constraint of constraints) {
    const key = constraint.groupId ?? `__ungrouped_${ungroupedCounter++}`;
    const existing = groups.get(key);
    if (existing) {
      existing.push(constraint);
    } else {
      groups.set(key, [constraint]);
    }
  }

  for (const [, items] of groups) {
    items.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  return groups;
}
