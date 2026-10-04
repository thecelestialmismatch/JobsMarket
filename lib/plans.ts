import type { PlanId, UsageKind } from "@/lib/types";

export interface Plan {
  id: PlanId;
  label: string;
  price: string; // display only, Stripe holds the real price
  limits: Record<UsageKind, number>; // per calendar month (UTC)
  features: string[];
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    label: "Free",
    price: "$0",
    limits: { kit: 3, scan: 5 },
    features: [
      "CV scan against the live job board",
      "Full match list with fit scores and skill gaps",
      "Resume audit and recruiter analysis",
      "3 application kits a month",
      "Application tracker",
    ],
  },
  pro: {
    id: "pro",
    label: "Pro",
    price: process.env.NEXT_PUBLIC_PRO_PRICE_LABEL ?? "$19 a month",
    limits: { kit: 100, scan: 100 },
    features: [
      "Everything in Free",
      "100 application kits a month",
      "Claude written drafts with fact check",
      "Interview prep and LinkedIn drafts for every kit",
      "Priority on new match alerts",
    ],
  },
};

export function monthStart(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export function remaining(plan: PlanId, kind: UsageKind, used: number): number {
  return Math.max(0, PLANS[plan].limits[kind] - used);
}
