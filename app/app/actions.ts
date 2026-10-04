"use server";

import { redirect } from "next/navigation";
import { claimPendingDraft } from "@/lib/server/cookies";
import { requireUser } from "@/lib/server/workspace";

export async function claimDraftAction(): Promise<void> {
  const ws = await requireUser();
  await claimPendingDraft(ws.store);
  redirect("/app");
}
