interface ChecklistInput {
  readonly hasCity: boolean;
  readonly hasConstraints: boolean;
  readonly constraintDeadline: Date | null;
  readonly hasActiveSchedule: boolean;
  readonly now: Date;
}

interface ChecklistItem {
  readonly key: string;
  readonly label: string;
  readonly isComplete: boolean;
  readonly urgency: "info" | "warning" | "overdue" | null;
  readonly daysLeft: number | null;
}

export function buildChecklistItems(input: ChecklistInput): readonly ChecklistItem[] {
  const items: ChecklistItem[] = [];

  items.push({
    key: "city",
    label: "עדכן עיר מגורים",
    isComplete: input.hasCity,
    urgency: input.hasCity ? null : "info",
    daysLeft: null,
  });

  const daysLeft = computeDaysLeft(input.constraintDeadline, input.now);
  const constraintUrgency = resolveConstraintUrgency(
    input.hasConstraints,
    daysLeft,
  );

  items.push({
    key: "constraints",
    label: "שלח אילוצים",
    isComplete: input.hasConstraints,
    urgency: constraintUrgency,
    daysLeft,
  });

  return items;
}

function computeDaysLeft(deadline: Date | null, now: Date): number | null {
  if (!deadline) return null;

  const deadlineMs = new Date(deadline).setUTCHours(0, 0, 0, 0);
  const nowMs = new Date(now).setUTCHours(0, 0, 0, 0);
  return Math.round((deadlineMs - nowMs) / (1000 * 60 * 60 * 24));
}

function resolveConstraintUrgency(
  hasConstraints: boolean,
  daysLeft: number | null,
): ChecklistItem["urgency"] {
  if (hasConstraints) return null;
  if (daysLeft === null) return "info";
  if (daysLeft < 0) return "overdue";
  return "warning";
}
