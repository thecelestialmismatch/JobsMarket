// Builds the step list the LinkedIn Profile Filler extension walks through. Pure and deterministic, so
// the browser can show problems as the user types and the server can rebuild the same plan before it
// packs the extension. Nothing here talks to LinkedIn.
import { z } from "zod";
import { lintText } from "@/lib/writing/lint";

/** LinkedIn's published limits. The extension also reads each field's maxLength live and refuses to truncate. */
export const LIMITS = {
  headline: 220,
  about: 2600,
  position: 2000,
  project: 2000,
  education: 1000,
  topSkills: 5,
  skills: 100,
  openToWorkTitles: 5,
} as const;

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;
export type Month = (typeof MONTHS)[number];

export const WORKPLACES = ["On-site", "Hybrid", "Remote"] as const;
export const JOB_TYPES = ["Full-time", "Part-time", "Contract", "Temporary", "Internship"] as const;

const CURRENT_PROJECT = ["I am currently working on this project", "I am currently working on this"];
const COMPANY = ["Company or organization", "Company or organisation", "Company name", "Company"];

const text = (max: number) => z.string().trim().max(max);
const required = (max: number) => z.string().trim().min(1, "Fill this in.").max(max);
const year = z.number().int().min(1950).max(2100);

// Hard caps stop abuse. The friendlier LinkedIn limits are reported by buildPlan as issues.
export const FillInputSchema = z.object({
  owner: required(80),
  profileUrl: required(300),
  headline: text(2000).optional(),
  about: text(10000).optional(),
  topSkills: z.array(required(80)).max(30).optional(),
  positions: z
    .array(
      z.object({
        title: required(100),
        company: required(100),
        dates: text(60).optional(),
        description: text(5000),
        append: z.boolean().optional(),
      }),
    )
    .max(40)
    .optional(),
  projects: z
    .array(
      z.object({
        name: required(255),
        description: text(5000),
        current: z.boolean().optional(),
        end: z.object({ month: z.enum(MONTHS), year }).optional(),
        append: z.boolean().optional(),
      }),
    )
    .max(40)
    .optional(),
  education: z
    .array(z.object({ school: required(150), description: text(5000), append: z.boolean().optional() }))
    .max(15)
    .optional(),
  certifications: z
    .array(
      z.object({ name: required(200), issuer: required(200), month: z.enum(MONTHS).optional(), year: year.optional() }),
    )
    .max(40)
    .optional(),
  skills: z.array(required(80)).max(300).optional(),
  openToWork: z
    .object({
      titles: z.array(required(100)).max(20),
      locations: z.array(required(120)).max(20),
      workplace: z.array(z.enum(WORKPLACES)).max(3).optional(),
      types: z.array(z.enum(JOB_TYPES)).max(5).optional(),
      visibility: z.enum(["recruiters", "everyone"]).optional(),
    })
    .optional(),
});
export type FillInput = z.infer<typeof FillInputSchema>;

/** One condition the open form must meet before anything is typed. */
export interface FillGuard {
  labels: string[];
  equals?: string;
  contains?: string;
  /** The field must be empty, or already hold exactly this text (a second press on the same new item). */
  emptyOr?: string;
}
export interface FillField {
  labels: string[];
  text: string;
  append?: boolean;
  fallbackFirstTextarea?: boolean;
}
export interface FillSelect {
  scope?: string;
  option: string;
}
export interface FillCheck {
  labels: string[];
  checked: boolean;
}
export interface FillCopy {
  label: string;
  text: string;
}
export interface FillStep {
  id: string;
  group: string;
  title: string;
  hint: string;
  open: string;
  guard?: FillGuard[];
  fields?: FillField[];
  selects?: FillSelect[];
  checks?: FillCheck[];
  copy?: FillCopy[];
  skillList?: string[];
}
export interface FillPlan {
  version: 2;
  owner: string;
  profileUrl: string;
  createdAt: string;
  steps: FillStep[];
}
export interface PlanIssue {
  /** Step id, or "plan" for problems with the plan as a whole. */
  step: string;
  where: string;
  severity: "error" | "warning";
  message: string;
}

const SLUG = /^[A-Za-z0-9_%-]{3,100}$/;
const PROFILE = /^(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/([^/?#\s]+)\/?(?:[?#]\S*)?$/i;

/** The canonical profile address, from a full URL, a bare linkedin.com/in/... address or the name part alone. */
export function profileBase(raw: string): string | null {
  const value = raw.trim();
  const slug = PROFILE.exec(value)?.[1] ?? value;
  return SLUG.test(slug) ? `https://www.linkedin.com/in/${slug}/` : null;
}

function slugOf(label: string): string {
  return (
    label
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "item"
  );
}

/** Drops repeats regardless of case, keeping the first spelling. */
export function dedupe(items: readonly string[]): { kept: string[]; repeats: string[] } {
  const seen = new Set<string>();
  const kept: string[] = [];
  const repeats: string[] = [];
  for (const item of items) {
    const key = item.trim().toLowerCase();
    if (!key) continue;
    if (seen.has(key)) repeats.push(item.trim());
    else {
      seen.add(key);
      kept.push(item.trim());
    }
  }
  return { kept, repeats };
}

export function hasBlockingIssues(issues: readonly PlanIssue[]): boolean {
  return issues.some((i) => i.severity === "error");
}

/** Turns approved profile text into the ordered steps the side panel shows. */
export function buildPlan(input: FillInput, now: Date = new Date()): { plan: FillPlan; issues: PlanIssue[] } {
  const issues: PlanIssue[] = [];
  const steps: FillStep[] = [];
  const ids = new Set<string>();
  const base = profileBase(input.profileUrl);
  const root = base ?? "https://www.linkedin.com/in/";

  const problem = (step: string, where: string, severity: PlanIssue["severity"], message: string) =>
    issues.push({ step, where, severity, message });

  const uid = (prefix: string, label: string) => {
    const stem = label ? `${prefix}-${slugOf(label)}` : prefix;
    let id = stem;
    for (let n = 2; ids.has(id); n += 1) id = `${stem}-${n}`;
    ids.add(id);
    return id;
  };

  // House style checks are advice, except a leftover [placeholder], which must never reach LinkedIn.
  const checkText = (step: string, where: string, value: string, max: number) => {
    if (value.length > max) {
      problem(step, where, "error", `It is ${value.length} characters and LinkedIn allows ${max}. Cut ${value.length - max}.`);
    }
    const byRule = new Map<string, { message: string; excerpt: string; count: number; error: boolean }>();
    for (const i of lintText(value)) {
      const seen = byRule.get(i.rule);
      if (seen) seen.count += 1;
      else byRule.set(i.rule, { message: i.message, excerpt: i.excerpt, count: 1, error: i.rule === "placeholder" });
    }
    for (const r of byRule.values()) {
      const times = r.count > 1 ? ` Found ${r.count} times, first near "${r.excerpt}".` : ` Near "${r.excerpt}".`;
      problem(step, where, r.error ? "error" : "warning", r.message + times);
    }
  };

  if (!base) problem("plan", "Profile address", "error", "Use the address of your own profile, such as linkedin.com/in/your-name.");

  if (input.headline) {
    steps.push({
      id: uid("headline", ""),
      group: "Top of profile",
      title: "Headline",
      open: `${root}edit/intro/`,
      hint: "Your intro form opens. Press Fill, check the headline, then press Save. If the form does not open, click the pencil on your intro card first.",
      fields: [{ labels: ["Headline"], text: input.headline }],
    });
    checkText("headline", "Headline", input.headline, LIMITS.headline);
    if (/\n/.test(input.headline)) problem("headline", "Headline", "warning", "LinkedIn keeps the headline on one line, so the line break will be dropped.");
  }

  const top = dedupe(input.topSkills ?? []);
  if (input.about || top.kept.length) {
    const step: FillStep = {
      id: uid("about", ""),
      group: "Top of profile",
      title: "About",
      open: `${root}edit/about/`,
      hint:
        "Your About form opens. Press Fill, check it, then press Save. If the form does not open, click the pencil on About first." +
        (top.kept.length ? " Add the top skills in the same form, one at a time." : ""),
    };
    if (input.about) {
      step.fields = [{ labels: ["About", "Summary", "Description"], text: input.about, fallbackFirstTextarea: true }];
      checkText(step.id, "About", input.about, LIMITS.about);
    }
    if (top.kept.length) {
      step.copy = [{ label: "Top skills", text: top.kept.join("\n") }];
      if (top.kept.length > LIMITS.topSkills) {
        problem(step.id, "Top skills", "error", `LinkedIn shows ${LIMITS.topSkills} top skills and there are ${top.kept.length}. Keep the ${LIMITS.topSkills} that match the roles you want.`);
      }
    }
    steps.push(step);
  }

  const positions = input.positions ?? [];
  const titleCount = new Map<string, number>();
  for (const p of positions) titleCount.set(p.title.toLowerCase(), (titleCount.get(p.title.toLowerCase()) ?? 0) + 1);
  for (const p of positions) {
    const where = `${p.company}, ${p.title}`;
    if (!p.description) {
      problem("plan", where, "warning", "Skipped because it has no description.");
      continue;
    }
    const id = uid("exp", where);
    const guard: FillGuard[] = [{ labels: ["Title"], equals: p.title }];
    // Two roles with the same title in this plan also check the company, so text cannot land on the twin.
    if ((titleCount.get(p.title.toLowerCase()) ?? 0) > 1) guard.push({ labels: COMPANY, contains: p.company });
    steps.push({
      id,
      group: "Experience",
      title: where,
      open: `${root}details/experience/`,
      hint:
        `Click the pencil next to ${p.title}${p.dates ? ` (${p.dates})` : ""} at ${p.company}. When the form is open, press Fill. ` +
        (p.append ? "It adds this text under what is already there. " : "Only the description changes. ") +
        "Check it, then press Save on LinkedIn.",
      guard,
      fields: [{ labels: ["Description"], text: p.description, ...(p.append ? { append: true } : {}) }],
    });
    checkText(id, where, p.description, LIMITS.position);
  }

  for (const p of input.projects ?? []) {
    const checks: FillCheck[] = [];
    const selects: FillSelect[] = [];
    const fields: FillField[] = p.description ? [{ labels: ["Description"], text: p.description, ...(p.append ? { append: true } : {}) }] : [];
    if (p.current && p.end) {
      problem("plan", p.name, "error", "Choose still working on it or an end date, not both.");
      continue;
    }
    if (p.current) checks.push({ labels: CURRENT_PROJECT, checked: true });
    if (p.end) {
      checks.push({ labels: CURRENT_PROJECT, checked: false });
      selects.push({ scope: "End date", option: p.end.month }, { scope: "End date", option: String(p.end.year) });
    }
    if (!fields.length && !checks.length) {
      problem("plan", p.name, "warning", "Skipped because it has no description and no date change.");
      continue;
    }
    const id = uid("proj", p.name);
    const dates = p.current ? " It also ticks still working on it." : p.end ? ` It also sets the end date to ${p.end.month} ${p.end.year}.` : "";
    steps.push({
      id,
      group: "Projects",
      title: p.name,
      open: `${root}details/projects/`,
      hint: `Click the pencil next to ${p.name}. Press Fill.${fields.length ? (p.append ? " It adds the text under the description." : " It replaces the description.") : ""}${dates} Check it, then press Save.`,
      guard: [{ labels: ["Project name", "Name"], equals: p.name }],
      ...(fields.length ? { fields } : {}),
      ...(checks.length ? { checks } : {}),
      ...(selects.length ? { selects } : {}),
    });
    if (p.description) checkText(id, p.name, p.description, LIMITS.project);
  }

  for (const e of input.education ?? []) {
    if (!e.description) {
      problem("plan", e.school, "warning", "Skipped because it has no description.");
      continue;
    }
    const id = uid("edu", e.school);
    steps.push({
      id,
      group: "Education",
      title: e.school,
      open: `${root}details/education/`,
      hint: `Click the pencil next to ${e.school}. Press Fill. ${e.append ? "It adds the text under the description and keeps the rest." : "It replaces the description."} Check it, then press Save.`,
      guard: [{ labels: ["School"], contains: e.school }],
      fields: [{ labels: ["Description"], text: e.description, ...(e.append ? { append: true } : {}) }],
    });
    checkText(id, e.school, e.description, LIMITS.education);
  }

  for (const c of input.certifications ?? []) {
    const id = uid("cert", c.name);
    const selects: FillSelect[] = [];
    if (c.month) selects.push({ scope: "Issue date", option: c.month });
    if (c.year) selects.push({ scope: "Issue date", option: String(c.year) });
    if (c.month && !c.year) problem(id, c.name, "warning", "Add the year too. LinkedIn ignores a month on its own.");
    steps.push({
      id,
      group: "Certifications",
      title: c.name,
      open: `${root}details/certifications/`,
      hint: `Click + to add a certification. Press Fill. Then pick ${c.issuer} from the suggestions under Issuing organization${selects.length ? ", check the date" : ""}, and press Save. Turn off sharing with your network first if you do not want a post about it.`,
      guard: [{ labels: ["Name"], emptyOr: c.name }],
      fields: [
        { labels: ["Name"], text: c.name },
        { labels: ["Issuing organization", "Issuing organisation"], text: c.issuer },
      ],
      ...(selects.length ? { selects } : {}),
    });
  }

  const skills = dedupe(input.skills ?? []);
  if (skills.kept.length) {
    steps.push({
      id: uid("skills", ""),
      group: "Skills",
      title: "Skills",
      open: `${root}details/skills/`,
      hint: "Click + to add a skill. Press Fill next skill, pick the matching suggestion, press Save, and repeat. Press Skip for any you already have.",
      skillList: skills.kept,
    });
    if (skills.kept.length > LIMITS.skills) {
      problem("skills", "Skills", "error", `LinkedIn holds ${LIMITS.skills} skills and there are ${skills.kept.length}. Drop the ones furthest from the roles you want.`);
    }
    if (skills.repeats.length) problem("skills", "Skills", "warning", `Listed twice, kept once. ${skills.repeats.join(", ")}.`);
  }

  if (input.openToWork) {
    const o = input.openToWork;
    const who = o.visibility === "everyone" ? "All LinkedIn members" : "Recruiters only";
    const copy: FillCopy[] = [];
    if (o.titles.length) copy.push({ label: "Job titles", text: o.titles.join("\n") });
    if (o.locations.length) copy.push({ label: "Locations", text: o.locations.join("\n") });
    if (o.workplace?.length) copy.push({ label: "Workplace", text: o.workplace.join(", ") });
    if (o.types?.length) copy.push({ label: "Job types", text: o.types.join(", ") });
    const id = uid("open-to-work", "");
    steps.push({
      id,
      group: "Open to Work",
      title: `Open to Work, ${who.toLowerCase()}`,
      open: root,
      hint: `Click Open to, then Finding a new job. Copy in the values below, set who can see it to ${who}, and save.`,
      copy,
    });
    if (!o.titles.length) problem(id, "Open to Work", "error", "Add at least one job title.");
    if (o.titles.length > LIMITS.openToWorkTitles) {
      problem(id, "Open to Work", "error", `LinkedIn takes ${LIMITS.openToWorkTitles} job titles and there are ${o.titles.length}.`);
    }
    if (!o.locations.length) problem(id, "Open to Work", "warning", "Add a location so recruiters near you find you.");
  }

  if (!steps.length) problem("plan", "Plan", "error", "Add at least one thing to fill in.");

  return {
    plan: { version: 2, owner: input.owner, profileUrl: root, createdAt: now.toISOString(), steps },
    issues,
  };
}
