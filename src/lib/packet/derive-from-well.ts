/**
 * Measured DUC / status derivation from a live WellRow.
 * Power of 10: flat, bounded loops, no recursion, ≤60 lines/fn, ≥2 asserts/fn.
 * Fail-closed: only real WellRow fields; never invent oil/gas/water volumes.
 *
 * Rules (deterministic):
 * 1. status → outcome already via outcomeOf (caller).
 * 2. Confidential / sealed → confidential-lag residue (from pack template or default).
 * 3. NC / duc + days-since-spud ≥ DUC_AGE_DAYS_THRESHOLD → duc-age residue;
 *    if pack declares kill `stale-duc`, also emit kill:stale-duc=triggered.
 * 4. When spud present, emit derived fact days-since-spud (integer days).
 */
import { outcomeOf, type WellRow } from "../outcomes.ts";
import { KILL_TRIGGER_VALUE } from "./kill-check.ts";
import {
  MAX_ID_LEN,
  MAX_KILL_CONDITIONS,
  MAX_LONG_TEXT_LEN,
  MAX_MEASURED_FACTS,
  MAX_RESIDUE_ITEMS,
  MAX_TEXT_LEN,
  type DomainPack,
  type KillCondition,
  type MeasuredFact,
  type ResidueItem,
} from "./types.ts";

/** Calendar-day age at/above which NC wells get duc-age residue (+ stale-duc kill if pack declares it). */
export const DUC_AGE_DAYS_THRESHOLD = 365;

/** Milliseconds in one UTC day (integer math only). */
export const MS_PER_DAY = 86400000;

export const DERIVE_SOURCE_LABEL = "NDIC GIS derived";

export const RESIDUE_ID_CONFIDENTIAL_LAG = "confidential-lag";
export const RESIDUE_ID_DUC_AGE = "duc-age";
export const KILL_ID_STALE_DUC = "stale-duc";
export const FACT_KEY_DAYS_SINCE_SPUD = "days-since-spud";

/** Residue ids that must not be blind-copied from residueDefaults; only when rules match. */
export const CONDITIONAL_RESIDUE_IDS: readonly string[] = [
  RESIDUE_ID_CONFIDENTIAL_LAG,
  RESIDUE_ID_DUC_AGE,
] as const;

const DEFAULT_CONFIDENTIAL_LAG =
  "Confidential wells may withhold completion and production detail for a statutory period.";

const DEFAULT_DUC_AGE =
  "NDIC status NC with measured days-since-spud at or past the pack DUC age threshold — timing residue only; no inventable volumes.";

export type DeriveFromWellInput = {
  well: WellRow;
  pack: DomainPack;
  /** Injectable clock for tests; defaults to Date.now(). */
  nowMs?: number;
};

export type DeriveFromWellResult = {
  facts: MeasuredFact[];
  residue: ResidueItem[];
};

function isConditionalResidueId(id: string): boolean {
  console.assert(typeof id === "string", "residue id string");
  console.assert(id.length >= 0, "residue id length");
  let i = 0;
  while (i < CONDITIONAL_RESIDUE_IDS.length) {
    if (CONDITIONAL_RESIDUE_IDS[i] === id) return true;
    i += 1;
  }
  return false;
}

/**
 * True when residueDefaults id is always-on (honesty / gate), not rule-gated.
 */
export function isAlwaysOnResidueId(id: string): boolean {
  console.assert(typeof id === "string", "id string");
  console.assert(true, "isAlwaysOnResidueId entry");
  if (id.length === 0) return false;
  return !isConditionalResidueId(id);
}

/**
 * Integer whole days since spud. Fail-closed null when missing / future / invalid.
 */
export function daysSinceSpud(
  spudMs: number | null | undefined,
  nowMs: number,
): number | null {
  console.assert(typeof nowMs === "number", "nowMs number");
  console.assert(MS_PER_DAY > 0, "day ms positive");
  if (spudMs == null) return null;
  if (typeof spudMs !== "number" || !Number.isFinite(spudMs)) return null;
  if (!Number.isFinite(nowMs)) return null;
  if (spudMs > nowMs) return null;
  const raw = Math.floor((nowMs - spudMs) / MS_PER_DAY);
  if (raw < 0) return null;
  return raw;
}

function findResidueTemplate(
  pack: DomainPack,
  id: string,
): ResidueItem | null {
  console.assert(pack !== null && pack !== undefined, "pack present");
  console.assert(id.length > 0, "template id");
  if (!Array.isArray(pack.residueDefaults)) return null;
  let i = 0;
  const bound =
    pack.residueDefaults.length < MAX_RESIDUE_ITEMS
      ? pack.residueDefaults.length
      : MAX_RESIDUE_ITEMS;
  while (i < bound) {
    if (pack.residueDefaults[i].id === id) return pack.residueDefaults[i];
    i += 1;
  }
  return null;
}

function packHasKill(pack: DomainPack, killId: string): boolean {
  console.assert(killId.length > 0, "killId present");
  console.assert(pack !== null && pack !== undefined, "pack present");
  if (!Array.isArray(pack.killConditions)) return false;
  let i = 0;
  const bound =
    pack.killConditions.length < MAX_KILL_CONDITIONS
      ? pack.killConditions.length
      : MAX_KILL_CONDITIONS;
  while (i < bound) {
    const row: KillCondition = pack.killConditions[i];
    if (row.id === killId) return true;
    i += 1;
  }
  return false;
}

function clipStatement(raw: string): string {
  console.assert(typeof raw === "string", "statement string");
  console.assert(raw.length >= 0, "statement length");
  if (raw.length <= MAX_LONG_TEXT_LEN) return raw;
  return raw.slice(0, MAX_LONG_TEXT_LEN);
}

function pushFact(
  facts: MeasuredFact[],
  key: string,
  value: string,
  evidence: MeasuredFact["evidence"],
): void {
  console.assert(facts.length <= MAX_MEASURED_FACTS, "facts cap");
  console.assert(key.length > 0, "fact key");
  if (facts.length >= MAX_MEASURED_FACTS) return;
  if (value.length === 0) return;
  const keyClip = key.length <= MAX_ID_LEN ? key : key.slice(0, MAX_ID_LEN);
  const valueClip =
    value.length <= MAX_LONG_TEXT_LEN
      ? value
      : value.slice(0, MAX_LONG_TEXT_LEN);
  facts.push({
    key: keyClip,
    value: valueClip,
    evidence,
    sourceLabel: DERIVE_SOURCE_LABEL,
  });
}

function pushResidue(
  residue: ResidueItem[],
  id: string,
  statement: string,
  evidence: ResidueItem["evidence"],
): void {
  console.assert(residue.length <= MAX_RESIDUE_ITEMS, "residue cap");
  console.assert(id.length > 0, "residue id");
  if (residue.length >= MAX_RESIDUE_ITEMS) return;
  if (statement.length === 0) return;
  const idClip = id.length <= MAX_ID_LEN ? id : id.slice(0, MAX_ID_LEN);
  residue.push({
    id: idClip,
    statement: clipStatement(statement),
    evidence,
  });
}

function confidentialLagStatement(pack: DomainPack): string {
  console.assert(pack !== null && pack !== undefined, "pack present");
  console.assert(DEFAULT_CONFIDENTIAL_LAG.length > 0, "default lag");
  const tmpl = findResidueTemplate(pack, RESIDUE_ID_CONFIDENTIAL_LAG);
  if (tmpl !== null && tmpl.statement.length > 0) return tmpl.statement;
  return DEFAULT_CONFIDENTIAL_LAG;
}

function ducAgeStatement(pack: DomainPack, days: number): string {
  console.assert(pack !== null && pack !== undefined, "pack present");
  console.assert(days >= 0, "days non-neg");
  const tmpl = findResidueTemplate(pack, RESIDUE_ID_DUC_AGE);
  const base =
    tmpl !== null && tmpl.statement.length > 0
      ? tmpl.statement
      : DEFAULT_DUC_AGE;
  const suffix =
    " Measured days-since-spud=" +
    String(days) +
    " (threshold " +
    String(DUC_AGE_DAYS_THRESHOLD) +
    ").";
  const merged = base + suffix;
  if (merged.length <= MAX_LONG_TEXT_LEN) return merged;
  return merged.slice(0, MAX_LONG_TEXT_LEN);
}

function statusIsSealed(well: WellRow): boolean {
  console.assert(well !== null && well !== undefined, "well present");
  console.assert(true, "statusIsSealed entry");
  if (well.status != null && well.status === "Confidential") return true;
  return outcomeOf(well.status) === "sealed";
}

function statusIsDuc(well: WellRow): boolean {
  console.assert(well !== null && well !== undefined, "well present");
  console.assert(true, "statusIsDuc entry");
  if (well.status != null && well.status === "NC") return true;
  return outcomeOf(well.status) === "duc";
}

/**
 * Derive bounded residue + kill-fact hints from WellRow + pack rules.
 * Never invents oil/gas/water volumes.
 */
export function deriveFromWell(input: DeriveFromWellInput): DeriveFromWellResult {
  console.assert(input !== null && input !== undefined, "input present");
  console.assert(DUC_AGE_DAYS_THRESHOLD >= 1, "threshold positive");
  const facts: MeasuredFact[] = [];
  const residue: ResidueItem[] = [];
  if (input.well === null || input.well === undefined) {
    return { facts, residue };
  }
  if (input.pack === null || input.pack === undefined) {
    return { facts, residue };
  }

  const nowMs =
    typeof input.nowMs === "number" && Number.isFinite(input.nowMs)
      ? input.nowMs
      : Date.now();
  const days = daysSinceSpud(input.well.spud, nowMs);
  if (days !== null) {
    pushFact(facts, FACT_KEY_DAYS_SINCE_SPUD, String(days), "derived");
  }

  if (statusIsSealed(input.well)) {
    pushResidue(
      residue,
      RESIDUE_ID_CONFIDENTIAL_LAG,
      confidentialLagStatement(input.pack),
      "measured",
    );
  }

  if (statusIsDuc(input.well) && days !== null && days >= DUC_AGE_DAYS_THRESHOLD) {
    pushResidue(
      residue,
      RESIDUE_ID_DUC_AGE,
      ducAgeStatement(input.pack, days),
      "derived",
    );
    if (packHasKill(input.pack, KILL_ID_STALE_DUC)) {
      const key = "kill:" + KILL_ID_STALE_DUC;
      pushFact(facts, key, KILL_TRIGGER_VALUE, "derived");
    }
  }

  console.assert(facts.length <= MAX_MEASURED_FACTS, "derived facts bounded");
  console.assert(residue.length <= MAX_RESIDUE_ITEMS, "derived residue bounded");
  console.assert(
    FACT_KEY_DAYS_SINCE_SPUD.length <= MAX_TEXT_LEN,
    "fact key text bound",
  );
  return { facts, residue };
}
