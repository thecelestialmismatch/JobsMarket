// Assigns evidence ids E1, E2, ... in the order lines are recorded. Stages record in document order.
import type { Evidence, EvidenceId, EvidenceSection } from "@/lib/types";

export interface Ledger {
  add(section: EvidenceSection, text: string, meta?: { employer?: string; role?: string }): EvidenceId;
  items(): Evidence[];
}

export function createLedger(): Ledger {
  const entries: Evidence[] = [];
  return {
    add(section, text, meta = {}) {
      const id = `E${entries.length + 1}`;
      entries.push({
        id,
        section,
        text: text.replace(/\s+/g, " ").trim(),
        ...(meta.employer ? { employer: meta.employer } : {}),
        ...(meta.role ? { role: meta.role } : {}),
      });
      return id;
    },
    items: () => [...entries],
  };
}
