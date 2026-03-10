"use client";

import { useParams, useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import {
  updateSeasonAction,
  deleteSeasonAction,
  type CreateSeasonState,
} from "@/server/actions/season-actions";
import {
  generateScheduleAction,
  hardResetScheduleAction,
  regenerateFromDateAction,
  restoreVersionAction,
  getManagementPageDataAction,
  getSoldierStatsAction,
  type ScheduleActionState,
  type SoldierStats,
} from "@/server/actions/schedule-actions";
import {
  SOLDIER_ROLES,
  SOLDIER_ROLE_LABELS,
  type SoldierRole,
} from "@/lib/constants";
import { dateToString, parseServerDate } from "@/lib/date-utils";

export default function AdminManagementPage() {
  const { seasonId } = useParams<{ seasonId: string }>();
  const router = useRouter();
  type PageData = NonNullable<Awaited<ReturnType<typeof getManagementPageDataAction>>>;
  const [season, setSeason] = useState<PageData["season"] | null>(null);
  const [scheduleState, setScheduleState] = useState<ScheduleActionState>({});
  const [isPending, setIsPending] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [confirmReset, setConfirmReset] = useState("");
  const [confirmDelete, setConfirmDelete] = useState("");
  const [versions, setVersions] = useState<PageData["versions"]>([]);
  const [warnings, setWarnings] = useState<PageData["warnings"]>([]);
  const [stats, setStats] = useState<SoldierStats[]>([]);

  const loadData = async () => {
    const [data, statsData] = await Promise.all([
      getManagementPageDataAction(seasonId),
      getSoldierStatsAction(seasonId),
    ]);
    if (!data) return;
    setSeason(data.season);
    setVersions(data.versions);
    setWarnings(data.warnings);
    setStats(statsData);
  };

  useEffect(() => {
    loadData();
  }, [seasonId]);

  const updateBound = updateSeasonAction.bind(null, seasonId);
  const [settingsState, settingsAction, settingsPending] = useActionState(
    updateBound,
    {} as CreateSeasonState,
  );

  useEffect(() => {
    if (!settingsState.error && !settingsState.fieldErrors) loadData();
  }, [settingsState]);

  const handleGenerate = async () => {
    setIsPending(true);
    const result = await generateScheduleAction(seasonId);
    setScheduleState(result);
    setIsPending(false);
    await loadData();
  };

  const handleRegenerate = async () => {
    if (!fromDate) return;
    setIsPending(true);
    const result = await regenerateFromDateAction(seasonId, fromDate);
    setScheduleState(result);
    setIsPending(false);
    await loadData();
  };

  const handleHardReset = async () => {
    setIsPending(true);
    const result = await hardResetScheduleAction(seasonId);
    setScheduleState(result);
    setIsPending(false);
    setConfirmReset("");
    await loadData();
  };

  const handleRestore = async (versionId: string) => {
    setIsPending(true);
    const result = await restoreVersionAction(versionId, seasonId);
    setScheduleState(result);
    setIsPending(false);
    await loadData();
  };

  const handleDeleteSeason = async () => {
    await deleteSeasonAction(seasonId);
    router.push("/");
  };

  const [startDateVal, setStartDateVal] = useState("");
  const [endDateVal, setEndDateVal] = useState("");
  const [trainingEndDateVal, setTrainingEndDateVal] = useState("");
  const [constraintDeadlineVal, setConstraintDeadlineVal] = useState("");

  useEffect(() => {
    if (!season) return;
    setStartDateVal(dateToString(parseServerDate(season.startDate)));
    setEndDateVal(dateToString(parseServerDate(season.endDate)));
    setTrainingEndDateVal(
      season.trainingEndDate ? dateToString(parseServerDate(season.trainingEndDate)) : "",
    );
    setConstraintDeadlineVal(
      season.constraintDeadline ? dateToString(parseServerDate(season.constraintDeadline)) : "",
    );
  }, [season]);

  if (!season) {
    return <div className="p-6 text-zinc-400">טוען...</div>;
  }

  const roleMinimums = (season.roleMinimums ?? {}) as Partial<Record<SoldierRole, number>>;
  const cityGroupingEnabled = season.cityGroupingEnabled ?? true;

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h2 className="mb-6 text-xl font-semibold">ניהול סידור</h2>

      {settingsState.error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
          {settingsState.error}
        </div>
      )}
      {scheduleState.error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
          {scheduleState.error}
        </div>
      )}
      {scheduleState.success && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-400">
          הפעולה בוצעה בהצלחה.
        </div>
      )}

      <div className="flex flex-col gap-6">
        <Section title="פרטי העונה">
          <form action={settingsAction} className="flex flex-col gap-4">
            <SettingsField label="שם העונה" name="name" defaultValue={season.name} />
            <DateField
              label="תאריך התחלה"
              name="startDate"
              value={startDateVal}
              onChange={setStartDateVal}
              accent="blue"
            />
            <DateField
              label='סיום אל"ת'
              name="trainingEndDate"
              value={trainingEndDateVal}
              onChange={setTrainingEndDateVal}
              description="סיום תקופת האימונים"
              min={startDateVal}
              max={endDateVal}
              accent="amber"
            />
            <DateField
              label="תאריך סיום"
              name="endDate"
              value={endDateVal}
              onChange={setEndDateVal}
              min={trainingEndDateVal || startDateVal}
              accent="green"
            />
            <DateField
              label="מועד אחרון לאילוצים"
              name="constraintDeadline"
              value={constraintDeadlineVal}
              onChange={setConstraintDeadlineVal}
              description="לאחר תאריך זה חיילים לא יוכלו לשנות אילוצים"
              accent="red"
            />
            <button
              type="submit"
              disabled={settingsPending}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {settingsPending ? "שומר..." : "שמור שינויים"}
            </button>
          </form>
        </Section>

        <Section title="פרמטרים ליצירת סידור">
          <form action={settingsAction} className="flex flex-col gap-4">
            <SettingsField
              label="מינימום חיילים ביום"
              name="dailyHeadcount"
              type="number"
              defaultValue={String(season.dailyHeadcount)}
              min="1"
              inputMode="numeric"
            />
            <div>
              <span className="mb-2 block text-sm font-medium">מינימום לפי תפקיד</span>
              <div className="flex flex-col gap-2">
                {SOLDIER_ROLES.map((role) => (
                  <div key={role} className="flex items-center gap-3">
                    <span className="w-16 text-sm">{SOLDIER_ROLE_LABELS[role]}</span>
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      defaultValue={roleMinimums[role] ?? 0}
                      className="w-20 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                      data-role={role}
                    />
                  </div>
                ))}
              </div>
              <input type="hidden" name="roleMinimums" id="roleMinimums" />
            </div>
            <SettingsField
              label="מקסימום ימים רצופים"
              name="maxConsecutiveDays"
              type="number"
              defaultValue={season.maxConsecutiveDays != null ? String(season.maxConsecutiveDays) : ""}
              min="1"
              inputMode="numeric"
            />
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="cityGroupingEnabled"
                  value="true"
                  defaultChecked={cityGroupingEnabled}
                />
                נסה לקבץ כניסות ויציאות לפי ערים
              </label>
            </div>
            <button
              type="submit"
              disabled={settingsPending}
              onClick={(e) => {
                const form = e.currentTarget.closest("form")!;
                const roleInputs = form.querySelectorAll<HTMLInputElement>("[data-role]");
                const mins: Record<string, number> = {};
                roleInputs.forEach((input) => {
                  const role = input.dataset.role!;
                  const val = parseInt(input.value, 10);
                  if (val > 0) mins[role] = val;
                });
                const hidden = form.querySelector<HTMLInputElement>("#roleMinimums")!;
                hidden.value = JSON.stringify(mins);

                const cityCheckbox = form.querySelector<HTMLInputElement>("[name=cityGroupingEnabled]")!;
                if (!cityCheckbox.checked) {
                  const falseInput = document.createElement("input");
                  falseInput.type = "hidden";
                  falseInput.name = "cityGroupingEnabled";
                  falseInput.value = "false";
                  form.appendChild(falseInput);
                }
              }}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {settingsPending ? "שומר..." : "שמור פרמטרים"}
            </button>
          </form>
        </Section>

        {warnings.length > 0 && (
          <WarningsSection warnings={warnings} />
        )}

        <Section title="יצירת סידור">
          <div className="flex flex-col gap-4">
            <button
              onClick={handleGenerate}
              disabled={isPending}
              className="rounded-lg bg-zinc-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {isPending ? "מייצר..." : "צור סידור"}
            </button>

            <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <h4 className="mb-2 text-sm font-medium">ייצור מחדש מתאריך</h4>
              <div className="flex gap-3">
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
                <button
                  onClick={handleRegenerate}
                  disabled={isPending || !fromDate}
                  className="rounded-lg bg-zinc-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-600 disabled:opacity-50 dark:bg-zinc-300 dark:text-zinc-900 dark:hover:bg-zinc-400"
                >
                  ייצר מחדש
                </button>
              </div>
              <p className="mt-1 text-xs text-zinc-400">
                ישמור את הסידור לפני התאריך ויייצר מחדש מהתאריך ואילך.
              </p>
            </div>

            <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <h4 className="mb-2 text-sm font-medium">איפוס מלא</h4>
              <input
                type="text"
                placeholder='הקלידו "איפוס" לאישור'
                value={confirmReset}
                onChange={(e) => setConfirmReset(e.target.value)}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
              <button
                onClick={handleHardReset}
                disabled={isPending || confirmReset !== "איפוס"}
                className="mt-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                איפוס מלא
              </button>
            </div>
          </div>
        </Section>

        {versions.length > 0 && (
          <Section title="היסטוריית סידורים">
            <div className="flex flex-col gap-2">
              {versions.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-2 text-sm dark:border-zinc-800"
                >
                  <span>
                    סידור {v.version} —{" "}
                    {new Date(v.generatedAt).toLocaleString("he-IL", {
                      day: "numeric",
                      month: "long",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {v.isActive && (
                      <span className="mr-2 rounded bg-green-100 px-2 py-0.5 text-xs text-green-700 dark:bg-green-900 dark:text-green-200">
                        פעילה
                      </span>
                    )}
                  </span>
                  {!v.isActive && (
                    <button
                      onClick={() => handleRestore(v.id)}
                      disabled={isPending}
                      className="text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                    >
                      שחזר
                    </button>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        {stats.length > 0 && <StatsSection stats={stats} />}

        <Section title="מחיקת עונה">
          <p className="mb-3 text-sm text-zinc-500">
            פעולה זו תמחק את העונה לצמיתות כולל חיילים, אילוצים וסידורים.
          </p>
          <input
            type="text"
            placeholder='הקלידו "מחיקה" לאישור'
            value={confirmDelete}
            onChange={(e) => setConfirmDelete(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            onClick={handleDeleteSeason}
            disabled={confirmDelete !== "מחיקה"}
            className="mt-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            מחק עונה
          </button>
        </Section>
      </div>
    </div>
  );
}

const INITIAL_WARNINGS_SHOWN = 5;

function WarningsSection({
  warnings,
}: {
  warnings: NonNullable<Awaited<ReturnType<typeof getManagementPageDataAction>>>["warnings"];
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? warnings : warnings.slice(0, INITIAL_WARNINGS_SHOWN);
  const hasMore = warnings.length > INITIAL_WARNINGS_SHOWN;

  return (
    <Section title={`אזהרות (${warnings.length})`}>
      <ul className="space-y-1 text-sm text-amber-600 dark:text-amber-400">
        {visible.map((w, i) => (
          <li key={i}>
            {new Date(w.date).toLocaleDateString("he-IL", {
              day: "numeric",
              month: "long",
            })}{" "}
            — {w.message}
          </li>
        ))}
      </ul>
      {hasMore && (
        <button
          type="button"
          onClick={() => setShowAll(!showAll)}
          className="mt-2 text-sm font-medium text-amber-700 hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-100"
        >
          {showAll
            ? "הצג פחות"
            : `הצג את כל ${warnings.length} האזהרות`}
        </button>
      )}
    </Section>
  );
}

function StatsSection({ stats }: { stats: SoldierStats[] }) {
  const [open, setOpen] = useState(false);

  return (
    <Section title="סטטיסטיקות">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        {open ? "הסתר טבלה" : "הצג טבלה"}
      </button>
      {open && (
        <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
                <th className="px-4 py-3 text-right font-medium">חייל</th>
                <th className="px-4 py-3 text-center font-medium">
                  <span className="inline-block rounded bg-green-100 px-2 py-0.5 text-green-700 dark:bg-green-900 dark:text-green-200">
                    ימים בבסיס
                  </span>
                </th>
                <th className="px-4 py-3 text-center font-medium">
                  <span className="inline-block rounded bg-zinc-100 px-2 py-0.5 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    סה״כ חופש
                  </span>
                </th>
                <th className="px-4 py-3 text-center font-medium">
                  <span className="inline-block rounded bg-red-100 px-2 py-0.5 text-red-700 dark:bg-red-900 dark:text-red-200">
                    מתוכם אילוצים
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-zinc-100 dark:border-zinc-800"
                >
                  <td className="px-4 py-3 font-medium">{s.fullName}</td>
                  <td className="px-4 py-3 text-center text-green-700 dark:text-green-300">
                    {s.daysOnBase}
                  </td>
                  <td className="px-4 py-3 text-center text-zinc-500">
                    {s.totalDaysOff}
                  </td>
                  <td className="px-4 py-3 text-center text-red-600 dark:text-red-300">
                    {s.constraintDaysOff}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <h3 className="mb-3 text-sm font-medium">{title}</h3>
      {children}
    </div>
  );
}

function SettingsField({
  label,
  name,
  type = "text",
  defaultValue,
  disabled,
  min,
  max,
  inputMode,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  disabled?: boolean;
  min?: string;
  max?: string;
  inputMode?: "numeric" | "text";
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        disabled={disabled}
        min={min}
        max={max}
        inputMode={inputMode}
        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none disabled:bg-zinc-100 disabled:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:disabled:bg-zinc-800"
      />
    </div>
  );
}

const ACCENT_COLORS = {
  blue: "border-r-blue-500 dark:border-r-blue-400",
  amber: "border-r-amber-500 dark:border-r-amber-400",
  green: "border-r-green-500 dark:border-r-green-400",
  red: "border-r-red-500 dark:border-r-red-400",
} as const;

function DateField({
  label,
  name,
  value,
  onChange,
  description,
  min,
  max,
  accent,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (val: string) => void;
  description?: string;
  min?: string;
  max?: string;
  accent: keyof typeof ACCENT_COLORS;
}) {
  return (
    <div className={`rounded-xl border border-zinc-200 border-r-4 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950 ${ACCENT_COLORS[accent]}`}>
      <div className="mb-2 flex items-center gap-2">
        <svg className="h-5 w-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <label htmlFor={name} className="text-sm font-semibold">
          {label}
        </label>
      </div>
      {description && (
        <p className="mb-3 text-xs text-zinc-400">{description}</p>
      )}
      <input
        id={name}
        name={name}
        type="date"
        lang="he-IL"
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          if (min && v < min) return;
          if (max && v > max) return;
          onChange(v);
        }}
        min={min}
        max={max}
        className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-4 text-lg shadow-sm focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
      />
      {value && (
        <p className="mt-1 text-sm text-zinc-500">
          {new Date(value + "T00:00:00").toLocaleDateString("he-IL", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      )}
    </div>
  );
}
