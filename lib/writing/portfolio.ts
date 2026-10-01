import type { JobRequirements, ParsedCV } from "@/lib/types";
import { classifyTitle, roleFamily } from "@/lib/skills";

/** A portfolio is only worth attaching for roles where reviewers look at work samples. */
export function shouldIncludePortfolio(
  job: { title: string; requirements: JobRequirements },
  cv: ParsedCV,
): { include: boolean; reason: string } {
  const familyId = job.requirements.roleFamily ?? classifyTitle(job.title);
  const family = familyId ? roleFamily(familyId) : undefined;
  if (!family?.portfolioBenefit) {
    return { include: false, reason: "No portfolio, because reviewers for this kind of role rarely look at work samples." };
  }
  const hasWork = cv.projects.length > 0 || cv.contact.links.some((l) => /github\.com|portfolio|behance|dribbble/i.test(l));
  return hasWork
    ? { include: true, reason: `Portfolio included, because ${family.label} hiring teams usually review work samples.` }
    : { include: false, reason: "No portfolio, because the CV lists no projects or portfolio links to draw from." };
}
