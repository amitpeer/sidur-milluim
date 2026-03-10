"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { getBoardDataAction } from "@/server/actions/schedule-actions";
import { dateToString } from "@/lib/date-utils";
import { ScheduleBoard } from "./schedule-board";

type BoardData = NonNullable<Awaited<ReturnType<typeof getBoardDataAction>>>;
type ScheduleVersion = NonNullable<BoardData["schedule"]>;
type SeasonData = BoardData["season"];

export default function BoardPage() {
  const { seasonId } = useParams<{ seasonId: string }>();
  const [schedule, setSchedule] = useState<ScheduleVersion | null>(null);
  const [season, setSeason] = useState<SeasonData | null>(null);
  const [constraintKeys, setConstraintKeys] = useState<Set<string>>(new Set());
  const [isAdmin, setIsAdmin] = useState(false);
  const [completion, setCompletion] = useState<{
    hasCity: boolean;
    hasConstraints: boolean;
  } | null>(null);
  const [tableLoading, setTableLoading] = useState(true);

  const loadData = async () => {
    const data = await getBoardDataAction(seasonId);
    if (!data) {
      setTableLoading(false);
      return;
    }
    setSchedule(data.schedule);
    setSeason(data.season);
    setIsAdmin(data.isAdmin);
    setCompletion(data.completion);
    const keys = new Set<string>();
    for (const c of data.constraintKeys) {
      keys.add(`${c.soldierProfileId}-${dateToString(new Date(c.date))}`);
    }
    setConstraintKeys(keys);
    setTableLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [seasonId]);

  const [dismissedBanners, setDismissedBanners] = useState<Set<string>>(
    new Set(),
  );

  const dismissBanner = useCallback((key: string) => {
    setDismissedBanners((prev) => new Set(prev).add(key));
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col p-0 md:p-4">
      <div className="shrink-0">
        {completion &&
          !completion.hasCity &&
          !dismissedBanners.has("city") && (
            <CompactBanner
              href={`/season/${seasonId}/profile`}
              text="לא הוגדרה עיר מגורים — עדכנו בפרופיל"
              onDismiss={() => dismissBanner("city")}
            />
          )}
        {completion &&
          !completion.hasConstraints &&
          !dismissedBanners.has("constraints") && (
            <CompactBanner
              href={`/season/${seasonId}/constraints`}
              text="לא הוגשו אילוצים — הוסיפו אילוצים"
              onDismiss={() => dismissBanner("constraints")}
            />
          )}
      </div>

      {tableLoading ? (
        <div className="p-4">
          <h2 className="mb-4 text-xl font-semibold">לוח סידור</h2>
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <svg
              className="h-4 w-4 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            טוען סידור...
          </div>
        </div>
      ) : !season ? (
        <div className="p-6 text-zinc-500">עונה לא נמצאה.</div>
      ) : !schedule ? (
        <div className="p-4">
          <h2 className="mb-4 text-xl font-semibold">לוח סידור</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            עדיין לא נוצר סידור. עברו לדף הניהול כדי ליצור סידור.
          </p>
        </div>
      ) : (
        <ScheduleBoard
          schedule={schedule}
          season={season}
          constraintKeys={constraintKeys}
          isAdmin={isAdmin}
          seasonId={seasonId}
          onCellChange={loadData}
        />
      )}
    </div>
  );
}

function CompactBanner({
  href,
  text,
  onDismiss,
}: {
  href: string;
  text: string;
  onDismiss: () => void;
}) {
  return (
    <div className="flex items-center gap-1 border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200 md:mx-0 md:mb-3 md:rounded-lg md:border md:px-4 md:py-3 md:text-sm">
      <Link href={href} className="flex-1 hover:underline">
        {text}
      </Link>
      <button
        onClick={(e) => {
          e.preventDefault();
          onDismiss();
        }}
        className="shrink-0 rounded p-0.5 text-amber-600 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-900"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  );
}
