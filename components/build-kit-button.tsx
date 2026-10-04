"use client";

import { useActionState } from "react";
import { createKitAction, type KitActionState } from "@/app/app/kits/actions";

export function BuildKitButton({ jobId, remaining }: { jobId: string; remaining: number }) {
  const [state, action, pending] = useActionState<KitActionState, FormData>(createKitAction, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="jobId" value={jobId} />
      <button type="submit" className="btn btn-pen" disabled={pending || remaining <= 0}>
        {pending ? "Writing your kit" : "Build application kit"}
      </button>
      <span className="text-sm text-ink-2">
        {remaining > 0 ? `${remaining} left this month. CV, cover letter, outreach and interview prep.` : "No kits left this month."}
      </span>
      {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
    </form>
  );
}
