"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDown, LogOut, Menu, MessageSquare, Plus, Sparkles, X } from "lucide-react";

import { primaryNavigation } from "@/components/layout/navigation";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { cn } from "@/lib/utils";

type ConversationSummary = { id: string; title: string; updatedAt: string };

export const CHAT_UPDATED_EVENT = "agency-ai:chat-updated";
export const NEW_CHAT_EVENT = "agency-ai:new-chat";

async function fetchConversations(): Promise<ConversationSummary[] | null> {
  try {
    const response = await fetch("/api/ai/conversations?limit=40", { cache: "no-store" });
    const body = (await response.json()) as { ok?: boolean; conversations?: ConversationSummary[] };
    return body.ok && body.conversations ? body.conversations : null;
  } catch {
    // Recents are a convenience; the rest of the app works without them.
    return null;
  }
}

export function Sidebar({ userEmail, logoutAction }: { userEmail: string | null; logoutAction: () => Promise<void> }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(true);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void fetchConversations().then((rows) => {
        if (active && rows) setConversations(rows);
      });
    };
    refresh();
    window.addEventListener(CHAT_UPDATED_EVENT, refresh);
    return () => {
      active = false;
      window.removeEventListener(CHAT_UPDATED_EVENT, refresh);
    };
  }, [pathname]);

  const initials = (userEmail ?? "A").slice(0, 2).toUpperCase();

  return (
    <>
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
        <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" className="rounded-lg p-1.5 text-muted-foreground hover:bg-foreground/5 hover:text-foreground">
          <Menu className="h-5 w-5" />
        </button>
        <Link href="/chat" className="font-display text-lg font-semibold">
          Agency AI
        </Link>
      </div>

      {open && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setOpen(false)} aria-hidden="true" />}

      <aside
        onClick={(event) => {
          // Close the mobile drawer after following any link inside it.
          if ((event.target as HTMLElement).closest("a")) setOpen(false);
        }}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-border bg-sidebar transition-transform duration-200 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <Link href="/chat" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="font-display text-xl font-semibold tracking-tight">Agency AI</span>
          </Link>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="rounded-lg p-1.5 text-muted-foreground hover:bg-foreground/5 lg:hidden">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-3 pt-2">
          <Link
            href="/chat"
            onClick={() => window.dispatchEvent(new Event(NEW_CHAT_EVENT))}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition hover:bg-foreground/5",
              pathname === "/chat" ? "bg-foreground/[0.07] text-foreground" : "text-foreground"
            )}
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Plus className="h-4 w-4" aria-hidden="true" />
            </span>
            New chat
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-4">
          <button
            type="button"
            onClick={() => setWorkspaceOpen((value) => !value)}
            className="mt-4 flex w-full items-center justify-between px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Workspace
            <ChevronDown className={cn("h-3.5 w-3.5 transition", workspaceOpen ? "" : "-rotate-90")} aria-hidden="true" />
          </button>
          {workspaceOpen && (
            <nav className="mt-1 space-y-0.5" aria-label="Workspace">
              {primaryNavigation.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm transition hover:bg-foreground/5 hover:text-foreground",
                      active ? "bg-foreground/[0.07] text-foreground" : "text-muted-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4" aria-hidden="true" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          )}

          <p className="mt-5 px-3 py-1 text-xs font-medium text-muted-foreground">Recents</p>
          <div className="mt-1 space-y-0.5">
            {conversations.length === 0 && <p className="px-3 py-1.5 text-xs text-muted-foreground">No chats yet</p>}
            {conversations.map((conversation) => {
              const href = `/chat/${conversation.id}`;
              return (
                <Link
                  key={conversation.id}
                  href={href}
                  title={conversation.title}
                  className={cn(
                    "flex items-center gap-2 truncate rounded-lg px-3 py-1.5 text-sm transition hover:bg-foreground/5 hover:text-foreground",
                    pathname === href ? "bg-foreground/[0.07] text-foreground" : "text-muted-foreground"
                  )}
                >
                  <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
                  <span className="truncate">{conversation.title}</span>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="border-t border-border p-3">
          <ThemeToggle />
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sign out
            </button>
          </form>
          <div className="mt-2 flex items-center gap-3 rounded-lg px-3 py-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground/10 text-xs font-semibold">{initials}</span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{userEmail ?? "Admin"}</span>
              <span className="block text-xs text-muted-foreground">Read-only Meta access</span>
            </span>
          </div>
        </div>
      </aside>
    </>
  );
}
