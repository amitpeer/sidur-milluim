"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface MobileNavProps {
  seasonId: string;
  isAdmin: boolean;
}

const LEFT_ITEMS = [
  { path: "my-schedule", label: "שלי", icon: "user" },
] as const;

const RIGHT_ITEMS = [
  { path: "transitions", label: "כניסות", icon: "arrows" },
  { path: "profile", label: "פרופיל", icon: "profile" },
] as const;

export function MobileNav({ seasonId, isAdmin }: MobileNavProps) {
  const pathname = usePathname();

  const boardHref = `/season/${seasonId}/board`;
  const isBoardActive =
    pathname === boardHref || pathname.startsWith(boardHref + "/");

  const itemCount = LEFT_ITEMS.length + 1 + RIGHT_ITEMS.length + (isAdmin ? 1 : 0);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 md:hidden">
      <div className="grid items-end" style={{ gridTemplateColumns: `repeat(${itemCount}, 1fr)` }}>
        <NavLink
          href={boardHref}
          label="בית"
          icon="board"
          isActive={isBoardActive}
        />

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
          <NavLink
            href={`/season/${seasonId}/admin/soldiers`}
            label="ניהול"
            icon="settings"
            isActive={pathname.includes("/admin")}
          />
        )}
      </div>
    </nav>
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
      className={`flex flex-col items-center gap-1 py-2 text-[11px] ${
        isActive
          ? "text-zinc-900 dark:text-zinc-100"
          : "text-zinc-400 dark:text-zinc-500"
      }`}
    >
      <NavIcon type={icon} />
      {label}
      <span className={`h-1 w-1 rounded-full ${isActive ? "bg-zinc-900 dark:bg-zinc-100" : "bg-transparent"}`} />
    </Link>
  );
}

function NavIcon({ type }: { type: string }) {
  const className = "h-6 w-6";
  switch (type) {
    case "board":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" />
        </svg>
      );
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
