"use client";

import { useParams, useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import {
  updateSeasonAction,
  deleteSeasonAction,
  type CreateSeasonState,
} from "@/server/actions/season-actions";
import {
  getManagementPageDataAction,
} from "@/server/actions/schedule-actions";
import {
  updateAndExportAction,
  patchFromDateAndExportAction,
  regenerateFromDateAndExportAction,
  clearScheduleAction,
  getSheetExportsAction,
  setActiveSheetExportAction,
  shareSheetAction,
  deleteSheetExportAction,
  syncFromSheetAction,
} from "@/server/actions/sheets-actions";
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
  const [hasActiveSchedule, setHasActiveSchedule] = useState(false);
  const [isActionPending, setIsActionPending] = useState(false);
  const [actionError, setActionError] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [confirmReset, setConfirmReset] = useState("");
  const [confirmDelete, setConfirmDelete] = useState("");
  const [warnings, setWarnings] = useState<PageData["warnings"]>([]);
  type SheetExportRow = Awaited<ReturnType<typeof getSheetExportsAction>>[number];
  const [sheetExports, setSheetExports] = useState<SheetExportRow[]>([]);
  const [pendingExportAction, setPendingExportAction] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState("");

  const loadData = async () => {
    const [data, exports] = await Promise.all([
      getManagementPageDataAction(seasonId),
      getSheetExportsAction(seasonId),
    ]);
    setSheetExports(exports);
    if (!data) return;
    setSeason(data.season);
    setWarnings(data.warnings);
    setHasActiveSchedule(data.versions.some((v) => v.isActive));
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

  const runAction = async (action: () => Promise<{ url: string } | { error: string }>) => {
    setIsActionPending(true);
    setActionError("");
    const result = await action();
    setIsActionPending(false);
    if ("error" in result) {
      setActionError(result.error);
    } else {
      window.open(result.url, "_blank");
      await loadData();
    }
  };

  const handleCreateSchedule = () =>
    runAction(() => updateAndExportAction(seasonId));

  const handlePatchFromDate = () =>
    runAction(() => patchFromDateAndExportAction(seasonId, fromDate));

  const handleRegenerateFromDate = () => {
    const confirmed = window.confirm(
      "פעולה זו תיצור סידור חדש מאפס מהתאריך הנבחר ואילך. שינויים ידניים מתאריך זה ייאבדו. להמשיך?",
    );
    if (!confirmed) return;
    runAction(() => regenerateFromDateAndExportAction(seasonId, fromDate));
  };

  const handleClearSchedule = async () => {
    const confirmed = window.confirm(
      "פעולה זו תמחק את כל היסטוריית הסידורים, כולל גרסאות קודמות של Google Sheets. להמשיך?",
    );
    if (!confirmed) return;
    setIsActionPending(true);
    setActionError("");
    const result = await clearScheduleAction(seasonId);
    setIsActionPending(false);
    if ("error" in result) {
      setActionError(result.error);
    } else {
      setConfirmReset("");
      await loadData();
    }
  };

  const handleDeleteSeason = async () => {
    const confirmed = window.confirm(
      "פעולה זו תמחק את העונה לצמיתות, כולל חיילים, אילוצים, סידורים וייצוא ל-Sheets. להמשיך?",
    );
    if (!confirmed) return;
    await deleteSeasonAction(seasonId);
    router.push("/");
  };

  const handleSetActiveExport = async (exportId: string) => {
    setPendingExportAction(`activate-${exportId}`);
    setActionError("");
    const result = await setActiveSheetExportAction(exportId, seasonId);
    setPendingExportAction(null);
    if (result.error) {
      setActionError(result.error);
    } else {
      await loadData();
    }
  };

  const handleShareSheet = async (exportId: string) => {
    setPendingExportAction(`share-${exportId}`);
    setActionError("");
    const result = await shareSheetAction(exportId, seasonId);
    setPendingExportAction(null);
    if ("error" in result) {
      setActionError(result.error);
    } else {
      await loadData();
    }
  };

  const handleDeleteExport = async (exportId: string) => {
    const confirmed = window.confirm("למחוק את הגיליון הזה? לא ניתן לבטל פעולה זו.");
    if (!confirmed) return;
    setPendingExportAction(`delete-${exportId}`);
    setActionError("");
    const result = await deleteSheetExportAction(exportId, seasonId);
    setPendingExportAction(null);
    if (result.error) {
      setActionError(result.error);
    } else {
      await loadData();
    }
  };

  const handleSyncFromSheet = async () => {
    setIsActionPending(true);
    setActionError("");
    setSyncMessage("");
    const result = await syncFromSheetAction(seasonId);
    setIsActionPending(false);
    if ("error" in result) {
      setActionError(result.error);
    } else {
      const parts: string[] = [];
      if (result.changeCount > 0) {
        parts.push(`עודכנו ${result.changeCount} תאים`);
      } else {
        parts.push("הסידור מעודכן");
      }
      if (result.warnings.length > 0) {
        parts.push(`שמות שלא זוהו: ${result.warnings.join(", ")}`);
      }
      const { debug } = result;
      parts.push(`[${debug.matchedSoldiers} חיילים, ${debug.columnCount} עמודות]`);
      if (debug.unmatchedValues.length > 0) {
        parts.push(`ערכים לא מוכרים: ${debug.unmatchedValues.map((v) => JSON.stringify(v)).join(", ")}`);
      }
      setSyncMessage(parts.join(" | "));
      await loadData();
    }
  };

  const [startDateVal, setStartDateVal] = useState("");
  const [endDateVal, setEndDateVal] = useState("");
  const [trainingEndDateVal, setTrainingEndDateVal] = useState("");
  const [constraintDeadlineVal, setConstraintDeadlineVal] = useState("");

  useEffect(() => {
    if (!season) return;
    const start = dateToString(parseServerDate(season.startDate));
    const today = new Date().toISOString().split("T")[0];
    setStartDateVal(start);
    setEndDateVal(dateToString(parseServerDate(season.endDate)));
    setTrainingEndDateVal(
      season.trainingEndDate ? dateToString(parseServerDate(season.trainingEndDate)) : "",
    );
    setConstraintDeadlineVal(
      season.constraintDeadline ? dateToString(parseServerDate(season.constraintDeadline)) : "",
    );
    setFromDate(today >= start ? today : start);
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

      <div className="flex flex-col gap-6">
        <Section title="סידור וייצוא">
          <div className="flex flex-col gap-4">
            {!hasActiveSchedule ? (
              <button
                onClick={handleCreateSchedule}
                disabled={isActionPending}
                className="flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                  <path d="M19 11h-6V5h-2v6H5v2h6v6h2v-6h6z" />
                  <path d="M3 3h18v18H3V3zm1 1v16h16V4H4z" />
                </svg>
                {isActionPending ? "מעבד..." : "צור סידור"}
              </button>
            ) : (
              <div className="flex flex-col gap-4">
                <input
                  type="date"
                  value={fromDate}
                  min={startDateVal}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
                <div className="flex gap-3">
                  <button
                    onClick={handlePatchFromDate}
                    disabled={isActionPending}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {isActionPending ? "מעבד..." : "איזון מתאריך"}
                  </button>
                  <button
                    onClick={handleRegenerateFromDate}
                    disabled={isActionPending}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-emerald-600 px-4 py-3 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-50 dark:text-emerald-400 dark:hover:bg-emerald-950"
                  >
                    {isActionPending ? "מעבד..." : "סידור חדש מתאריך"}
                  </button>
                </div>
                <div className="flex gap-3 text-xs text-zinc-400">
                  <p className="flex-1">שומר שינויים ידניים, מתקן ומאזן מהתאריך הנבחר.</p>
                  <p className="flex-1">מוחק ויוצר סידור חדש מאפס מהתאריך הנבחר.</p>
                </div>
                <button
                  onClick={handleSyncFromSheet}
                  disabled={isActionPending}
                  className="flex items-center justify-center gap-2 rounded-lg border border-blue-600 px-4 py-3 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-50 disabled:opacity-50 dark:text-blue-400 dark:hover:bg-blue-950"
                >
                  {isActionPending ? "מסנכרן..." : "סנכרן מהגיליון"}
                </button>
                <p className="text-xs text-zinc-400">
                  קורא שינויים מהגיליון הפעיל ב-Google Sheets ומעדכן את הסידור.
                </p>
                {syncMessage && (
                  <p className="text-sm text-blue-600 dark:text-blue-400">{syncMessage}</p>
                )}
              </div>
            )}
            {actionError && (
              <p className="text-sm text-red-600 dark:text-red-400">{actionError}</p>
            )}

            <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <h4 className="mb-2 text-sm font-medium">מחיקת כל הסידורים</h4>
              <p className="mb-2 text-xs text-zinc-400">
                מוחק את כל גרסאות הסידור. לאחר מכן ניתן ליצור סידור חדש.
              </p>
              <input
                type="text"
                placeholder='הקלידו "מחיקה" לאישור'
                value={confirmReset}
                onChange={(e) => setConfirmReset(e.target.value)}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
              <button
                onClick={handleClearSchedule}
                disabled={isActionPending || confirmReset !== "מחיקה"}
                className="mt-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                מחיקה
              </button>
            </div>
          </div>
        </Section>

        {sheetExports.length > 0 && (
          <Section title="היסטוריית ייצוא ל-Sheets">
            <div className="flex flex-col gap-2">
              {sheetExports.map((exp) => (
                <div
                  key={exp.id}
                  className="flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-2 text-sm dark:border-zinc-800"
                >
                  <span className="flex items-center gap-2">
                    <a
                      href={exp.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline dark:text-blue-400"
                    >
                      {new Date(exp.createdAt).toLocaleString("he-IL", {
                        day: "numeric",
                        month: "long",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </a>
                    {exp.createdBy.name && (
                      <span className="text-xs text-zinc-400">
                        — {exp.createdBy.name}
                      </span>
                    )}
                    {exp.isActive && (
                      <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700 dark:bg-green-900 dark:text-green-200">
                        פעילה
                      </span>
                    )}
                    {exp.isShared && (
                      <span className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-900 dark:text-blue-200">
                        משותף
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-2">
                    {!exp.isShared && (
                      <button
                        onClick={() => handleShareSheet(exp.id)}
                        disabled={pendingExportAction !== null}
                        className="rounded-md border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-50 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900"
                      >
                        {pendingExportAction === `share-${exp.id}` ? (
                          <span className="flex items-center gap-1.5">
                            <Spinner />
                            משתף...
                          </span>
                        ) : (
                          "שתף"
                        )}
                      </button>
                    )}
                    {!exp.isActive && (
                      <button
                        onClick={() => handleSetActiveExport(exp.id)}
                        disabled={pendingExportAction !== null}
                        className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                      >
                        {pendingExportAction === `activate-${exp.id}` ? (
                          <span className="flex items-center gap-1.5">
                            <Spinner />
                            מפעיל...
                          </span>
                        ) : (
                          "הפעל"
                        )}
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteExport(exp.id)}
                      disabled={pendingExportAction !== null}
                      className="rounded-md border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50 dark:border-red-800 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
                    >
                      {pendingExportAction === `delete-${exp.id}` ? (
                        <span className="flex items-center gap-1.5">
                          <Spinner />
                          מוחק...
                        </span>
                      ) : (
                        "מחק"
                      )}
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {warnings.length > 0 && (
          <WarningsSection warnings={warnings} />
        )}

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
            <p className="text-xs text-zinc-400">השינויים ייכנסו לתוקף בייצוא הבא ל-Sheets.</p>
          </form>
        </Section>

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
            <p className="text-xs text-zinc-400">השינויים ייכנסו לתוקף בייצוא הבא ל-Sheets.</p>
          </form>
        </Section>

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


function Spinner() {
  return (
    <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
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
