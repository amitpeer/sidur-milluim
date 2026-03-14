interface ScheduleDay {
  readonly date: Date;
  readonly status: string;
}

interface ScheduleSequence {
  readonly status: string;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly dayCount: number;
}

const ONE_DAY_MS = 1000 * 60 * 60 * 24;

export function groupScheduleBySequence(
  days: readonly ScheduleDay[],
): readonly ScheduleSequence[] {
  if (days.length === 0) return [];

  const sorted = [...days].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );

  const sequences: ScheduleSequence[] = [];
  let currentStatus = sorted[0].status;
  let startDate = sorted[0].date;
  let endDate = sorted[0].date;
  let dayCount = 1;

  for (let i = 1; i < sorted.length; i++) {
    const day = sorted[i];
    const gap = day.date.getTime() - endDate.getTime();
    const isConsecutive = gap <= ONE_DAY_MS;

    if (day.status === currentStatus && isConsecutive) {
      endDate = day.date;
      dayCount++;
    } else {
      sequences.push({ status: currentStatus, startDate, endDate, dayCount });
      currentStatus = day.status;
      startDate = day.date;
      endDate = day.date;
      dayCount = 1;
    }
  }

  sequences.push({ status: currentStatus, startDate, endDate, dayCount });
  return sequences;
}
