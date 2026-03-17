"use client";

import { useCallback, useState } from "react";
import { SessionProvider, useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";

function PendingContentInner() {
  const router = useRouter();
  const { update } = useSession();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");

  const refreshApprovalStatus = useCallback(async () => {
    setIsRefreshing(true);
    setError("");
    try {
      const nextSession = await update();
      if (nextSession?.user?.isApproved || nextSession?.user?.isAdmin) {
        router.push("/");
        router.refresh();
      } else {
        setError("החשבון עדיין ממתין לאישור מנהל.");
      }
    } catch {
      setError("לא הצלחנו לבדוק את סטטוס האישור. נסו שוב.");
    } finally {
      setIsRefreshing(false);
    }
  }, [router, update]);

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="mb-3 text-center text-2xl font-bold">ממתין לאישור</h1>
        <p className="mb-5 text-center text-sm text-zinc-500 dark:text-zinc-400">
          מנהל המערכת צריך לאשר את החשבון לפני שתוכלו להיכנס.
          לאחר האישור תוכלו להיכנס לדף הבית.
        </p>

        {error && (
          <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-center text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-3">
          <button
            onClick={() => void refreshApprovalStatus()}
            disabled={isRefreshing}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {isRefreshing ? "בודק..." : "בדוק שוב"}
          </button>
          <button
            onClick={() => signOut({ callbackUrl: "/auth/login" })}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            התנתק
          </button>
        </div>
      </div>
    </main>
  );
}

export function PendingContent() {
  return (
    <SessionProvider>
      <PendingContentInner />
    </SessionProvider>
  );
}
