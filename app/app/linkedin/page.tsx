import type { Metadata } from "next";
import { LinkedInAudit } from "@/components/linkedin-audit";
import { requireUser } from "@/lib/server/workspace";

export const metadata: Metadata = { title: "LinkedIn profile" };

export default async function LinkedInPage() {
  await requireUser("/app/linkedin");
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <p className="label">LinkedIn profile</p>
        <h1 className="display mt-1 text-3xl sm:text-4xl">What a recruiter reads before they open your CV</h1>
      </div>
      <LinkedInAudit />
    </div>
  );
}
