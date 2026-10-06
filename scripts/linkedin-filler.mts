// Builds a personal LinkedIn Profile Filler on your own machine. Nothing is sent anywhere.
//
//   node scripts/linkedin-filler.mts profile.json                  writes Your_Name_LinkedIn_Profile_Filler.zip
//   node scripts/linkedin-filler.mts profile.json --out my.zip     chooses where the zip goes
//   node scripts/linkedin-filler.mts profile.json --data-js extension/linkedin-filler/data.js
//                                                                 writes only data.js, for the unpacked folder
//   --date 2026-10-06                                             fixes the plan date for reproducible output
//
// profile.json follows FillInputSchema in lib/linkedin/filler/plan.ts. See docs/linkedin-filler.md.
import { register } from "node:module";

register("../lib/jobs/cli-hooks.mjs", import.meta.url);

const { readFile, writeFile } = await import("node:fs/promises");
const { FillInputSchema, buildPlan, hasBlockingIssues } = await import("../lib/linkedin/filler/plan");
const { EXTENSION_FILES, packExtension, renderDataJs } = await import("../lib/linkedin/filler/pack");

const ROOT = new URL("../", import.meta.url);
const FLAGS = new Set(["--out", "--data-js", "--date"]);

function parseArgs(argv: string[]): { input?: string; flags: Record<string, string> } {
  const flags: Record<string, string> = {};
  let input: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (FLAGS.has(a)) {
      const value = argv[i + 1];
      if (!value) throw new Error(`${a} needs a value.`);
      flags[a] = value;
      i += 1;
    } else if (a.startsWith("--")) throw new Error(`Unknown option ${a}.`);
    else input = a;
  }
  return { input, flags };
}

const fileBase = (name: string) =>
  name.normalize("NFKD").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "Candidate";

async function main(): Promise<number> {
  const { input, flags } = parseArgs(process.argv.slice(2));
  if (!input) {
    console.error("Usage: node scripts/linkedin-filler.mts profile.json [--out file.zip | --data-js path] [--date YYYY-MM-DD]");
    return 2;
  }
  const parsed = FillInputSchema.safeParse(JSON.parse(await readFile(input, "utf8")));
  if (!parsed.success) {
    for (const issue of parsed.error.issues) console.error(`Input problem at ${issue.path.join(".") || "top level"}. ${issue.message}`);
    return 1;
  }
  const now = flags["--date"] ? new Date(`${flags["--date"]}T00:00:00.000Z`) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error("--date must look like 2026-10-06.");
  const { plan, issues } = buildPlan(parsed.data, now);
  for (const i of issues) console.error(`${i.severity === "error" ? "Error" : "Warning"}, ${i.where}. ${i.message}`);
  if (hasBlockingIssues(issues)) return 1;

  if (flags["--data-js"]) {
    await writeFile(flags["--data-js"], renderDataJs(plan));
    console.log(`Wrote ${flags["--data-js"]} with ${plan.steps.length} steps.`);
    return 0;
  }
  const files = new Map<string, Uint8Array>();
  for (const name of EXTENSION_FILES) files.set(name, await readFile(new URL(`extension/linkedin-filler/${name}`, ROOT)));
  const out = flags["--out"] ?? `${fileBase(plan.owner)}_LinkedIn_Profile_Filler.zip`;
  await writeFile(out, await packExtension(files, plan));
  console.log(`Wrote ${out} with ${plan.steps.length} steps. Unzip it, then load the folder in chrome://extensions with Developer mode on.`);
  return 0;
}

process.exitCode = await main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  return 1;
});
