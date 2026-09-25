"use client";

import { usePathname } from "next/navigation";

// The chat owns the full viewport; every other page gets the standard page padding.
export function MainArea({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isChat = pathname === "/chat" || pathname.startsWith("/chat/");
  if (isChat) return <main className="h-[calc(100dvh-57px)] lg:h-dvh">{children}</main>;
  return <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-8">{children}</main>;
}
