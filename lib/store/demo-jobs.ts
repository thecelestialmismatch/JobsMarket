import type { JobPosting } from "@/lib/types";
import { extractSkills } from "@/lib/skills";
import { analyzeJob } from "@/lib/match/requirements";

// Fictional employers for memory mode demos and tests. The UI labels this data as demo data.
// "Quillfeather Analytics" doubles as the canary the anonymous leak test searches for.

interface Seed {
  key: string;
  company: string;
  title: string;
  location: string;
  country: string;
  remote: JobPosting["remote"];
  daysAgo: number;
  salary?: [number, number];
  description: string;
}

const SEEDS: Seed[] = [
  {
    key: "quillfeather-reporting",
    company: "Quillfeather Analytics",
    title: "Reporting Analyst",
    location: "Melbourne VIC",
    country: "AU",
    remote: "hybrid",
    daysAgo: 2,
    salary: [95000, 110000],
    description:
      "Quillfeather Analytics is hiring a Reporting Analyst to own weekly operational reporting.\nRequirements\n• 3+ years in a reporting or analytics role\n• Strong SQL and Power BI\n• Advanced Excel and data validation\n• Stakeholder reporting to senior leaders\nNice to have\n• Python for automation\n• Experience with Jira",
  },
  {
    key: "northwind-connect",
    company: "Northwind Telecom",
    title: "Amazon Connect Engineer",
    location: "Sydney NSW",
    country: "AU",
    remote: "hybrid",
    daysAgo: 5,
    salary: [120000, 140000],
    description:
      "Build and run our Amazon Connect contact centre.\nWhat you will bring\n• Amazon Connect contact flows and routing profiles\n• AWS Lambda and DynamoDB\n• Terraform for infrastructure as code\n• At least 2 years of AWS experience\nDesirable\n• Salesforce integration\n• Full working rights in Australia are required",
  },
  {
    key: "harbourline-data",
    company: "Harbourline Logistics",
    title: "Data Analyst",
    location: "Brisbane QLD",
    country: "AU",
    remote: "onsite",
    daysAgo: 9,
    description:
      "Join the analytics team at Harbourline Logistics.\nYou will need\n• SQL and Tableau\n• Python and statistics\n• A bachelor degree in a quantitative field\n• Minimum of 2 years experience in data analysis",
  },
  {
    key: "kestrel-cloud",
    company: "Kestrel Software",
    title: "Cloud Engineer",
    location: "Remote, Australia",
    country: "AU",
    remote: "remote",
    daysAgo: 1,
    salary: [130000, 155000],
    description:
      "Kestrel Software needs a Cloud Engineer for our AWS platform.\nRequirements\n• AWS including IAM, CloudWatch and CloudFormation\n• Terraform and GitHub Actions\n• Docker and Linux\n• 4+ years in cloud or DevOps roles\nBonus\n• Kubernetes",
  },
  {
    key: "tallowood-servicedesk",
    company: "Tallowood Health",
    title: "Service Desk Analyst",
    location: "Melbourne VIC",
    country: "AU",
    remote: "onsite",
    daysAgo: 14,
    salary: [70000, 80000],
    description:
      "Support clinicians and staff across our hospitals.\nEssential\n• Level 1 and Level 2 technical support\n• ServiceNow or a similar ITSM tool\n• ITIL practices and SLA reporting\n• A current police check and working with children check",
  },
  {
    key: "ironbark-bi",
    company: "Ironbark Finance",
    title: "BI Developer",
    location: "Melbourne VIC",
    country: "AU",
    remote: "hybrid",
    daysAgo: 20,
    description:
      "Ironbark Finance is building a modern data stack.\nRequirements\n• Power BI and DAX\n• SQL Server and dbt\n• 5+ years building dashboards\n• Australian citizenship is required for this role",
  },
  {
    key: "saltbush-cx",
    company: "Saltbush Retail",
    title: "Customer Experience Team Leader",
    location: "Adelaide SA",
    country: "AU",
    remote: "onsite",
    daysAgo: 6,
    description:
      "Lead a team of 12 customer service agents.\nWhat we need\n• Team leadership in a contact centre\n• CSAT and AHT reporting\n• Salesforce or Zendesk\n• 3 years of people leadership",
  },
  {
    key: "coralbay-ba",
    company: "Coralbay Insurance",
    title: "Business Analyst",
    location: "Sydney NSW",
    country: "AU",
    remote: "hybrid",
    daysAgo: 3,
    salary: [110000, 125000],
    description:
      "Coralbay Insurance is looking for a Business Analyst.\nRequirements\n• Requirements gathering and user stories\n• Process improvement\n• Jira and Confluence\n• Agile delivery\nNice to have\n• SQL for data analysis",
  },
];

export function demoJobs(now: Date = new Date()): JobPosting[] {
  return SEEDS.map((s) => {
    const posted = new Date(now.getTime() - s.daysAgo * 86_400_000).toISOString();
    return {
      id: `manual-demo-${s.key}`,
      source: "manual",
      sourceId: s.key,
      board: "demo",
      company: s.company,
      title: s.title,
      location: s.location,
      country: s.country,
      remote: s.remote,
      description: s.description,
      url: `https://jobs.example.test/${s.key}`,
      applyUrl: `https://jobs.example.test/${s.key}/apply`,
      salaryMin: s.salary?.[0],
      salaryMax: s.salary?.[1],
      salaryCurrency: s.salary ? "AUD" : undefined,
      salaryPeriod: s.salary ? "year" : undefined,
      postedAt: posted,
      retrievedAt: posted,
      lastCheckedAt: now.toISOString(),
      status: "open",
      skills: extractSkills(`${s.title}\n${s.description}`),
      requirements: analyzeJob({ title: s.title, description: s.description }),
    };
  });
}
