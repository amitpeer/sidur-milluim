"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { deleteSeasonAction } from "@/server/actions/season-actions";

interface Season {
  readonly id: string;
  readonly name: string;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly isAdmin: boolean;
}

interface SeasonListProps {
  readonly seasons: readonly Season[];
}

export function SeasonList({ seasons }: SeasonListProps) {
  return (
    <div className="flex flex-col gap-4">
      {seasons.map((season) => (
        <SeasonCard key={season.id} season={season} />
      ))}
    </div>
  );
}

function SeasonCard({ season }: { readonly season: Season }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (!window.confirm(`למחוק את העונה "${season.name}"?`)) return;

    startTransition(async () => {
      await deleteSeasonAction(season.id);
      router.refresh();
    });
  }

  return (
    <div className="relative">
      <Link
        href={`/season/${season.id}/board`}
        className="block rounded-2xl border border-zinc-200 bg-white px-6 py-8 text-center shadow-sm transition-all hover:border-zinc-300 hover:bg-zinc-50 active:scale-[0.98] dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
      >
        <h2 className="text-lg font-semibold">{season.name}</h2>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          {new Date(season.startDate).toLocaleDateString("he-IL")} —{" "}
          {new Date(season.endDate).toLocaleDateString("he-IL")}
        </p>
      </Link>

      {season.isAdmin && (
        <button
          onClick={handleDelete}
          disabled={isPending}
          className="absolute left-3 top-3 rounded-lg p-2 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950 dark:hover:text-red-400"
          title="מחק עונה"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      )}
    </div>
  );
}
