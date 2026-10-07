import { RUBRIC } from "@/lib/match/rubric";
import { PLANS } from "@/lib/plans";

// Every statement about AIApply here was read from aiapply.co on CHECKED_ON. Re-read the site and
// move the date before changing any of them. JobsMarket statements must match what the code does.
export const CHECKED_ON = "7 October 2026";
export const CHECKED_ON_ISO = "2026-10-07";

export interface CompareRow {
  topic: string;
  aiapply: string;
  jobsmarket: string;
  /** AIApply does not publish this, so the cell carries the "not stated" highlight. */
  unpublished?: boolean;
}

const { free, pro } = PLANS;

export const LEDE =
  "AIApply is built to send applications for you. JobsMarket is built the other way round. It scores live roles against your CV, drafts the documents with every sentence traced to a line you wrote, and leaves the submit button with you.";

export const ROWS: readonly CompareRow[] = [
  {
    topic: "Who presses submit",
    aiapply: "Auto-Apply finds matching listings, tailors your documents and submits applications for you.",
    jobsmarket: "You do, on the employer's own site. JobsMarket has never submitted an application.",
  },
  {
    topic: "How it is priced",
    aiapply: "A Premium subscription covers the writing and interview tools. Auto-Apply costs extra and is sold as credit packs, such as 100 or 250 applications.",
    jobsmarket: `Free, or ${pro.label} at ${pro.price}. Everything is in the plan, with no credits and no add ons.`,
  },
  {
    topic: "Prices on the website",
    aiapply: `No prices on its public pages when we checked on ${CHECKED_ON}. The pricing address opens the homepage.`,
    jobsmarket: "Both plans and their monthly limits are on the homepage.",
    unpublished: true,
  },
  {
    topic: "Where the writing comes from",
    aiapply: "AI writes a tailored resume and cover letter for each role, and you can edit them before they are sent.",
    jobsmarket: "Every sentence carries a tag naming the CV line it came from. A fact check removes any number, employer, skill or certification your CV does not contain.",
  },
  {
    topic: "How fit is scored",
    aiapply: "Says it finds high match roles. We could not find how the match is worked out.",
    jobsmarket: `A published rubric. Skills ${RUBRIC.skills}, role alignment ${RUBRIC.role}, years of experience ${RUBRIC.experience}, location ${RUBRIC.location} and qualifications ${RUBRIC.education}. A requirement with no evidence stays on screen.`,
    unpublished: true,
  },
  {
    topic: "Job listings",
    aiapply: "Says it has more than 20 million live listings from thousands of sources.",
    jobsmarket: "Far fewer. Roles come from employers' own job boards on Greenhouse, Lever and Ashby, plus Remotive and Adzuna, and closed roles are removed.",
  },
  {
    topic: "Interview help",
    aiapply: "Mock interviews, plus Interview Buddy, which suggests answers through your earpiece or screen during a live interview.",
    jobsmarket: "Interview prep notes in every application kit. Nothing runs during the interview itself.",
  },
  {
    topic: "What you take away",
    aiapply: "Resumes and cover letters in a choice of templates, exported as PDF or Word.",
    jobsmarket: "A single column Word CV that screening software parses cleanly, plus a cover letter, an outreach note, LinkedIn drafts and interview prep.",
  },
];

export const CHOOSE_AIAPPLY: readonly string[] = [
  "You want software to send a large number of applications for you.",
  "You want the biggest pool of listings in one place.",
  "You want suggestions on screen while an interview is happening.",
];

export const CHOOSE_JOBSMARKET: readonly string[] = [
  "You apply to fewer roles and want each application to hold up when an interviewer asks about it.",
  "You want to see which requirements your CV proves before you spend an evening on an application.",
  "You want every sentence in your documents to trace back to something you wrote.",
  "You want one published price with nothing sold on top.",
];

export const WHY: readonly string[] = [
  "An application sent under your name is a statement about you. If you never read it, you cannot stand behind it when a recruiter calls.",
  "Many job sites forbid automated applications in their terms of use, and a letter that could have gone to any employer is easy to spot.",
  "So JobsMarket does the slow parts, which are reading the advert, matching it to your evidence and drafting. The decision and the submit button stay with you.",
];

export const FAQ: readonly { q: string; a: string }[] = [
  {
    q: "Is JobsMarket a free AIApply alternative?",
    a: `Yes, for a focused search. The free plan includes ${free.limits.scan} CV scans and ${free.limits.kit} application kits a month, and no card is needed. ${pro.label} is ${pro.price} for ${pro.limits.kit} kits.`,
  },
  {
    q: "Can JobsMarket apply to jobs for me like AIApply does?",
    a: "No, and it never will. It drafts, you review, and you apply on the employer's own site. You stay the author of every application.",
  },
  {
    q: "Does JobsMarket write cover letters?",
    a: "Yes. Each application kit has a tailored CV, a cover letter, an outreach note, LinkedIn drafts and interview prep. Every sentence is checked against your CV before you see it.",
  },
  {
    q: "Can I use JobsMarket and AIApply together?",
    a: "You can. Nothing stops you using JobsMarket to check fit and draft for the roles you care about most while using another tool for volume.",
  },
  {
    q: "How did you check AIApply?",
    a: `We read AIApply's own website on ${CHECKED_ON}. Products change, so check aiapply.co for its current features and prices.`,
  },
];

export const NOT_AFFILIATED = `AIApply is a trademark of its owner. JobsMarket is not affiliated with AIApply. Statements about AIApply come from aiapply.co as read on ${CHECKED_ON}.`;

/** Every user-facing string on the page, for the house style check. */
export function allCopy(): string[] {
  return [
    LEDE,
    ...ROWS.flatMap((r) => [r.topic, r.aiapply, r.jobsmarket]),
    ...CHOOSE_AIAPPLY,
    ...CHOOSE_JOBSMARKET,
    ...WHY,
    ...FAQ.flatMap((f) => [f.q, f.a]),
    NOT_AFFILIATED,
  ];
}
