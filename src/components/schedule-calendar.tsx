import { dateToString } from "@/lib/date-utils";
import {
  WEEKDAY_HEADERS,
  MONTH_NAMES_HE,
  buildFullMonths,
} from "@/components/calendar-utils";

type ScheduleStatus =
  | "on-base"
  | "constraint-off"
  | "rotation-off"
  | "sick"
  | "course";

interface ScheduleDay {
  readonly date: Date;
  readonly status: ScheduleStatus;
}

interface ScheduleCalendarProps {
  readonly seasonStart: Date;
  readonly seasonEnd: Date;
  readonly days: readonly ScheduleDay[];
}

const STATUS_COLORS: Record<ScheduleStatus, string> = {
  "on-base":
    "bg-green-200 text-green-900 dark:bg-green-900 dark:text-green-100",
  "rotation-off":
    "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200",
  "constraint-off":
    "bg-red-200 text-red-900 dark:bg-red-900 dark:text-red-100",
  sick: "bg-yellow-200 text-yellow-900 dark:bg-yellow-900 dark:text-yellow-100",
  course: "bg-blue-200 text-blue-900 dark:bg-blue-900 dark:text-blue-100",
};

const LEGEND_ITEMS: { readonly status: ScheduleStatus; readonly label: string }[] = [
  { status: "on-base", label: "בבסיס" },
  { status: "rotation-off", label: "בבית" },
  { status: "constraint-off", label: "אילוץ" },
  { status: "sick", label: "מחלה" },
  { status: "course", label: "קורס" },
];

export function ScheduleCalendar({
  seasonStart,
  seasonEnd,
  days,
}: ScheduleCalendarProps) {
  const months = buildFullMonths(seasonStart, seasonEnd);
  const startStr = dateToString(seasonStart);
  const endStr = dateToString(seasonEnd);

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const todayStr = dateToString(today);

  const statusByDate = new Map(
    days.map((d) => [dateToString(d.date), d.status]),
  );

  if (months.length === 0) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {months.map((month) => (
          <MonthGrid
            key={`${month.year}-${month.month}`}
            month={month}
            startStr={startStr}
            endStr={endStr}
            todayStr={todayStr}
            statusByDate={statusByDate}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-4 text-sm text-zinc-600 dark:text-zinc-400">
        {LEGEND_ITEMS.map(({ status, label }) => (
          <span key={status} className="flex items-center gap-1.5">
            <span
              className={`inline-block h-3 w-3 rounded-sm ${STATUS_COLORS[status]}`}
            />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function MonthGrid({
  month,
  startStr,
  endStr,
  todayStr,
  statusByDate,
}: {
  readonly month: { readonly year: number; readonly month: number; readonly days: Date[] };
  readonly startStr: string;
  readonly endStr: string;
  readonly todayStr: string;
  readonly statusByDate: Map<string, ScheduleStatus>;
}) {
  const label = `${MONTH_NAMES_HE[month.month]} ${month.year}`;

  return (
    <div className="flex flex-col gap-1">
      <h4 className="mb-1 text-center text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </h4>
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_HEADERS.map((d) => (
          <div
            key={d}
            className="py-0.5 text-center text-xs font-medium text-zinc-500"
          >
            {d}
          </div>
        ))}
        {month.days.map((day, idx) => {
          const dateStr = dateToString(day);
          const inRange = dateStr >= startStr && dateStr <= endStr;
          const status = inRange ? statusByDate.get(dateStr) : undefined;
          const isToday = dateStr === todayStr;
          const dayOfWeek = day.getUTCDay();

          const colorClass = inRange && status
            ? STATUS_COLORS[status]
            : "bg-zinc-100 text-zinc-300 dark:bg-zinc-900 dark:text-zinc-700";

          const todayRing = isToday
            ? "ring-2 ring-zinc-900 dark:ring-zinc-100"
            : "";

          return (
            <div
              key={dateStr}
              style={{
                gridColumnStart: idx === 0 ? dayOfWeek + 1 : undefined,
              }}
              className={`rounded p-1 text-center text-xs ${colorClass} ${todayRing}`}
            >
              {day.getUTCDate()}
            </div>
          );
        })}
      </div>
    </div>
  );
}
