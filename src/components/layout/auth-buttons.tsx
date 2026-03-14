"use client";

import { useState } from "react";
import { signIn, signOut } from "next-auth/react";

export function AuthButtons({ isLoggedIn }: { readonly isLoggedIn: boolean }) {
  const [loading, setLoading] = useState(false);

  if (isLoggedIn) {
    return (
      <button
        disabled={loading}
        onClick={() => {
          setLoading(true);
          signOut({ callbackUrl: "/" });
        }}
        className="text-sm font-medium text-red-600 transition-colors hover:text-red-800 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
      >
        {loading ? "מתנתק..." : "התנתק"}
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
