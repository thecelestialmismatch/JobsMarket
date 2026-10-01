import "server-only";
import { redirect } from "next/navigation";
import type { ParsedCV, SessionUser } from "@/lib/types";
import { getViewer, type Viewer } from "./viewer";

export type Workspace = Viewer & { user: SessionUser };
export type WorkspaceWithCv = Workspace & { cv: ParsedCV };

/** Signed in viewer or a redirect to sign in. The real gate for every /app page. */
export async function requireUser(next = "/app"): Promise<Workspace> {
  const v = await getViewer();
  if (!v.user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return v as Workspace;
}

/** Signed in viewer with a CV on file, or a redirect to upload one. */
export async function requireCv(next = "/app"): Promise<WorkspaceWithCv> {
  const v = await requireUser(next);
  if (!v.cv) redirect("/app/upload");
  return v as WorkspaceWithCv;
}
