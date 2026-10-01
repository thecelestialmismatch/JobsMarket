export type BoardSource = "greenhouse" | "lever" | "ashby" | "remotive";

export interface Board {
  source: BoardSource;
  board: string;
  label: string;
}

/** Identity of one fetched board across sources. The same slug can exist on Lever and Ashby. */
export function boardKey(source: string, board: string): string {
  return `${source}:${board}`;
}

// Verified 2026-10-02 with curl against each public endpoint. Every board returned HTTP 200 with the
// open job count shown (about 2,070 jobs in total). Weighted toward employers hiring in Australia and
// New Zealand, plus remote first companies that hire across APAC. Re-verify before adding a board,
// a slug that moves ATS returns 404 and is reported as a board error, never as closed jobs.
export const BOARDS: Board[] = [
  { source: "greenhouse", board: "cultureamp", label: "Culture Amp" }, // 34
  { source: "greenhouse", board: "buildkite", label: "Buildkite" }, // 11
  { source: "greenhouse", board: "prospa", label: "Prospa" }, // 8
  { source: "greenhouse", board: "octopusdeploy", label: "Octopus Deploy" }, // 4
  { source: "greenhouse", board: "canonical", label: "Canonical" }, // 307
  { source: "greenhouse", board: "datadog", label: "Datadog" }, // 438
  { source: "greenhouse", board: "gitlab", label: "GitLab" }, // 202
  { source: "greenhouse", board: "grafanalabs", label: "Grafana Labs" }, // 120
  { source: "greenhouse", board: "vercel", label: "Vercel" }, // 91
  { source: "lever", board: "megaport", label: "Megaport" }, // 44
  { source: "lever", board: "mable", label: "Mable" }, // 15
  { source: "lever", board: "deputy", label: "Deputy" }, // 9
  { source: "lever", board: "immutable", label: "Immutable" }, // 6
  { source: "lever", board: "blinq", label: "Blinq" }, // 5
  { source: "ashby", board: "xero", label: "Xero" }, // 121
  { source: "ashby", board: "airwallex", label: "Airwallex" }, // 554
  { source: "ashby", board: "dovetail", label: "Dovetail" }, // 9
  { source: "ashby", board: "lorikeet", label: "Lorikeet" }, // 8
  { source: "ashby", board: "harrison.ai", label: "Harrison.ai" }, // 6
  { source: "ashby", board: "supabase", label: "Supabase" }, // 48
  { source: "ashby", board: "zapier", label: "Zapier" }, // 10
  { source: "ashby", board: "posthog", label: "PostHog" }, // 8
  { source: "remotive", board: "remotive", label: "Remotive" }, // 16
];
