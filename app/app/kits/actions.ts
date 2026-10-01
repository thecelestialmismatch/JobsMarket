"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { buildKit } from "@/lib/server/kits";
import { requireCv, requireUser } from "@/lib/server/workspace";

export interface KitActionState {
  error?: string;
}

export async function createKitAction(_prev: KitActionState, form: FormData): Promise<KitActionState> {
  const jobId = String(form.get("jobId") ?? "");
  const ws = await requireCv(`/app/jobs/${encodeURIComponent(jobId)}`);
  const res = await buildKit(ws, jobId);
  if (!res.ok) return { error: res.error };
  redirect(`/app/kits/${res.kit.id}`);
}

export async function approveKitAction(form: FormData): Promise<void> {
  const ws = await requireUser();
  const id = String(form.get("kitId") ?? "");
  await ws.store.setKitStatus(id, form.get("status") === "draft" ? "draft" : "approved");
  revalidatePath(`/app/kits/${id}`);
  revalidatePath("/app/kits");
}

/** Adds the kit's role to the tracker as saved, with the official apply link. Never applies. */
export async function trackKitAction(form: FormData): Promise<void> {
  const ws = await requireUser();
  const kit = await ws.store.getKit(String(form.get("kitId") ?? ""));
  if (!kit) return;
  const job = await ws.store.getJob(kit.jobId);
  const now = new Date().toISOString();
  const existing = (await ws.store.listTracker()).find((r) => r.jobId === kit.jobId);
  if (!existing) {
    await ws.store.saveTracker({
      id: randomUUID(),
      jobId: kit.jobId,
      company: job?.company ?? "Unknown employer",
      role: job?.title ?? "Unknown role",
      status: "saved",
      applyUrl: job?.applyUrl,
      createdAt: now,
      updatedAt: now,
    });
  }
  redirect("/app/tracker");
}
