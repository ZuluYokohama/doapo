/**
 * Operator / DUC prioritization from live search wells.
 * Power of 10: flat, bounded loops, no recursion, ≤60 lines/fn, ≥2 asserts/fn.
 * Measured fields only (status, days-since-spud, operator, county).
 * Fail-closed caps. No invented volumes. No export/import strip.
 */
import {
  outcomeOf,
  type OutcomeId,
  type WellRow,
} from "../outcomes.ts";
import {
  DUC_AGE_DAYS_THRESHOLD,
  daysSinceSpud,
} from "./derive-from-well.ts";
import { wellSubjectId } from "./from-well.ts";
import { MAX_ID_LEN, MAX_TEXT_LEN } from "./types.ts";

/** Hard cap on wells ranked in one analysis (aligned with cohort / kill scan). */
export const MAX_PRIORITIZE_WELLS = 64;

/** Hard cap on operator rollup rows returned. */
export const MAX_PRIORITIZE_OPERATORS = 64;

/** Cap on days contributed into the priority integer (prevents overflow). */
export const MAX_DAYS_IN_PRIORITY = 5000;

/** Base priority by outcome class (higher = more attention). Measured status only. */
const BASE_BY_OUTCOME: Record<OutcomeId, number> = {
  duc: 1000,
  sealed: 800,
  drilling: 600,
  shut: 400,
  prespud: 200,
  producing: 100,
  dry: 50,
  plugged: 40,
  cancelled: 30,
};

const STALE_DUC_BOOST = 10000;
const UNKNOWN_BASE = 10;

export type PrioritizeWellRow = {
  subjectId: string;
  wellLabel: string;
  operator: string;
  county: string;
  status: string;
  daysSinceSpud: number | null;
  outcomeId: string | null;
  staleDuc: boolean;
  priority: number;
};

export type PrioritizeOperatorRow = {
  operator: string;
  wellCount: number;
  ducCount: number;
  staleDucCount: number;
  sealedCount: number;
  maxDaysSinceSpud: number | null;
  countySample: string;
  priority: number;
};

export type PrioritizeMode = "wells" | "operators";

export type PrioritizeWellsInput = {
  wells: WellRow[];
  maxWells?: number;
  /** Injectable clock for tests; defaults to Date.now(). */
  nowMs?: number;
};

export type PrioritizeWellsResult =
  | {
      ok: true;
      mode: "wells";
      total: number;
      rows: PrioritizeWellRow[];
      skipped: number;
    }
  | { ok: false; reason: string };

export type PrioritizeOperatorsResult =
  | {
      ok: true;
      mode: "operators";
      total: number;
      rows: PrioritizeOperatorRow[];
      skipped: number;
    }
  | { ok: false; reason: string };

function failPrioritize(reason: string): { ok: false; reason: string } {
  console.assert(typeof reason === "string", "fail reason string");
  console.assert(reason.length > 0, "fail reason present");
  return { ok: false, reason };
}

function resolveCap(maxWells: number | undefined): number {
  console.assert(MAX_PRIORITIZE_WELLS >= 1, "default prioritize cap positive");
  console.assert(true, "resolveCap entry");
  if (maxWells === undefined || maxWells === null) {
    return MAX_PRIORITIZE_WELLS;
  }
  if (typeof maxWells !== "number" || maxWells < 1) {
    return 0;
  }
  if (maxWells > MAX_PRIORITIZE_WELLS) return MAX_PRIORITIZE_WELLS;
  return maxWells;
}

function clipText(raw: string, fallback: string): string {
  console.assert(typeof raw === "string", "clip text string");
  console.assert(fallback.length > 0, "fallback present");
  if (raw.length === 0) return fallback;
  if (raw.length <= MAX_TEXT_LEN) return raw;
  return raw.slice(0, MAX_TEXT_LEN);
}

function clipId(raw: string): string {
  console.assert(typeof raw === "string", "clip id string");
  console.assert(raw.length >= 0, "clip id length");
  if (raw.length === 0) return "unknown";
  if (raw.length <= MAX_ID_LEN) return raw;
  return raw.slice(0, MAX_ID_LEN);
}

function unknownSubjectId(well: WellRow, index: number): string {
  console.assert(index >= 0, "index non-negative");
  console.assert(well !== null && well !== undefined, "well present");
  const raw =
    well.fileNo != null
      ? "file-" + String(well.fileNo)
      : "row-" + String(index);
  return clipId(raw);
}

function wellLabelOf(well: WellRow, subjectId: string): string {
  console.assert(well !== null && well !== undefined, "well present");
  console.assert(subjectId.length > 0, "subjectId present");
  if (well.wellName != null && well.wellName.length > 0) {
    return clipText(well.wellName, subjectId);
  }
  return clipText(subjectId, "unnamed");
}

function fieldOrDash(raw: string | null | undefined): string {
  console.assert(true, "fieldOrDash entry");
  console.assert(MAX_TEXT_LEN >= 1, "text bound positive");
  if (raw == null || raw.length === 0) return "—";
  return clipText(raw, "—");
}

/**
 * Integer priority from measured status + days-since-spud. Higher = more attention.
 * No invented volumes.
 */
export function priorityScore(
  status: string | null | undefined,
  days: number | null,
): number {
  console.assert(DUC_AGE_DAYS_THRESHOLD >= 1, "threshold positive");
  console.assert(MAX_DAYS_IN_PRIORITY >= 1, "days cap positive");
  const oid = outcomeOf(status);
  let base = UNKNOWN_BASE;
  if (oid !== null) {
    base = BASE_BY_OUTCOME[oid];
  }
  if (oid === "duc" && days !== null && days >= 0) {
    const age =
      days < MAX_DAYS_IN_PRIORITY ? days : MAX_DAYS_IN_PRIORITY;
    base += age;
    if (days >= DUC_AGE_DAYS_THRESHOLD) {
      base += STALE_DUC_BOOST;
    }
  }
  console.assert(base >= 0, "priority non-negative");
  return base;
}

function isStaleDuc(outcomeId: OutcomeId | null, days: number | null): boolean {
  console.assert(true, "isStaleDuc entry");
  console.assert(DUC_AGE_DAYS_THRESHOLD >= 1, "threshold positive");
  if (outcomeId !== "duc") return false;
  if (days === null) return false;
  return days >= DUC_AGE_DAYS_THRESHOLD;
}

function rankOneWell(
  well: WellRow,
  index: number,
  nowMs: number,
): PrioritizeWellRow {
  console.assert(well !== null && well !== undefined, "well present");
  console.assert(Number.isFinite(nowMs), "nowMs finite");
  const sid = wellSubjectId(well);
  const subjectId = sid !== null ? sid : unknownSubjectId(well, index);
  const outcomeId = outcomeOf(well.status);
  const days = daysSinceSpud(well.spud, nowMs);
  const staleDuc = isStaleDuc(outcomeId, days);
  return {
    subjectId,
    wellLabel: wellLabelOf(well, subjectId),
    operator: fieldOrDash(well.operator),
    county: fieldOrDash(well.county),
    status: fieldOrDash(well.status),
    daysSinceSpud: days,
    outcomeId: outcomeId,
    staleDuc,
    priority: priorityScore(well.status, days),
  };
}

function compareWellRows(a: PrioritizeWellRow, b: PrioritizeWellRow): number {
  console.assert(a !== null && a !== undefined, "row a");
  console.assert(b !== null && b !== undefined, "row b");
  if (a.priority !== b.priority) return b.priority - a.priority;
  const da = a.daysSinceSpud === null ? -1 : a.daysSinceSpud;
  const db = b.daysSinceSpud === null ? -1 : b.daysSinceSpud;
  if (da !== db) return db - da;
  if (a.subjectId < b.subjectId) return -1;
  if (a.subjectId > b.subjectId) return 1;
  return 0;
}

function sortWellRows(rows: PrioritizeWellRow[]): void {
  console.assert(Array.isArray(rows), "rows array");
  console.assert(rows.length <= MAX_PRIORITIZE_WELLS, "rows within cap");
  let i = 1;
  while (i < rows.length) {
    const cur = rows[i];
    let j = i;
    while (j > 0 && compareWellRows(rows[j - 1], cur) > 0) {
      rows[j] = rows[j - 1];
      j -= 1;
    }
    rows[j] = cur;
    i += 1;
  }
}

/**
 * Rank up to maxWells by measured status / DUC age. Fail-closed. No volumes.
 */
export function prioritizeWells(
  input: PrioritizeWellsInput,
): PrioritizeWellsResult {
  console.assert(input !== null && input !== undefined, "input present");
  console.assert(true, "prioritizeWells entry");
  if (input === null || input === undefined) {
    return failPrioritize("input required");
  }
  if (!Array.isArray(input.wells)) {
    return failPrioritize("wells required");
  }
  const cap = resolveCap(input.maxWells);
  if (cap < 1) {
    return failPrioritize("maxWells invalid");
  }
  const nowMs =
    typeof input.nowMs === "number" && Number.isFinite(input.nowMs)
      ? input.nowMs
      : Date.now();
  const bound = input.wells.length < cap ? input.wells.length : cap;
  const rows: PrioritizeWellRow[] = [];
  let skipped = 0;
  let i = 0;
  while (i < bound) {
    const well = input.wells[i];
    if (well === null || well === undefined) {
      skipped += 1;
      i += 1;
      continue;
    }
    rows.push(rankOneWell(well, i, nowMs));
    i += 1;
  }
  sortWellRows(rows);
  console.assert(rows.length <= MAX_PRIORITIZE_WELLS, "rows within cap");
  console.assert(rows.length + skipped === bound, "accounted bound");
  return { ok: true, mode: "wells", total: bound, rows, skipped };
}

type OperatorAcc = {
  operator: string;
  wellCount: number;
  ducCount: number;
  staleDucCount: number;
  sealedCount: number;
  maxDaysSinceSpud: number | null;
  countySample: string;
  priority: number;
};

function bumpOperator(acc: OperatorAcc, row: PrioritizeWellRow): void {
  console.assert(acc !== null && acc !== undefined, "acc present");
  console.assert(row !== null && row !== undefined, "row present");
  acc.wellCount += 1;
  if (row.outcomeId === "duc") acc.ducCount += 1;
  if (row.staleDuc) acc.staleDucCount += 1;
  if (row.outcomeId === "sealed") acc.sealedCount += 1;
  if (row.daysSinceSpud !== null) {
    if (
      acc.maxDaysSinceSpud === null ||
      row.daysSinceSpud > acc.maxDaysSinceSpud
    ) {
      acc.maxDaysSinceSpud = row.daysSinceSpud;
    }
  }
  if (row.priority > acc.priority) acc.priority = row.priority;
  if (acc.countySample === "—" && row.county !== "—") {
    acc.countySample = row.county;
  }
}

function findOperator(
  list: OperatorAcc[],
  operator: string,
): OperatorAcc | null {
  console.assert(Array.isArray(list), "list array");
  console.assert(operator.length > 0, "operator present");
  let i = 0;
  while (i < list.length) {
    if (list[i].operator === operator) return list[i];
    i += 1;
  }
  return null;
}

function compareOperatorRows(
  a: PrioritizeOperatorRow,
  b: PrioritizeOperatorRow,
): number {
  console.assert(a !== null && a !== undefined, "op a");
  console.assert(b !== null && b !== undefined, "op b");
  if (a.priority !== b.priority) return b.priority - a.priority;
  if (a.staleDucCount !== b.staleDucCount) {
    return b.staleDucCount - a.staleDucCount;
  }
  if (a.ducCount !== b.ducCount) return b.ducCount - a.ducCount;
  if (a.operator < b.operator) return -1;
  if (a.operator > b.operator) return 1;
  return 0;
}

function sortOperatorRows(rows: PrioritizeOperatorRow[]): void {
  console.assert(Array.isArray(rows), "op rows array");
  console.assert(rows.length <= MAX_PRIORITIZE_OPERATORS, "ops within cap");
  let i = 1;
  while (i < rows.length) {
    const cur = rows[i];
    let j = i;
    while (j > 0 && compareOperatorRows(rows[j - 1], cur) > 0) {
      rows[j] = rows[j - 1];
      j -= 1;
    }
    rows[j] = cur;
    i += 1;
  }
}

function toOperatorRow(acc: OperatorAcc): PrioritizeOperatorRow {
  console.assert(acc.wellCount >= 1, "acc has wells");
  console.assert(acc.operator.length > 0, "acc operator");
  return {
    operator: acc.operator,
    wellCount: acc.wellCount,
    ducCount: acc.ducCount,
    staleDucCount: acc.staleDucCount,
    sealedCount: acc.sealedCount,
    maxDaysSinceSpud: acc.maxDaysSinceSpud,
    countySample: acc.countySample,
    priority: acc.priority,
  };
}

/**
 * Aggregate ranked wells by operator. Fail-closed. No invented volumes.
 */
export function prioritizeOperators(
  input: PrioritizeWellsInput,
): PrioritizeOperatorsResult {
  console.assert(input !== null && input !== undefined, "input present");
  console.assert(true, "prioritizeOperators entry");
  const ranked = prioritizeWells(input);
  if (!ranked.ok) {
    return failPrioritize(ranked.reason);
  }
  const accs: OperatorAcc[] = [];
  let i = 0;
  while (i < ranked.rows.length) {
    const row = ranked.rows[i];
    let acc = findOperator(accs, row.operator);
    if (acc === null) {
      if (accs.length >= MAX_PRIORITIZE_OPERATORS) {
        i += 1;
        continue;
      }
      acc = {
        operator: row.operator,
        wellCount: 0,
        ducCount: 0,
        staleDucCount: 0,
        sealedCount: 0,
        maxDaysSinceSpud: null,
        countySample: "—",
        priority: 0,
      };
      accs.push(acc);
    }
    bumpOperator(acc, row);
    i += 1;
  }
  const rows: PrioritizeOperatorRow[] = [];
  let j = 0;
  while (j < accs.length && rows.length < MAX_PRIORITIZE_OPERATORS) {
    rows.push(toOperatorRow(accs[j]));
    j += 1;
  }
  sortOperatorRows(rows);
  console.assert(rows.length <= MAX_PRIORITIZE_OPERATORS, "ops bounded");
  console.assert(ranked.total <= MAX_PRIORITIZE_WELLS, "total within cap");
  return {
    ok: true,
    mode: "operators",
    total: ranked.total,
    rows,
    skipped: ranked.skipped,
  };
}
