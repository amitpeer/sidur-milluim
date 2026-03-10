import { auth } from "@/server/auth/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getActiveSeasonsAction } from "@/server/actions/season-actions";

export default async function HomePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/login");
  }

  const seasons = await getActiveSeasonsAction();

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold">סידור מילואים</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {session.user.name}
        </p>
      </div>

      {seasons.length > 0 ? (
        <div className="flex flex-col gap-4">
          {seasons.map((season) => (
            <Link
              key={season.id}
              href={`/season/${season.id}/board`}
              className="rounded-2xl border border-zinc-200 bg-white px-6 py-8 text-center shadow-sm transition-all hover:border-zinc-300 hover:bg-zinc-50 active:scale-[0.98] dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
            >
              <h2 className="text-lg font-semibold">{season.name}</h2>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                {new Date(season.startDate).toLocaleDateString("he-IL")} —{" "}
                {new Date(season.endDate).toLocaleDateString("he-IL")}
              </p>
            </Link>
          ))}
        </div>
      ) : (
        <p className="mb-6 text-zinc-500 dark:text-zinc-400">
          אין עונות פעילות. צרו עונה חדשה כדי להתחיל.
        </p>
      )}

      <Link
        href="/season/new"
        className="mt-8 block w-full rounded-2xl bg-zinc-900 py-4 text-center text-base font-medium text-white transition-colors hover:bg-zinc-800 active:scale-[0.98] dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        צור עונה חדשה
      </Link>
    </main>
  );
}
