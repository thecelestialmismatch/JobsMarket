import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { parseCv } from "@/lib/cv/parse";
import { scoreMatch } from "@/lib/match";
import { demoJobs } from "@/lib/store/demo-jobs";
import { generateKitDeterministic } from "./deterministic";
import { ClaudeDraftError, generateKitWithClaude, type AnthropicLike } from "./claude";
import { generateKit } from "./index";

const NOW = new Date("2026-10-01T00:00:00Z");
const cv = parseCv(readFileSync(path.join(__dirname, "../cv/__fixtures__/jordan-avery.txt"), "utf8"), { now: NOW });
const job = demoJobs(NOW).find((j) => j.id.endsWith("quillfeather-reporting"))!;
const match = scoreMatch(cv, job, {}, NOW);

// A clean kit in Claude's output shape, taken from the template generator so it passes every check.
const good = {
  documents: generateKitDeterministic(cv, job, match, { now: NOW, id: "x" }).documents.map((d) => ({
    kind: d.kind,
    title: d.title,
    sections: d.sections.map((s) => ({ heading: s.heading, meta: s.meta ?? "", style: s.style, sentences: s.items.map((i) => ({ text: i.text, evidence_ids: i.evidenceIds })) })),
  })),
};
const bad = {
  documents: [{ kind: "cv", title: "CV", sections: [{ heading: "Summary", meta: "", style: "paragraph", sentences: [{ text: "Certified AWS architect with 20 years at Globex — truly passionate about synergy!", evidence_ids: ["E1"] }] }] }],
};

function fake(...replies: unknown[]) {
  const parse = vi.fn();
  for (const r of replies) parse.mockResolvedValueOnce(r);
  return { client: { beta: { messages: { parse } } } as unknown as AnthropicLike, parse };
}

describe("generateKitWithClaude", () => {
  it("returns a Claude kit when the draft passes both checks", async () => {
    const { client, parse } = fake({ stop_reason: "end_turn", parsed_output: good });
    const kit = await generateKitWithClaude(cv, job, match, { now: NOW, id: "k", client });
    expect(kit.generator).toBe("claude");
    expect(kit.facts).toEqual([]);
    const params = parse.mock.calls[0][0];
    expect(params.model).toBe("claude-opus-5");
    expect(params.fallbacks).toBe("default");
    expect(params.betas).toContain("server-side-fallback-2026-07-01");
    expect(params.system).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("throws on refusal before reading content", async () => {
    const { client } = fake({ stop_reason: "refusal", parsed_output: good });
    await expect(generateKitWithClaude(cv, job, match, { now: NOW, id: "k", client })).rejects.toMatchObject({ reason: "refusal" });
  });

  it("repairs once with the issue list, then succeeds", async () => {
    const { client, parse } = fake({ stop_reason: "end_turn", parsed_output: bad }, { stop_reason: "end_turn", parsed_output: good });
    const kit = await generateKitWithClaude(cv, job, match, { now: NOW, id: "k", client });
    expect(kit.generator).toBe("claude");
    expect(parse).toHaveBeenCalledTimes(2);
    expect(parse.mock.calls[1][0].messages[0].content).toContain("failed these checks");
  });

  it("gives up after two failed drafts and the orchestrator falls back to templates", async () => {
    const twice = fake({ stop_reason: "end_turn", parsed_output: bad }, { stop_reason: "end_turn", parsed_output: bad });
    await expect(generateKitWithClaude(cv, job, match, { now: NOW, id: "k", client: twice.client })).rejects.toBeInstanceOf(ClaudeDraftError);
    const again = fake({ stop_reason: "end_turn", parsed_output: bad }, { stop_reason: "end_turn", parsed_output: bad });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const kit = await generateKit(cv, job, match, { now: NOW, id: "k", client: again.client });
    expect(kit.generator).toBe("deterministic");
    expect(kit.facts).toEqual([]);
    warn.mockRestore();
  });
});
