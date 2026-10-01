import { z } from "zod";
import { htmlToText } from "../html";
import {
  type FetchDeps,
  type RawJob,
  type RawSalary,
  employmentLabel,
  fetchJson,
  httpUrl,
  parseEnvelope,
  parseItems,
  toIso,
} from "./common";

const API = "https://api.lever.co/v0/postings";

const PostingSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  hostedUrl: httpUrl,
  applyUrl: httpUrl.nullish(),
  categories: z
    .object({ location: z.string().nullish(), commitment: z.string().nullish() })
    .nullish(),
  workplaceType: z.string().nullish(),
  country: z.string().nullish(),
  descriptionPlain: z.string().nullish(),
  lists: z.array(z.object({ text: z.string().nullish(), content: z.string().nullish() })).nullish(),
  additionalPlain: z.string().nullish(),
  salaryDescriptionPlain: z.string().nullish(),
  createdAt: z.number().nullish(),
  salaryRange: z
    .object({
      min: z.number().nullish(),
      max: z.number().nullish(),
      currency: z.string().nullish(),
      interval: z.string().nullish(),
    })
    .nullish(),
});

type Posting = z.infer<typeof PostingSchema>;

const INTERVALS: Record<string, RawSalary["period"]> = {
  "per-year-salary": "year",
  "per-month-salary": "month",
  "per-day-wage": "day",
  "per-hour-wage": "hour",
};

function salary(p: Posting): RawSalary | undefined {
  const r = p.salaryRange;
  if (!r || !(r.min || r.max)) return undefined; // Lever reports 0 to 0 when the range is hidden
  return {
    min: r.min || undefined,
    max: r.max || undefined,
    currency: r.currency ?? undefined,
    period: r.interval ? INTERVALS[r.interval] : undefined,
  };
}

function description(p: Posting): string {
  const lists = (p.lists ?? []).map((l) => [l.text?.trim(), htmlToText(l.content ?? "")].filter(Boolean).join("\n"));
  return [p.descriptionPlain?.trim(), ...lists, p.additionalPlain?.trim()].filter(Boolean).join("\n\n");
}

function toRaw(board: string, p: Posting): RawJob {
  return {
    source: "lever",
    board,
    sourceId: p.id,
    company: null,
    title: p.text,
    location: p.categories?.location?.trim() ?? "",
    description: description(p),
    url: p.hostedUrl,
    applyUrl: p.applyUrl ?? p.hostedUrl,
    postedAt: toIso(p.createdAt),
    employmentType: employmentLabel(p.categories?.commitment),
    workplace: p.workplaceType ?? undefined,
    countryHint: p.country ?? undefined,
    salary: salary(p),
    salaryText: p.salaryDescriptionPlain?.trim() || undefined,
  };
}

export async function fetchLever(board: string, deps: FetchDeps): Promise<RawJob[]> {
  const body = await fetchJson(`${API}/${encodeURIComponent(board)}?mode=json`, "lever", board, deps);
  const items = parseEnvelope(body, z.array(z.unknown()), "lever", board);
  return parseItems(items, PostingSchema, "lever", board).map((p) => toRaw(board, p));
}
