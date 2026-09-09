"use client";

import { useActionState } from "react";
import { LogIn } from "lucide-react";

import { Button } from "@/components/ui/button";
import { loginAction, type LoginFormState } from "./actions";

const initialState: LoginFormState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium text-slate-200">
          Admin email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm outline-none transition placeholder:text-slate-500 focus:border-sky-400 focus:ring-2 focus:ring-sky-400/30"
          placeholder="admin@example.com"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium text-slate-200">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm outline-none transition placeholder:text-slate-500 focus:border-sky-400 focus:ring-2 focus:ring-sky-400/30"
          placeholder="Enter password"
        />
      </div>
      {state.error ? (
        <div className="rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-100" role="alert">
          {state.error}
        </div>
      ) : null}
      <Button className="w-full" size="lg" type="submit" disabled={pending}>
        <LogIn className="h-4 w-4" aria-hidden="true" />
        {pending ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  );
}
