"use client";

import Link from "next/link";
import { useActionState, useId } from "react";
import type { AuthState } from "@/app/(auth)/actions";

interface Props {
  mode: "signin" | "signup";
  action: (prev: AuthState, form: FormData) => Promise<AuthState>;
  next?: string;
  plan?: string;
}

export function AuthForm({ mode, action, next, plan }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const email = useId();
  const password = useId();
  return (
    <form action={formAction} className="sheet flex flex-col gap-4 p-5">
      <input type="hidden" name="next" value={next ?? ""} />
      <input type="hidden" name="plan" value={plan ?? ""} />
      <div className="flex flex-col gap-1">
        <label htmlFor={email} className="label">Email</label>
        <input id={email} name="email" type="email" required autoComplete="email" className="field" maxLength={254} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={password} className="label">Password</label>
        <input
          id={password}
          name="password"
          type="password"
          required
          minLength={8}
          maxLength={128}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          className="field"
        />
        {mode === "signup" && <span className="text-sm text-ink-2">At least 8 characters.</span>}
      </div>
      {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      {state.info && <p role="status" className="hl hl-match self-start text-sm">{state.info}</p>}
      <button type="submit" className="btn btn-pen" disabled={pending}>
        {mode === "signup" ? (pending ? "Creating account" : "Create account") : pending ? "Signing in" : "Sign in"}
      </button>
      <p className="text-sm text-ink-2">
        {mode === "signup" ? (
          <>Already have an account? <Link className="link" href="/login">Sign in</Link></>
        ) : (
          <>New here? <Link className="link" href="/signup">Create an account</Link></>
        )}
      </p>
    </form>
  );
}
