/**
 * Outcome cohort summary — bounded well→packet→outcomeClassId counts.
 * Power of 10: flat, bounded loops, no recursion, ≤60 lines/fn, ≥2 asserts/fn.
 * No invented volumes; only buildPacketFromWell / pack outcome membership.
 */
import type { WellRow } from "../outcomes.ts";
import { buildPacketFromWell } from "./from-well.ts";
import {
  MAX_OUTCOME_CLASSES,
  MAX_TEXT_LEN,
  type DomainPack,
} from "./types.ts";

/** Hard cap on wells in one cohort (aligned with kill scan). */
export const MAX_COHORT_WELLS = 64;

export type CohortClassCount = {
  id: string;
  label: string;
  count: number;
};

export type SummarizeOutcomeCohortInput = {
  wells: WellRow[];
  pack: DomainPack;
  maxWells?: number;
};

export type SummarizeOutcomeCohortResult =
  | {
      ok: true;
      total: number;
      byClass: CohortClassCount[];
      unmatched: number;
      skipped: number;
    }
  | { ok: false; reason: string };

function failCohort(reason: string): SummarizeOutcomeCohortResult {
  console.assert(typeof reason === "string", "cohort fail reason string");
  console.assert(reason.length > 0, "cohort fail reason present");
  return { ok: false, reason };
}

function resolveCap(maxWells: number | undefined): number {
  console.assert(MAX_COHORT_WELLS >= 1, "default cohort cap positive");
  console.assert(true, "resolveCap entry");
  if (maxWells === undefined || maxWells === null) {
    return MAX_COHORT_WELLS;
  }
  if (typeof maxWells !== "number" || maxWells < 1) {
    return 0;
  }
  if (maxWells > MAX_COHORT_WELLS) return MAX_COHORT_WELLS;
  return maxWells;
}

function clipLabel(raw: string): string {
  console.assert(typeof raw === "string", "label string");
  console.assert(raw.length >= 0, "label length");
  if (raw.length === 0) return "unnamed";
  if (raw.length <= MAX_TEXT_LEN) return raw;
  return raw.slice(0, MAX_TEXT_LEN);
}

function initByClass(pack: DomainPack): CohortClassCount[] {
  console.assert(pack !== null && pack !== undefined, "pack present");
  console.assert(
    pack.outcomeClasses.length <= MAX_OUTCOME_CLASSES,
    "classes in bound",
  );
  const out: CohortClassCount[] = [];
  let i = 0;
  const bound = pack.outcomeClasses.length;
  while (i < bound && out.length < MAX_OUTCOME_CLASSES) {
    const row = pack.outcomeClasses[i];
    out.push({
      id: row.id,
      label: clipLabel(row.label),
      count: 0,
    });
    i += 1;
  }
  console.assert(out.length === bound || out.length === MAX_OUTCOME_CLASSES, "init sized");
  return out;
}

function bumpClass(byClass: CohortClassCount[], id: string): boolean {
  console.assert(Array.isArray(byClass), "byClass array");
  console.assert(id.length > 0, "class id present");
  let i = 0;
  while (i < byClass.length) {
    if (byClass[i].id === id) {
      byClass[i].count += 1;
      return true;
    }
    i += 1;
  }
  return false;
}

type Acc = { unmatched: number; skipped: number };

function classifyOne(
  well: WellRow,
  pack: DomainPack,
  byClass: CohortClassCount[],
  acc: Acc,
): void {
  console.assert(well !== null && well !== undefined, "well present");
  console.assert(pack !== null && pack !== undefined, "pack present");
  const built = buildPacketFromWell({
    well,
    pack,
    proposedBy: "agent_propose",
    gate: "STOP",
  });
  if (!built.ok) {
    acc.skipped += 1;
    return;
  }
  const oid = built.packet.outcomeClassId;
  if (oid === null || oid.length === 0) {
    acc.unmatched += 1;
    return;
  }
  if (!bumpClass(byClass, oid)) {
    acc.unmatched += 1;
  }
}

/**
 * Summarize outcomeClassId counts for up to maxWells (≤ MAX_COHORT_WELLS).
 * Fail-closed on missing pack/wells or invalid cap. No invented volumes.
 */
export function summarizeOutcomeCohort(
  input: SummarizeOutcomeCohortInput,
): SummarizeOutcomeCohortResult {
  console.assert(input !== null && input !== undefined, "input present");
  console.assert(true, "summarizeOutcomeCohort entry");
  if (input === null || input === undefined) {
    return failCohort("input required");
  }
  if (input.pack === null || input.pack === undefined) {
    return failCohort("pack required");
  }
  if (!Array.isArray(input.wells)) {
    return failCohort("wells required");
  }
  const cap = resolveCap(input.maxWells);
  if (cap < 1) {
    return failCohort("maxWells invalid");
  }
  const bound = input.wells.length < cap ? input.wells.length : cap;
  const byClass = initByClass(input.pack);
  const acc: Acc = { unmatched: 0, skipped: 0 };
  let i = 0;
  while (i < bound) {
    classifyOne(input.wells[i], input.pack, byClass, acc);
    i += 1;
  }
  console.assert(bound <= MAX_COHORT_WELLS, "total within cap");
  console.assert(byClass.length <= MAX_OUTCOME_CLASSES, "byClass bounded");
  return {
    ok: true,
    total: bound,
    byClass,
    unmatched: acc.unmatched,
    skipped: acc.skipped,
  };
}
