"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface MobileNavProps {
  seasonId: string;
  isAdmin: boolean;
}

const LEFT_ITEMS = [
  { path: "my-schedule", label: "שלי", icon: "user" },
  { path: "constraints", label: "אילוצים", icon: "calendar" },
] as const;

const RIGHT_ITEMS = [
  { path: "transitions", label: "מעברים", icon: "arrows" },
  { path: "profile", label: "פרופיל", icon: "profile" },
] as const;

const ADMIN_MENU_ITEMS = [
  { path: "admin/soldiers", label: "חיילים" },
  { path: "admin/constraints", label: "ניהול אילוצים" },
  { path: "admin/management", label: "ניהול סידור" },
] as const;

export function MobileNav({ seasonId, isAdmin }: MobileNavProps) {
  const pathname = usePathname();
  const [adminSheetOpen, setAdminSheetOpen] = useState(false);

  useEffect(() => {
    setAdminSheetOpen(false);
  }, [pathname]);

  const boardHref = `/season/${seasonId}/board`;
  const isBoardActive =
    pathname === boardHref || pathname.startsWith(boardHref + "/");

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 md:hidden">
        <div className="flex items-end justify-around">
          {LEFT_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              href={`/season/${seasonId}/${item.path}`}
              label={item.label}
              icon={item.icon}
              isActive={
                pathname === `/season/${seasonId}/${item.path}` ||
                pathname.startsWith(`/season/${seasonId}/${item.path}/`)
              }
            />
          ))}

          <Link
            href={boardHref}
            className="flex flex-col items-center gap-0.5 pb-1"
          >
            <div
              className={`-mt-5 flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-colors ${
                isBoardActive
                  ? "bg-blue-700 dark:bg-blue-500"
                  : "bg-blue-600 dark:bg-blue-600"
              }`}
            >
              <svg
                className="h-6 w-6 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"
                />
              </svg>
            </div>
            <span
              className={`text-[10px] ${
                isBoardActive
                  ? "font-semibold text-blue-600 dark:text-blue-400"
                  : "text-zinc-400 dark:text-zinc-500"
              }`}
            >
              לוח
            </span>
          </Link>

          {RIGHT_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              href={`/season/${seasonId}/${item.path}`}
              label={item.label}
              icon={item.icon}
              isActive={
                pathname === `/season/${seasonId}/${item.path}` ||
                pathname.startsWith(`/season/${seasonId}/${item.path}/`)
              }
            />
          ))}

          {isAdmin && (
            <button
              onClick={() => setAdminSheetOpen(!adminSheetOpen)}
              className={`flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px] ${
                pathname.includes("/admin")
                  ? "text-zinc-900 dark:text-zinc-100"
                  : "text-zinc-400 dark:text-zinc-500"
              }`}
            >
              <NavIcon type="settings" />
              ניהול
            </button>
          )}
        </div>
      </nav>
      {adminSheetOpen && (
        <AdminSheet
          seasonId={seasonId}
          onClose={() => setAdminSheetOpen(false)}
        />
      )}
    </>
  );
}

function NavLink({
  href,
  label,
  icon,
  isActive,
}: {
  href: string;
  label: string;
  icon: string;
  isActive: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px] ${
        isActive
          ? "text-zinc-900 dark:text-zinc-100"
          : "text-zinc-400 dark:text-zinc-500"
      }`}
    >
      <NavIcon type={icon} />
      {label}
    </Link>
  );
}

function AdminSheet({
  seasonId,
  onClose,
}: {
  seasonId: string;
  onClose: () => void;
}) {
  return createPortal(
    <div className="fixed inset-0 z-[60] md:hidden">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div className="absolute bottom-14 left-0 right-0 rounded-t-2xl border-t border-zinc-200 bg-white px-4 pb-4 pt-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold">ניהול</span>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex flex-col gap-1">
          {ADMIN_MENU_ITEMS.map((item) => (
            <Link
              key={item.path}
              href={`/season/${seasonId}/${item.path}`}
              className="rounded-lg px-3 py-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 active:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function NavIcon({ type }: { type: string }) {
  const className = "h-5 w-5";
  switch (type) {
    case "user":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      );
    case "calendar":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    case "arrows":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      );
    case "profile":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case "settings":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    default:
      return null;
  }
}
