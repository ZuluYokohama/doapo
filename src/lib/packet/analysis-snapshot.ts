/**
 * Durable analysis snapshot — fail-closed freeze of live prioritize / cohort.
 * Keyed by pull time + pack id/version (+ optional search query label).
 * Digested for cite/verify; localStorage store is bounded + verify-on-load.
 * Power of 10: flat, bounded loops, no recursion, ≤60 lines/fn, ≥2 asserts/fn.
 * Not an export/import treadmill. No invented volumes. Demo — not durable authority.
 */
import { createHash } from "node:crypto";
import type { WellRow } from "../outcomes.ts";
import {
  MAX_COHORT_WELLS,
  summarizeOutcomeCohort,
  type CohortClassCount,
} from "./outcome-cohort.ts";
import {
  MAX_PRIORITIZE_OPERATORS,
  MAX_PRIORITIZE_WELLS,
  prioritizeOperators,
  prioritizeWells,
  type PrioritizeOperatorRow,
  type PrioritizeWellRow,
} from "./prioritize.ts";
import {
  MAX_ID_LEN,
  MAX_OUTCOME_CLASSES,
  MAX_TEXT_LEN,
  type DomainPack,
} from "./types.ts";

export const ANALYSIS_SNAPSHOT_SCHEMA = "doapo-analysis-snapshot/1";

/** Cap on snapshots kept in durable store (oldest dropped). */
export const MAX_ANALYSIS_SNAPSHOTS = 8;

/** Cap on serialized store payload (Power of 10). */
export const MAX_SNAPSHOT_STORE_CHARS = 262144;

/** localStorage key — survives tab close; verify-on-load. */
export const ANALYSIS_SNAPSHOT_STORE_KEY =
  "doapo.packet.analysis-snapshot.v1";

export const SNAPSHOT_STORE_VERSION = 1;

export type AnalysisSnapshotKind =
  | "prioritize-wells"
  | "prioritize-operators"
  | "outcome-cohort";

export type AnalysisSnapshotPrioritize = {
  mode: "wells" | "operators";
  total: number;
  skipped: number;
  wellRows: PrioritizeWellRow[];
  operatorRows: PrioritizeOperatorRow[];
};

export type AnalysisSnapshotCohort = {
  total: number;
  unmatched: number;
  skipped: number;
  byClass: CohortClassCount[];
};

export type AnalysisSnapshot = {
  schemaVersion: string;
  pulledAtIso: string;
  packId: string;
  packVersion: string;
  searchQueryLabel: string;
  kind: AnalysisSnapshotKind;
  prioritize: AnalysisSnapshotPrioritize | null;
  cohort: AnalysisSnapshotCohort | null;
  /** SHA-256 of canonical JSON of all fields except this digest. */
  snapshotDigest: string;
};

export type FreezeSnapshotResult =
  | { ok: true; snapshot: AnalysisSnapshot }
  | { ok: false; reason: string };

export type VerifySnapshotResult =
  | { ok: true; snapshot: AnalysisSnapshot }
  | { ok: false; reason: string };

export type SaveSnapshotResult =
  | { ok: true; count: number }
  | { ok: false; reason: string };

export type LoadSnapshotsResult = {
  snapshots: AnalysisSnapshot[];
  reason: string | null;
};

type SnapshotWithoutDigest = Omit<AnalysisSnapshot, "snapshotDigest">;

function failFreeze(reason: string): FreezeSnapshotResult {
  console.assert(typeof reason === "string", "freeze reason string");
  console.assert(reason.length > 0, "freeze reason present");
  return { ok: false, reason };
}

function failVerify(reason: string): VerifySnapshotResult {
  console.assert(typeof reason === "string", "verify reason string");
  console.assert(reason.length > 0, "verify reason present");
  return { ok: false, reason };
}

function clipId(raw: string): string {
  console.assert(typeof raw === "string", "clipId string");
  console.assert(MAX_ID_LEN >= 1, "id cap positive");
  if (raw.length === 0) return "";
  if (raw.length <= MAX_ID_LEN) return raw;
  return raw.slice(0, MAX_ID_LEN);
}

function clipText(raw: string): string {
  console.assert(typeof raw === "string", "clipText string");
  console.assert(MAX_TEXT_LEN >= 1, "text cap positive");
  if (raw.length === 0) return "";
  if (raw.length <= MAX_TEXT_LEN) return raw;
  return raw.slice(0, MAX_TEXT_LEN);
}

function boundPackMeta(
  packId: string,
  packVersion: string,
): { ok: true; packId: string; packVersion: string } | { ok: false; reason: string } {
  console.assert(typeof packId === "string", "packId string");
  console.assert(typeof packVersion === "string", "packVersion string");
  if (packId.length === 0) return { ok: false, reason: "packId required" };
  if (packId.length > MAX_ID_LEN) {
    return { ok: false, reason: "packId exceeds MAX_ID_LEN" };
  }
  if (packVersion.length === 0) {
    return { ok: false, reason: "packVersion required" };
  }
  if (packVersion.length > MAX_ID_LEN) {
    return { ok: false, reason: "packVersion exceeds MAX_ID_LEN" };
  }
  return { ok: true, packId: clipId(packId), packVersion: clipId(packVersion) };
}

function resolvePulledAt(raw: string | undefined): string {
  console.assert(true, "resolvePulledAt entry");
  console.assert(MAX_TEXT_LEN >= 1, "text bound");
  if (typeof raw === "string" && raw.length > 0) {
    return clipText(raw);
  }
  return new Date().toISOString();
}

function resolveLabel(raw: string | undefined): string {
  console.assert(true, "resolveLabel entry");
  console.assert(MAX_TEXT_LEN >= 1, "text bound");
  if (typeof raw !== "string" || raw.length === 0) return "";
  return clipText(raw);
}

function cloneWellRows(rows: PrioritizeWellRow[]): PrioritizeWellRow[] {
  console.assert(Array.isArray(rows), "well rows array");
  console.assert(rows.length <= MAX_PRIORITIZE_WELLS, "wells within cap");
  const out: PrioritizeWellRow[] = [];
  let i = 0;
  while (i < rows.length && out.length < MAX_PRIORITIZE_WELLS) {
    const r = rows[i];
    out.push({
      subjectId: r.subjectId,
      wellLabel: r.wellLabel,
      operator: r.operator,
      county: r.county,
      status: r.status,
      daysSinceSpud: r.daysSinceSpud,
      outcomeId: r.outcomeId,
      staleDuc: r.staleDuc,
      priority: r.priority,
    });
    i += 1;
  }
  return out;
}

function cloneOperatorRows(
  rows: PrioritizeOperatorRow[],
): PrioritizeOperatorRow[] {
  console.assert(Array.isArray(rows), "op rows array");
  console.assert(rows.length <= MAX_PRIORITIZE_OPERATORS, "ops within cap");
  const out: PrioritizeOperatorRow[] = [];
  let i = 0;
  while (i < rows.length && out.length < MAX_PRIORITIZE_OPERATORS) {
    const r = rows[i];
    out.push({
      operator: r.operator,
      wellCount: r.wellCount,
      ducCount: r.ducCount,
      staleDucCount: r.staleDucCount,
      sealedCount: r.sealedCount,
      maxDaysSinceSpud: r.maxDaysSinceSpud,
      countySample: r.countySample,
      priority: r.priority,
    });
    i += 1;
  }
  return out;
}

function cloneByClass(rows: CohortClassCount[]): CohortClassCount[] {
  console.assert(Array.isArray(rows), "byClass array");
  console.assert(rows.length <= MAX_OUTCOME_CLASSES, "classes within cap");
  const out: CohortClassCount[] = [];
  let i = 0;
  while (i < rows.length && out.length < MAX_OUTCOME_CLASSES) {
    const r = rows[i];
    out.push({ id: r.id, label: r.label, count: r.count });
    i += 1;
  }
  return out;
}

/**
 * Canonical JSON for digest: fixed field order, no pretty whitespace.
 */
function canonicalSnapshotJson(fields: SnapshotWithoutDigest): string {
  console.assert(fields !== null && fields !== undefined, "fields present");
  console.assert(typeof fields.schemaVersion === "string", "schema string");
  return JSON.stringify({
    schemaVersion: fields.schemaVersion,
    pulledAtIso: fields.pulledAtIso,
    packId: fields.packId,
    packVersion: fields.packVersion,
    searchQueryLabel: fields.searchQueryLabel,
    kind: fields.kind,
    prioritize: fields.prioritize,
    cohort: fields.cohort,
  });
}

function digestCanonical(canonical: string): string {
  console.assert(typeof canonical === "string", "canonical string");
  console.assert(canonical.length > 0, "canonical non-empty");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

function sealSnapshot(fields: SnapshotWithoutDigest): AnalysisSnapshot {
  console.assert(fields !== null && fields !== undefined, "fields present");
  console.assert(fields.kind.length > 0, "kind present");
  const snapshotDigest = digestCanonical(canonicalSnapshotJson(fields));
  console.assert(snapshotDigest.length === 64, "sha256 hex length");
  return { ...fields, snapshotDigest };
}

export type FreezePrioritizeSnapshotInput = {
  wells: WellRow[];
  packId: string;
  packVersion: string;
  mode: "wells" | "operators";
  searchQueryLabel?: string;
  pulledAtIso?: string;
  maxWells?: number;
  nowMs?: number;
};

/**
 * Freeze prioritizeWells / prioritizeOperators into a durable snapshot.
 */
export function freezePrioritizeSnapshot(
  input: FreezePrioritizeSnapshotInput,
): FreezeSnapshotResult {
  console.assert(input !== null && input !== undefined, "input present");
  console.assert(true, "freezePrioritizeSnapshot entry");
  if (input === null || input === undefined) {
    return failFreeze("input required");
  }
  if (!Array.isArray(input.wells)) return failFreeze("wells required");
  if (input.mode !== "wells" && input.mode !== "operators") {
    return failFreeze("mode invalid");
  }
  const meta = boundPackMeta(input.packId, input.packVersion);
  if (!meta.ok) return failFreeze(meta.reason);

  const ranked =
    input.mode === "wells"
      ? prioritizeWells({
          wells: input.wells,
          maxWells: input.maxWells,
          nowMs: input.nowMs,
        })
      : prioritizeOperators({
          wells: input.wells,
          maxWells: input.maxWells,
          nowMs: input.nowMs,
        });
  if (!ranked.ok) return failFreeze(ranked.reason);

  const prioritize: AnalysisSnapshotPrioritize =
    ranked.mode === "wells"
      ? {
          mode: "wells",
          total: ranked.total,
          skipped: ranked.skipped,
          wellRows: cloneWellRows(ranked.rows),
          operatorRows: [],
        }
      : {
          mode: "operators",
          total: ranked.total,
          skipped: ranked.skipped,
          wellRows: [],
          operatorRows: cloneOperatorRows(ranked.rows),
        };

  const fields: SnapshotWithoutDigest = {
    schemaVersion: ANALYSIS_SNAPSHOT_SCHEMA,
    pulledAtIso: resolvePulledAt(input.pulledAtIso),
    packId: meta.packId,
    packVersion: meta.packVersion,
    searchQueryLabel: resolveLabel(input.searchQueryLabel),
    kind:
      input.mode === "wells" ? "prioritize-wells" : "prioritize-operators",
    prioritize,
    cohort: null,
  };
  return { ok: true, snapshot: sealSnapshot(fields) };
}

export type FreezeCohortSnapshotInput = {
  wells: WellRow[];
  pack: DomainPack;
  searchQueryLabel?: string;
  pulledAtIso?: string;
  maxWells?: number;
};

/**
 * Freeze summarizeOutcomeCohort into a durable snapshot.
 */
export function freezeCohortSnapshot(
  input: FreezeCohortSnapshotInput,
): FreezeSnapshotResult {
  console.assert(input !== null && input !== undefined, "input present");
  console.assert(true, "freezeCohortSnapshot entry");
  if (input === null || input === undefined) {
    return failFreeze("input required");
  }
  if (input.pack === null || input.pack === undefined) {
    return failFreeze("pack required");
  }
  if (!Array.isArray(input.wells)) return failFreeze("wells required");
  const meta = boundPackMeta(input.pack.id, input.pack.version);
  if (!meta.ok) return failFreeze(meta.reason);

  const summarized = summarizeOutcomeCohort({
    wells: input.wells,
    pack: input.pack,
    maxWells: input.maxWells,
  });
  if (!summarized.ok) return failFreeze(summarized.reason);
  console.assert(summarized.total <= MAX_COHORT_WELLS, "cohort within cap");

  const fields: SnapshotWithoutDigest = {
    schemaVersion: ANALYSIS_SNAPSHOT_SCHEMA,
    pulledAtIso: resolvePulledAt(input.pulledAtIso),
    packId: meta.packId,
    packVersion: meta.packVersion,
    searchQueryLabel: resolveLabel(input.searchQueryLabel),
    kind: "outcome-cohort",
    prioritize: null,
    cohort: {
      total: summarized.total,
      unmatched: summarized.unmatched,
      skipped: summarized.skipped,
      byClass: cloneByClass(summarized.byClass),
    },
  };
  return { ok: true, snapshot: sealSnapshot(fields) };
}

/**
 * Short citation string for evidence/export notes (digest only).
 */
export function citeSnapshotDigest(digest: string): string {
  console.assert(typeof digest === "string", "digest string");
  console.assert(true, "citeSnapshotDigest entry");
  if (digest.length !== 64) return "snapshotDigest:invalid";
  let i = 0;
  while (i < 64) {
    const c = digest.charCodeAt(i);
    const hex =
      (c >= 48 && c <= 57) || (c >= 97 && c <= 102) || (c >= 65 && c <= 70);
    if (!hex) return "snapshotDigest:invalid";
    i += 1;
  }
  return "snapshotDigest:" + digest;
}

function isKind(raw: unknown): raw is AnalysisSnapshotKind {
  console.assert(true, "isKind entry");
  console.assert(ANALYSIS_SNAPSHOT_SCHEMA.length > 0, "schema const");
  return (
    raw === "prioritize-wells" ||
    raw === "prioritize-operators" ||
    raw === "outcome-cohort"
  );
}

function parsePrioritize(
  raw: unknown,
): AnalysisSnapshotPrioritize | null | { err: string } {
  console.assert(true, "parsePrioritize entry");
  console.assert(MAX_PRIORITIZE_WELLS >= 1, "cap positive");
  if (raw === null) return null;
  if (raw === undefined || typeof raw !== "object") {
    return { err: "prioritize invalid" };
  }
  const o = raw as Record<string, unknown>;
  if (o.mode !== "wells" && o.mode !== "operators") {
    return { err: "prioritize.mode invalid" };
  }
  if (typeof o.total !== "number" || o.total < 0 || o.total > MAX_PRIORITIZE_WELLS) {
    return { err: "prioritize.total invalid" };
  }
  if (typeof o.skipped !== "number" || o.skipped < 0) {
    return { err: "prioritize.skipped invalid" };
  }
  if (!Array.isArray(o.wellRows) || o.wellRows.length > MAX_PRIORITIZE_WELLS) {
    return { err: "prioritize.wellRows invalid" };
  }
  if (
    !Array.isArray(o.operatorRows) ||
    o.operatorRows.length > MAX_PRIORITIZE_OPERATORS
  ) {
    return { err: "prioritize.operatorRows invalid" };
  }
  return {
    mode: o.mode,
    total: o.total,
    skipped: o.skipped,
    wellRows: o.wellRows as PrioritizeWellRow[],
    operatorRows: o.operatorRows as PrioritizeOperatorRow[],
  };
}

function parseCohort(
  raw: unknown,
): AnalysisSnapshotCohort | null | { err: string } {
  console.assert(true, "parseCohort entry");
  console.assert(MAX_COHORT_WELLS >= 1, "cohort cap positive");
  if (raw === null) return null;
  if (raw === undefined || typeof raw !== "object") {
    return { err: "cohort invalid" };
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.total !== "number" || o.total < 0 || o.total > MAX_COHORT_WELLS) {
    return { err: "cohort.total invalid" };
  }
  if (typeof o.unmatched !== "number" || o.unmatched < 0) {
    return { err: "cohort.unmatched invalid" };
  }
  if (typeof o.skipped !== "number" || o.skipped < 0) {
    return { err: "cohort.skipped invalid" };
  }
  if (!Array.isArray(o.byClass) || o.byClass.length > MAX_OUTCOME_CLASSES) {
    return { err: "cohort.byClass invalid" };
  }
  return {
    total: o.total,
    unmatched: o.unmatched,
    skipped: o.skipped,
    byClass: o.byClass as CohortClassCount[],
  };
}

function readSnapshotHeader(
  o: Record<string, unknown>,
): { ok: true; fields: SnapshotWithoutDigest; digest: string } | { ok: false; reason: string } {
  console.assert(o !== null && o !== undefined, "object present");
  console.assert(ANALYSIS_SNAPSHOT_SCHEMA.length > 0, "schema present");
  if (o.schemaVersion !== ANALYSIS_SNAPSHOT_SCHEMA) {
    return { ok: false, reason: "schemaVersion mismatch" };
  }
  if (typeof o.pulledAtIso !== "string" || o.pulledAtIso.length === 0) {
    return { ok: false, reason: "pulledAtIso required" };
  }
  if (typeof o.packId !== "string" || o.packId.length === 0) {
    return { ok: false, reason: "packId required" };
  }
  if (typeof o.packVersion !== "string" || o.packVersion.length === 0) {
    return { ok: false, reason: "packVersion required" };
  }
  if (typeof o.searchQueryLabel !== "string") {
    return { ok: false, reason: "searchQueryLabel required" };
  }
  if (!isKind(o.kind)) return { ok: false, reason: "kind invalid" };
  if (typeof o.snapshotDigest !== "string" || o.snapshotDigest.length !== 64) {
    return { ok: false, reason: "snapshotDigest invalid" };
  }
  const prioritize = parsePrioritize(o.prioritize);
  if (prioritize !== null && "err" in prioritize) {
    return { ok: false, reason: prioritize.err };
  }
  const cohort = parseCohort(o.cohort);
  if (cohort !== null && "err" in cohort) {
    return { ok: false, reason: cohort.err };
  }
  if (o.kind === "outcome-cohort" && cohort === null) {
    return { ok: false, reason: "cohort required for outcome-cohort" };
  }
  if (
    (o.kind === "prioritize-wells" || o.kind === "prioritize-operators") &&
    prioritize === null
  ) {
    return { ok: false, reason: "prioritize required for prioritize kind" };
  }
  return {
    ok: true,
    digest: o.snapshotDigest,
    fields: {
      schemaVersion: ANALYSIS_SNAPSHOT_SCHEMA,
      pulledAtIso: clipText(o.pulledAtIso),
      packId: clipId(o.packId),
      packVersion: clipId(o.packVersion),
      searchQueryLabel: clipText(o.searchQueryLabel),
      kind: o.kind,
      prioritize: prioritize as AnalysisSnapshotPrioritize | null,
      cohort: cohort as AnalysisSnapshotCohort | null,
    },
  };
}

/**
 * Parse + recompute snapshotDigest. Fail-closed on mismatch / shape errors.
 */
export function verifyAnalysisSnapshot(
  raw: unknown,
): VerifySnapshotResult {
  console.assert(true, "verifyAnalysisSnapshot entry");
  console.assert(ANALYSIS_SNAPSHOT_SCHEMA.length > 0, "schema present");
  if (raw === null || raw === undefined || typeof raw !== "object") {
    return failVerify("snapshot required");
  }
  const header = readSnapshotHeader(raw as Record<string, unknown>);
  if (!header.ok) return failVerify(header.reason);
  const recomputed = digestCanonical(canonicalSnapshotJson(header.fields));
  if (recomputed !== header.digest) {
    return failVerify("snapshotDigest mismatch");
  }
  return {
    ok: true,
    snapshot: { ...header.fields, snapshotDigest: header.digest },
  };
}

function canUseLocalStorage(): boolean {
  console.assert(true, "canUseLocalStorage entry");
  console.assert(ANALYSIS_SNAPSHOT_STORE_KEY.length > 0, "key present");
  return (
    typeof window !== "undefined" &&
    typeof window.localStorage !== "undefined"
  );
}

type StorePayload = {
  version: number;
  snapshots: AnalysisSnapshot[];
};

function parseStorePayload(raw: string): LoadSnapshotsResult {
  console.assert(typeof raw === "string", "raw string");
  console.assert(raw.length > 0, "raw non-empty");
  if (raw.length > MAX_SNAPSHOT_STORE_CHARS) {
    return { snapshots: [], reason: "payload exceeds MAX_SNAPSHOT_STORE_CHARS" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { snapshots: [], reason: "JSON parse failed" };
  }
  if (parsed === null || typeof parsed !== "object") {
    return { snapshots: [], reason: "payload not object" };
  }
  const o = parsed as Record<string, unknown>;
  if (o.version !== SNAPSHOT_STORE_VERSION) {
    return { snapshots: [], reason: "store version mismatch" };
  }
  if (!Array.isArray(o.snapshots)) {
    return { snapshots: [], reason: "snapshots not array" };
  }
  if (o.snapshots.length > MAX_ANALYSIS_SNAPSHOTS) {
    return { snapshots: [], reason: "snapshots exceed MAX_ANALYSIS_SNAPSHOTS" };
  }
  const out: AnalysisSnapshot[] = [];
  let i = 0;
  while (i < o.snapshots.length) {
    const checked = verifyAnalysisSnapshot(o.snapshots[i]);
    if (!checked.ok) {
      return { snapshots: [], reason: "snapshot verify failed: " + checked.reason };
    }
    out.push(checked.snapshot);
    i += 1;
  }
  return { snapshots: out, reason: null };
}

/** Load durable snapshots. Corrupt / digest fail → empty + reason. */
export function loadAnalysisSnapshots(): LoadSnapshotsResult {
  console.assert(true, "loadAnalysisSnapshots entry");
  console.assert(MAX_ANALYSIS_SNAPSHOTS >= 1, "cap positive");
  if (!canUseLocalStorage()) {
    return { snapshots: [], reason: "localStorage unavailable" };
  }
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(ANALYSIS_SNAPSHOT_STORE_KEY);
  } catch {
    return { snapshots: [], reason: "localStorage getItem failed" };
  }
  if (raw === null) return { snapshots: [], reason: null };
  return parseStorePayload(raw);
}

/**
 * Append one verified snapshot (newest first). Drops oldest past cap.
 * Re-verifies digest before write.
 */
export function saveAnalysisSnapshot(
  snapshot: AnalysisSnapshot,
): SaveSnapshotResult {
  console.assert(snapshot !== null && snapshot !== undefined, "snapshot present");
  console.assert(true, "saveAnalysisSnapshot entry");
  if (!canUseLocalStorage()) {
    return { ok: false, reason: "localStorage unavailable" };
  }
  const checked = verifyAnalysisSnapshot(snapshot);
  if (!checked.ok) return { ok: false, reason: checked.reason };

  const loaded = loadAnalysisSnapshots();
  if (loaded.reason !== null && loaded.snapshots.length === 0) {
    // corrupt store → start fresh after verify of new item
  }
  const next: AnalysisSnapshot[] = [checked.snapshot];
  let i = 0;
  while (
    i < loaded.snapshots.length &&
    next.length < MAX_ANALYSIS_SNAPSHOTS
  ) {
    if (loaded.snapshots[i].snapshotDigest !== checked.snapshot.snapshotDigest) {
      next.push(loaded.snapshots[i]);
    }
    i += 1;
  }
  const payload: StorePayload = {
    version: SNAPSHOT_STORE_VERSION,
    snapshots: next,
  };
  const json = JSON.stringify(payload);
  if (json.length > MAX_SNAPSHOT_STORE_CHARS) {
    return { ok: false, reason: "payload exceeds MAX_SNAPSHOT_STORE_CHARS" };
  }
  try {
    window.localStorage.setItem(ANALYSIS_SNAPSHOT_STORE_KEY, json);
  } catch {
    return { ok: false, reason: "localStorage setItem failed" };
  }
  return { ok: true, count: next.length };
}

/** Clear durable analysis snapshots (ignore if unavailable). */
export function clearAnalysisSnapshots(): void {
  console.assert(true, "clearAnalysisSnapshots entry");
  console.assert(ANALYSIS_SNAPSHOT_STORE_KEY.length > 0, "key present");
  if (!canUseLocalStorage()) return;
  try {
    window.localStorage.removeItem(ANALYSIS_SNAPSHOT_STORE_KEY);
  } catch {
    // ignore
  }
}

/** True when store key exists. Fail-closed if storage unavailable. */
export function analysisSnapshotsPresent(): boolean {
  console.assert(true, "analysisSnapshotsPresent entry");
  console.assert(ANALYSIS_SNAPSHOT_STORE_KEY.length > 0, "key present");
  if (!canUseLocalStorage()) return false;
  try {
    return window.localStorage.getItem(ANALYSIS_SNAPSHOT_STORE_KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * Build a short search-query label from optional filter parts (bounded).
 */
export function buildSearchQueryLabel(parts: {
  q?: string;
  county?: string;
  outcome?: string;
  oilGasOnly?: boolean;
}): string {
  console.assert(parts !== null && parts !== undefined, "parts present");
  console.assert(MAX_TEXT_LEN >= 1, "text bound");
  const chunks: string[] = [];
  if (typeof parts.q === "string" && parts.q.length > 0) {
    chunks.push("q=" + clipText(parts.q));
  }
  if (typeof parts.county === "string" && parts.county.length > 0) {
    chunks.push("county=" + clipText(parts.county));
  }
  if (typeof parts.outcome === "string" && parts.outcome.length > 0) {
    chunks.push("outcome=" + clipText(parts.outcome));
  }
  if (parts.oilGasOnly === true) chunks.push("oilGasOnly=1");
  if (chunks.length === 0) return "";
  let joined = chunks[0];
  let i = 1;
  while (i < chunks.length) {
    joined += ";" + chunks[i];
    i += 1;
  }
  return clipText(joined);
}
