import { auth } from "@/server/auth/auth";
import Link from "next/link";
import { getActiveSeasonsAction } from "@/server/actions/season-actions";
import { redirect } from "next/navigation";
import { AuthButtons } from "@/components/layout/auth-buttons";
import { SeasonList } from "@/components/home/season-list";

export default async function HomePage() {
  const session = await auth();

  if (!session?.user) {
    return <LandingPage />;
  }
  if (!session.user.isApproved && !session.user.isAdmin) {
    redirect("/auth/pending");
  }

  const seasons = await getActiveSeasonsAction();

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold">סידור מילואים</h1>
        <div className="flex items-center gap-3">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {session.user.name}
          </p>
          <AuthButtons isLoggedIn />
        </div>
      </div>

      {seasons.length > 0 ? (
        <SeasonList seasons={seasons} />
      ) : (
        <p className="mb-6 text-zinc-500 dark:text-zinc-400">
          אין עונות פעילות. צרו עונה חדשה כדי להתחיל.
        </p>
      )}

      {session.user.isAdmin && (
        <Link
          href="/season/new"
          className="mt-8 block w-full rounded-2xl bg-zinc-900 py-4 text-center text-base font-medium text-white transition-colors hover:bg-zinc-800 active:scale-[0.98] dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          צור עונה חדשה
        </Link>
      )}
    </main>
  );
}

function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="flex w-full max-w-md flex-col items-center gap-8 text-center">
        <h1 className="text-3xl font-bold">סידור מילואים</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          מערכת לניהול וסידור תורנויות שירות מילואים. צפייה בלוח התורנויות,
          ניהול עונות, וייצוא לגיליון אלקטרוני.
        </p>
        <Link
          href="/auth/login"
          className="rounded-lg bg-zinc-900 px-8 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          התחברות
        </Link>
        <Link
          href="/privacy"
          className="text-xs text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-300"
        >
          מדיניות פרטיות
        </Link>
      </div>
    </main>
  );
}
