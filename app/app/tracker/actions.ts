"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { TrackerInput } from "@/lib/tracker";
import { requireUser } from "@/lib/server/workspace";

export interface TrackerState {
  error?: string;
  ok?: boolean;
}

const blankToUndefined = (v: FormDataEntryValue | null) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? undefined : s;
};

export async function saveTrackerAction(_prev: TrackerState, form: FormData): Promise<TrackerState> {
  const ws = await requireUser("/app/tracker");
  const parsed = TrackerInput.safeParse(
    Object.fromEntries(
      ["id", "company", "role", "status", "appliedAt", "followUpAt", "interviewAt", "contactName", "contactEmail", "notes", "offer", "applyUrl"].map(
        (k) => [k, blankToUndefined(form.get(k))],
      ),
    ),
  );
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the fields and try again." };
  const now = new Date().toISOString();
  const rows = await ws.store.listTracker();
  const prev = parsed.data.id ? rows.find((r) => r.id === parsed.data.id) : undefined;
  if (parsed.data.id && !prev) return { error: "That entry no longer exists." };
  const d = parsed.data;
  await ws.store.saveTracker({
    ...prev,
    id: prev?.id ?? randomUUID(),
    company: d.company,
    role: d.role,
    status: d.status,
    appliedAt: d.appliedAt || (d.status === "applied" && !prev?.appliedAt ? now.slice(0, 10) : prev?.appliedAt),
    followUpAt: d.followUpAt || undefined,
    interviewAt: d.interviewAt || undefined,
    contactName: d.contactName,
    contactEmail: d.contactEmail || undefined,
    notes: d.notes,
    offer: d.offer,
    applyUrl: d.applyUrl || prev?.applyUrl,
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
  });
  revalidatePath("/app/tracker");
  return { ok: true };
}

export async function deleteTrackerAction(form: FormData): Promise<void> {
  const ws = await requireUser("/app/tracker");
  await ws.store.deleteTracker(String(form.get("id") ?? ""));
  revalidatePath("/app/tracker");
}
