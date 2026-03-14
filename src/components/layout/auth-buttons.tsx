"use client";

import { signIn, signOut } from "next-auth/react";

export function AuthButtons({ isLoggedIn }: { readonly isLoggedIn: boolean }) {
  if (isLoggedIn) {
    return (
      <button
        onClick={() => signOut({ callbackUrl: "/" })}
        className="text-sm font-medium text-red-600 transition-colors hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
      >
        התנתק
      </button>
    );
  }

  return (
    <button
      onClick={() => signIn("google")}
      className="text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
    >
      התחבר
    </button>
  );
}
