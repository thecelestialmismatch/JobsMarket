// Skills taxonomy and extractor. CONTRACT STUB: exports and signatures are frozen,
// the data tables are expanded by the skills module owner.

export type SkillCategory =
  | "language"
  | "data"
  | "cloud"
  | "devops"
  | "web"
  | "security"
  | "crm"
  | "analytics"
  | "design"
  | "product"
  | "office"
  | "domain"
  | "method";

export interface SkillDef {
  name: string; // canonical display name
  aliases: string[]; // lower case alternates matched on word boundaries
  category: SkillCategory;
}

export interface RoleFamily {
  id: string; // kebab case, e.g. "data-analyst"
  label: string; // "Data Analyst"
  titles: string[]; // common job titles in this family, most common first
  coreSkills: string[]; // canonical skill names an ATS scans for
  keywords: string[]; // non skill ATS phrases, e.g. "stakeholder reporting"
  portfolioBenefit: boolean; // true when a portfolio page helps (software, data, design, marketing)
}

export const SKILLS: SkillDef[] = [
  { name: "SQL", aliases: ["sql", "t-sql", "tsql", "pl/sql"], category: "data" },
  { name: "Python", aliases: ["python"], category: "language" },
  { name: "Power BI", aliases: ["power bi", "powerbi"], category: "analytics" },
  { name: "Excel", aliases: ["excel", "advanced excel"], category: "office" },
  { name: "AWS", aliases: ["aws", "amazon web services"], category: "cloud" },
  { name: "TypeScript", aliases: ["typescript"], category: "language" },
  { name: "React", aliases: ["react", "react.js", "reactjs"], category: "web" },
  { name: "Terraform", aliases: ["terraform"], category: "devops" },
  { name: "Salesforce", aliases: ["salesforce"], category: "crm" },
  { name: "Tableau", aliases: ["tableau"], category: "analytics" },
];

export const ROLE_FAMILIES: RoleFamily[] = [
  {
    id: "data-analyst",
    label: "Data Analyst",
    titles: ["Data Analyst", "Reporting Analyst", "BI Analyst"],
    coreSkills: ["SQL", "Power BI", "Excel", "Python", "Tableau"],
    keywords: ["dashboards", "stakeholder reporting", "data validation"],
    portfolioBenefit: true,
  },
  {
    id: "software-engineer",
    label: "Software Engineer",
    titles: ["Software Engineer", "Full Stack Developer", "Frontend Engineer"],
    coreSkills: ["TypeScript", "React", "Python", "AWS", "SQL"],
    keywords: ["code review", "testing", "CI/CD"],
    portfolioBenefit: true,
  },
];

export const SOFT_SKILLS: string[] = ["team player", "hard working", "communication", "self motivated", "detail oriented"];

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

const MATCHERS: { name: string; re: RegExp }[] = SKILLS.map((s) => ({
  name: s.name,
  re: new RegExp(`(^|[^a-z0-9+#])(${[s.name.toLowerCase(), ...s.aliases].map(escapeRe).join("|")})(?=$|[^a-z0-9+#])`, "i"),
}));

/** Canonical skill names mentioned in the text, in taxonomy order, deduplicated. */
export function extractSkills(text: string): string[] {
  return MATCHERS.filter((m) => m.re.test(text)).map((m) => m.name);
}

/** Best matching role family id for a job or CV title, or null. */
export function classifyTitle(title: string): string | null {
  const t = title.toLowerCase();
  for (const f of ROLE_FAMILIES) {
    if (f.titles.some((x) => t.includes(x.toLowerCase()))) return f.id;
  }
  return null;
}

export function roleFamily(id: string): RoleFamily | undefined {
  return ROLE_FAMILIES.find((f) => f.id === id);
}

/** One honest, specific next step for learning a skill. */
export function learnHint(skill: string): string {
  return `Build one small project that uses ${skill} and add a CV bullet describing what it did.`;
}
