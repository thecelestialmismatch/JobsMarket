import type { Metadata } from "next";
import { UploadForm } from "@/components/upload-form";
import { requireUser } from "@/lib/server/workspace";

export const metadata: Metadata = { title: "Upload CV" };

export default async function UploadPage() {
  const ws = await requireUser("/app/upload");
  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <h1 className="display text-3xl sm:text-4xl">{ws.cv ? "Replace your CV" : "Upload your CV"}</h1>
      <p className="text-ink-2">
        The new file replaces the old one everywhere. Kits you already built keep the CV they were written from.
      </p>
      <UploadForm />
    </div>
  );
}
