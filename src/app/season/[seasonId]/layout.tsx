import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MobileNav } from "@/components/layout/mobile-nav";
import { AuthButtons } from "@/components/layout/auth-buttons";
import { auth } from "@/server/auth/auth";
import { getSoldierProfile, isSeasonAdmin } from "@/server/db/stores/soldier-store";
import { getSeasonName } from "@/server/db/stores/season-store";

interface SeasonLayoutProps {
  children: React.ReactNode;
  params: Promise<{ seasonId: string }>;
}

export default async function SeasonLayout({
  children,
  params,
}: SeasonLayoutProps) {
  const { seasonId } = await params;

  const [season, session] = await Promise.all([
    getSeasonName(seasonId),
    auth(),
  ]);
  if (!season) notFound();
  if (session?.user && !session.user.isApproved && !session.user.isAdmin) {
    redirect("/auth/pending");
  }

  let isAdmin = false;
  if (session?.user?.id) {
    const profile = await getSoldierProfile(session.user.id);
    if (profile) {
      isAdmin = await isSeasonAdmin(seasonId, profile.id);
    }
  }

  const soldierNav = [
    { href: `/season/${seasonId}/board`, label: "בית" },
    { href: `/season/${seasonId}/my-schedule`, label: "הסידור שלי" },
    { href: `/season/${seasonId}/transitions`, label: "כניסות/יציאות" },
    { href: `/season/${seasonId}/profile`, label: "הפרופיל שלי" },
  ];

  const adminNav = [
    { href: `/season/${seasonId}/admin/soldiers`, label: "ניהול" },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              title="חזרה לדף הבית"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" />
              </svg>
            </Link>
            <Link href={`/season/${seasonId}/board`} className="text-lg font-bold">
              {season.name}
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <nav className="hidden gap-1 overflow-x-auto md:flex">
              {soldierNav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
                >
                  {item.label}
                </Link>
              ))}
              {isAdmin && (
                <>
                  <div className="mx-1 w-px self-stretch bg-zinc-200 dark:bg-zinc-700" />
                  {adminNav.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
                    >
                      {item.label}
                    </Link>
                  ))}
                </>
              )}
            </nav>
            <AuthButtons isLoggedIn={!!session?.user} />
          </div>
        </div>
      </header>
      <main className="flex flex-1 flex-col pb-16 md:pb-0">{children}</main>
      <MobileNav seasonId={seasonId} isAdmin={isAdmin} />
    </div>
  );
}
