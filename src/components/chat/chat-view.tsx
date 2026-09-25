"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, CalendarDays, Check, ChevronDown, Copy, Sparkles, UserRound } from "lucide-react";

import { CHAT_UPDATED_EVENT, NEW_CHAT_EVENT } from "@/components/layout/sidebar";
import { SELECTION_COOKIE, type ChatSelectionState } from "@/lib/chat/selection";
import { cn } from "@/lib/utils";

export type ChatMessage = { id: string; role: "user" | "assistant"; content: string };
export type ChatAccountOption = { id: string; name: string; currency: string };

type Selection = ChatSelectionState;

const PRESETS: Array<{ value: string; label: string }> = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last_7_days", label: "Last 7 days" },
  { value: "last_14_days", label: "Last 14 days" },
  { value: "last_30_days", label: "Last 30 days" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "custom", label: "Custom range" }
];

const SUGGESTIONS = [
  "গত ৭ দিনের পারফরম্যান্সের সামারি দাও",
  "কোন ক্যাম্পেইন সবচেয়ে ভালো করছে আর কোনটা খারাপ?",
  "কোথায় টাকা নষ্ট হচ্ছে? কী করা উচিত?",
  "বয়স ও লিঙ্গ অনুযায়ী ফলাফল দেখাও"
];

function saveSelection(selection: ChatSelectionState) {
  // A cookie (not localStorage) so the server renders the saved selection directly.
  document.cookie = `${SELECTION_COOKIE}=${encodeURIComponent(JSON.stringify(selection))}; path=/; max-age=31536000; samesite=lax`;
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function ChatView({
  conversationId: initialConversationId,
  initialMessages,
  accounts,
  initialSelection
}: {
  conversationId: string | null;
  initialMessages: ChatMessage[];
  accounts: ChatAccountOption[];
  initialSelection: ChatSelectionState;
}) {
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelectionState] = useState<Selection>(initialSelection);
  const setSelection: React.Dispatch<React.SetStateAction<Selection>> = (update) => {
    const next = typeof update === "function" ? update(selection) : update;
    saveSelection(next);
    setSelectionState(next);
  };
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // A new chat's URL is swapped to /chat/<id> in place, so "New chat" resets it explicitly.
  useEffect(() => {
    if (initialConversationId !== null) return;
    const reset = () => {
      setConversationId(null);
      setMessages([]);
      setError(null);
      setInput("");
    };
    window.addEventListener(NEW_CHAT_EVENT, reset);
    return () => window.removeEventListener(NEW_CHAT_EVENT, reset);
  }, [initialConversationId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 240)}px`;
  }, [input]);

  const customInvalid = selection.preset === "custom" && (!selection.since || !selection.until);

  async function send(text: string) {
    const message = text.trim();
    if (!message || pending) return;
    if (customInvalid) {
      setError("Custom range-এর শুরু আর শেষের তারিখ দুটোই দিন।");
      return;
    }
    setError(null);
    setInput("");
    setMessages((current) => [...current, { id: `local-${Date.now()}`, role: "user", content: message }]);
    setPending(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          conversationId: conversationId ?? undefined,
          accountId: selection.accountId ?? undefined,
          ...(selection.preset === "custom" ? { since: selection.since, until: selection.until } : { preset: selection.preset })
        })
      });
      const body = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        conversationId?: string;
        message?: { id: string | null; content: string };
      };
      if (!response.ok || !body.ok || !body.message) throw new Error(body.error ?? "উত্তর পাওয়া যায়নি। আবার চেষ্টা করুন।");
      const reply = body.message;
      setMessages((current) => [...current, { id: reply.id ?? `reply-${Date.now()}`, role: "assistant", content: reply.content }]);
      if (!conversationId && body.conversationId) {
        setConversationId(body.conversationId);
        window.history.replaceState(null, "", `/chat/${body.conversationId}`);
      }
      window.dispatchEvent(new Event(CHAT_UPDATED_EVENT));
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "উত্তর পাওয়া যায়নি।");
      setInput(message);
    } finally {
      setPending(false);
      textareaRef.current?.focus();
    }
  }

  const composer = (
    <Composer
      input={input}
      setInput={setInput}
      onSend={() => void send(input)}
      pending={pending}
      textareaRef={textareaRef}
      accounts={accounts}
      selection={selection}
      setSelection={setSelection}
    />
  );

  if (messages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-4 pb-16">
        <h1 className="font-display mb-8 flex items-center gap-3 text-center text-3xl text-foreground sm:text-4xl">
          <Sparkles className="h-8 w-8 text-primary" aria-hidden="true" />
          {greeting()}
        </h1>
        <div className="w-full max-w-2xl">
          {composer}
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
          {accounts.length === 0 && (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              এখনো কোনো ad account sync হয়নি। <a href="/settings" className="text-primary underline underline-offset-2">Settings</a> থেকে account sync করুন।
            </p>
          )}
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => void send(suggestion)}
                disabled={pending}
                className="rounded-full border border-border bg-card px-4 py-2 text-sm text-muted-foreground transition hover:border-foreground/20 hover:text-foreground disabled:opacity-50"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-8">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          {pending && <Thinking />}
        </div>
      </div>
      <div className="mx-auto w-full max-w-3xl px-4 pb-4">
        {error && <p className="mb-2 text-sm text-destructive">{error}</p>}
        {composer}
        <p className="mt-2 text-center text-xs text-muted-foreground">Agency AI শুধু sync করা ডেটা পড়ে। গুরুত্বপূর্ণ সিদ্ধান্তের আগে Reports পেজে মিলিয়ে নিন।</p>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const [copied, setCopied] = useState(false);
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="flex max-w-[85%] items-start gap-3 rounded-2xl bg-secondary px-4 py-3 text-[15px] leading-7">
          <UserRound className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="group flex gap-3">
      <Sparkles className="mt-1.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="chat-prose">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              table: ({ children }) => (
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table>{children}</table>
                </div>
              ),
              a: ({ href, children }) => (
                <a href={href} target={href?.startsWith("/") ? undefined : "_blank"} rel="noreferrer">
                  {children}
                </a>
              )
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(message.content).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          className="mt-2 flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground opacity-0 transition hover:bg-foreground/5 hover:text-foreground group-hover:opacity-100"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

function Thinking() {
  return (
    <div className="flex items-center gap-3 text-sm text-muted-foreground">
      <Sparkles className="h-5 w-5 animate-pulse text-primary" aria-hidden="true" />
      ডেটা দেখে উত্তর তৈরি করছি…
    </div>
  );
}

function Composer({
  input,
  setInput,
  onSend,
  pending,
  textareaRef,
  accounts,
  selection,
  setSelection
}: {
  input: string;
  setInput: (value: string) => void;
  onSend: () => void;
  pending: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  accounts: ChatAccountOption[];
  selection: Selection;
  setSelection: React.Dispatch<React.SetStateAction<Selection>>;
}) {
  const presetLabel = useMemo(() => PRESETS.find((preset) => preset.value === selection.preset)?.label ?? "Last 7 days", [selection.preset]);
  const canSend = input.trim().length > 0 && !pending;

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm transition focus-within:border-foreground/25">
      <textarea
        ref={textareaRef}
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            onSend();
          }
        }}
        rows={1}
        placeholder="আপনার অ্যাড নিয়ে যেকোনো প্রশ্ন করুন…"
        aria-label="Message"
        className="block max-h-60 w-full resize-none bg-transparent px-4 pb-2 pt-4 text-[15px] leading-6 text-foreground outline-none placeholder:text-muted-foreground"
      />
      <div className="flex flex-wrap items-center gap-2 px-3 pb-3">
        <SelectPill
          label={accounts.find((account) => account.id === selection.accountId)?.name ?? "No account"}
          value={selection.accountId ?? ""}
          onChange={(value) => setSelection((current) => ({ ...current, accountId: value || null }))}
          options={accounts.map((account) => ({ value: account.id, label: `${account.name} · ${account.currency}` }))}
          ariaLabel="Ad account"
          disabled={accounts.length === 0}
        />
        <SelectPill
          label={presetLabel}
          value={selection.preset}
          onChange={(value) => setSelection((current) => ({ ...current, preset: value }))}
          options={PRESETS}
          ariaLabel="Date range"
          icon={<CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />}
        />
        {selection.preset === "custom" && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="date"
              value={selection.since}
              max={selection.until || undefined}
              onChange={(event) => setSelection((current) => ({ ...current, since: event.target.value }))}
              aria-label="Start date"
              className="rounded-lg border border-border bg-background px-2 py-1 text-foreground"
            />
            →
            <input
              type="date"
              value={selection.until}
              min={selection.since || undefined}
              onChange={(event) => setSelection((current) => ({ ...current, until: event.target.value }))}
              aria-label="End date"
              className="rounded-lg border border-border bg-background px-2 py-1 text-foreground"
            />
          </div>
        )}
        <button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          aria-label="Send message"
          className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function SelectPill({
  label,
  value,
  onChange,
  options,
  ariaLabel,
  icon,
  disabled
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  ariaLabel: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}) {
  // A native select keeps keyboard and mobile pickers working; the pill is its visual shell.
  return (
    <label
      className={cn(
        "relative flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground",
        disabled && "opacity-50"
      )}
    >
      {icon}
      <span className="max-w-[180px] truncate">{label}</span>
      <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={ariaLabel}
        disabled={disabled}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
