import { ShieldCheck, Sparkles } from "lucide-react";

import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="mb-8 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="font-display text-2xl font-semibold tracking-tight">Agency AI</span>
      </div>
      <h1 className="font-display text-center text-3xl text-foreground sm:text-4xl">আপনার অ্যাডের সাথে কথা বলুন</h1>
      <p className="mt-3 max-w-md text-center text-sm leading-6 text-muted-foreground">
        Meta Ads-এর সব ডেটা এক জায়গায়। প্রশ্ন করুন, উত্তর পান, সিদ্ধান্ত নিন।
      </p>
      <div className="mt-8 w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-sm">
        <LoginForm />
      </div>
      <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
        Read-only access · Meta-তে কোনো পরিবর্তন করা যায় না
      </p>
    </main>
  );
}
