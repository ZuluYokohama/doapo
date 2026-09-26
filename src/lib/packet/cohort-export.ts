/**
 * Outcome cohort export/import — fail-closed summary freeze artifact.
 * Power of 10: flat control flow, bounded loops, no recursion, ≥2 asserts/fn.
 * Pure module: no DOM. Demo artifact — not durable authority.
 */
import { createHash } from "node:crypto";
import type { WellRow } from "../outcomes.ts";
import {
  MAX_ID_LEN,
  MAX_LONG_TEXT_LEN,
  MAX_OUTCOME_CLASSES,
  MAX_TEXT_LEN,
  type DomainPack,
} from "./types.ts";
import {
  MAX_COHORT_WELLS,
  summarizeOutcomeCohort,
  type CohortClassCount,
} from "./outcome-cohort.ts";

export const COHORT_SCHEMA_VERSION = "doapo-outcome-cohort/1";

export const DEFAULT_COHORT_EXPORT_NOTES =
  "demo cohort export; search-page summary — not durable authority; humans still own OPEN";

const MAX_FILENAME_PACK = 48;

export type OutcomeCohortBundle = {
  schemaVersion: string;
  exportedAtIso: string;
  packId: string;
  packVersion: string;
  total: number;
  byClass: CohortClassCount[];
  unmatched: number;
  skipped: number;
  notes: string;
  /** SHA-256 of canonical JSON of all fields except this digest. */
  bundleDigest: string;
};

export type ExportOutcomeCohortResult =
  | { ok: true; bundle: OutcomeCohortBundle; json: string }
  | { ok: false; reason: string };

export type ExportOutcomeCohortInput = {
  wells: WellRow[];
  pack: DomainPack;
  notes?: string;
  maxWells?: number;
};

function failExport(reason: string): ExportOutcomeCohortResult {
  console.assert(typeof reason === "string", "cohort export fail reason string");
  console.assert(reason.length > 0, "cohort export fail reason present");
  return { ok: false, reason };
}

function boundNotes(raw: string | undefined): string {
  console.assert(true, "cohort notes bound entry");
  console.assert(MAX_LONG_TEXT_LEN > 0, "long text cap positive");
  const base =
    typeof raw === "string" && raw.length > 0
      ? raw
      : DEFAULT_COHORT_EXPORT_NOTES;
  if (base.length <= MAX_LONG_TEXT_LEN) return base;
  return base.slice(0, MAX_LONG_TEXT_LEN);
}

function cloneByClass(rows: CohortClassCount[]): CohortClassCount[] {
  console.assert(Array.isArray(rows), "byClass array for clone");
  console.assert(rows.length >= 0, "byClass length");
  const out: CohortClassCount[] = [];
  let i = 0;
  while (i < rows.length) {
    const row = rows[i];
    out.push({ id: row.id, label: row.label, count: row.count });
    i += 1;
  }
  return out;
}

/**
 * Canonical JSON for digest: fixed field order, no pretty whitespace.
 */
function canonicalBundleJson(
  fields: Omit<OutcomeCohortBundle, "bundleDigest">,
): string {
  console.assert(fields !== null && fields !== undefined, "fields present");
  console.assert(typeof fields.schemaVersion === "string", "schema string");
  const ordered = {
    schemaVersion: fields.schemaVersion,
    exportedAtIso: fields.exportedAtIso,
    packId: fields.packId,
    packVersion: fields.packVersion,
    total: fields.total,
    byClass: fields.byClass,
    unmatched: fields.unmatched,
    skipped: fields.skipped,
    notes: fields.notes,
  };
  return JSON.stringify(ordered);
}

function digestCanonical(canonical: string): string {
  console.assert(typeof canonical === "string", "canonical string");
  console.assert(canonical.length > 0, "canonical non-empty");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/**
 * Safe download basename: outcome-cohort-<packId>.json
 * Non-safe chars → underscore; truncate pack segment.
 */
export function cohortFilename(packId: string): string {
  console.assert(typeof packId === "string", "packId string");
  console.assert(MAX_FILENAME_PACK > 0, "filename pack cap positive");
  let safe = "";
  if (typeof packId === "string" && packId.length > 0) {
    const bound =
      packId.length <= MAX_FILENAME_PACK
        ? packId.length
        : MAX_FILENAME_PACK;
    let i = 0;
    while (i < bound) {
      const ch = packId.charAt(i);
      const code = packId.charCodeAt(i);
      const ok =
        (code >= 48 && code <= 57) ||
        (code >= 65 && code <= 90) ||
        (code >= 97 && code <= 122) ||
        ch === "-" ||
        ch === "_";
      safe += ok ? ch : "_";
      i += 1;
    }
  }
  if (safe.length === 0) safe = "unknown";
  return "outcome-cohort-" + safe + ".json";
}

/**
 * Build a fail-closed cohort summary JSON freeze artifact.
 * Delegates counts to summarizeOutcomeCohort; fails when that fails.
 */
export function exportOutcomeCohort(
  input: ExportOutcomeCohortInput,
): ExportOutcomeCohortResult {
  console.assert(input !== null && input !== undefined, "input present");
  console.assert(true, "exportOutcomeCohort entry");
  if (input === null || input === undefined) {
    return failExport("export input required");
  }
  if (input.pack === null || input.pack === undefined) {
    return failExport("pack required");
  }
  if (typeof input.pack.id !== "string" || input.pack.id.length === 0) {
    return failExport("packId required");
  }
  if (input.pack.id.length > MAX_ID_LEN) {
    return failExport("packId exceeds MAX_ID_LEN");
  }
  if (
    typeof input.pack.version !== "string" ||
    input.pack.version.length === 0
  ) {
    return failExport("packVersion required");
  }
  if (!Array.isArray(input.wells)) {
    return failExport("wells required");
  }

  const summarized = summarizeOutcomeCohort({
    wells: input.wells,
    pack: input.pack,
    maxWells: input.maxWells,
  });
  if (!summarized.ok) {
    return failExport(summarized.reason);
  }
  console.assert(summarized.total <= MAX_COHORT_WELLS, "export total within cap");

  const byClass = cloneByClass(summarized.byClass);
  const withoutDigest = {
    schemaVersion: COHORT_SCHEMA_VERSION,
    exportedAtIso: new Date().toISOString(),
    packId: input.pack.id,
    packVersion: input.pack.version,
    total: summarized.total,
    byClass,
    unmatched: summarized.unmatched,
    skipped: summarized.skipped,
    notes: boundNotes(input.notes),
  };
  const bundleDigest = digestCanonical(canonicalBundleJson(withoutDigest));
  const bundle: OutcomeCohortBundle = { ...withoutDigest, bundleDigest };
  const json = JSON.stringify(bundle, null, 2);
  console.assert(json.length > 0, "json non-empty");
  console.assert(bundleDigest.length === 64, "sha256 hex length");
  return { ok: true, bundle, json };
}

/** Hard cap on cohort JSON text length (Power of 10). */
export const MAX_COHORT_JSON_CHARS = 65536;

export type ImportOutcomeCohortOk = {
  ok: true;
  bundle: OutcomeCohortBundle;
};
export type ImportOutcomeCohortErr = { ok: false; reason: string };
export type ImportOutcomeCohortResult =
  | ImportOutcomeCohortOk
  | ImportOutcomeCohortErr;

function failImport(reason: string): ImportOutcomeCohortErr {
  console.assert(typeof reason === "string", "cohort import fail reason string");
  console.assert(reason.length > 0, "cohort import fail reason present");
  return { ok: false, reason };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  console.assert(true, "plain object check entry");
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  return true;
}

function requireNonEmptyString(
  value: unknown,
  label: string,
): { ok: true; value: string } | { ok: false; reason: string } {
  console.assert(typeof label === "string" && label.length > 0, "label present");
  console.assert(true, "require string entry");
  if (typeof value !== "string" || value.length === 0) {
    return { ok: false, reason: label + " required" };
  }
  return { ok: true, value };
}

function requireNonNegInt(
  value: unknown,
  label: string,
): { ok: true; value: number } | { ok: false; reason: string } {
  console.assert(typeof label === "string" && label.length > 0, "label present");
  console.assert(true, "require non-neg int entry");
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { ok: false, reason: label + " must be a finite number" };
  }
  if (value < 0 || Math.floor(value) !== value) {
    return { ok: false, reason: label + " must be a non-negative integer" };
  }
  return { ok: true, value };
}

function readByClassRow(
  row: unknown,
  index: number,
): { ok: true; row: CohortClassCount } | { ok: false; reason: string } {
  console.assert(typeof index === "number", "index number");
  console.assert(index >= 0, "index non-negative");
  if (!isPlainObject(row)) {
    return { ok: false, reason: "byClass[" + String(index) + "] must be object" };
  }
  if (typeof row.id !== "string" || row.id.length === 0) {
    return { ok: false, reason: "byClass[" + String(index) + "].id required" };
  }
  if (row.id.length > MAX_ID_LEN) {
    return {
      ok: false,
      reason: "byClass[" + String(index) + "].id exceeds MAX_ID_LEN",
    };
  }
  if (typeof row.label !== "string") {
    return {
      ok: false,
      reason: "byClass[" + String(index) + "].label must be string",
    };
  }
  if (row.label.length > MAX_TEXT_LEN) {
    return {
      ok: false,
      reason: "byClass[" + String(index) + "].label exceeds MAX_TEXT_LEN",
    };
  }
  const count = requireNonNegInt(
    row.count,
    "byClass[" + String(index) + "].count",
  );
  if (!count.ok) return count;
  return {
    ok: true,
    row: { id: row.id, label: row.label, count: count.value },
  };
}

function readByClass(
  raw: unknown,
): { ok: true; rows: CohortClassCount[] } | { ok: false; reason: string } {
  console.assert(MAX_OUTCOME_CLASSES > 0, "outcome class cap positive");
  console.assert(true, "readByClass entry");
  if (!Array.isArray(raw)) {
    return { ok: false, reason: "byClass must be an array" };
  }
  if (raw.length > MAX_OUTCOME_CLASSES) {
    return { ok: false, reason: "byClass exceeds MAX_OUTCOME_CLASSES" };
  }
  const out: CohortClassCount[] = [];
  let i = 0;
  while (i < raw.length) {
    const parsed = readByClassRow(raw[i], i);
    if (!parsed.ok) return parsed;
    out.push(parsed.row);
    i += 1;
  }
  return { ok: true, rows: out };
}

type ParsedCohortFields = Omit<OutcomeCohortBundle, "bundleDigest"> & {
  bundleDigest: string;
};

function checkCohortShape(
  raw: Record<string, unknown>,
): { ok: true } | { ok: false; reason: string } {
  console.assert(isPlainObject(raw), "raw object for shape");
  console.assert(COHORT_SCHEMA_VERSION.length > 0, "schema version set");
  if (raw.schemaVersion !== COHORT_SCHEMA_VERSION) {
    return { ok: false, reason: "schemaVersion mismatch" };
  }
  if (typeof raw.notes !== "string") {
    return { ok: false, reason: "notes must be string" };
  }
  if (raw.notes.length > MAX_LONG_TEXT_LEN) {
    return { ok: false, reason: "notes exceeds MAX_LONG_TEXT_LEN" };
  }
  if (typeof raw.bundleDigest !== "string" || raw.bundleDigest.length !== 64) {
    return { ok: false, reason: "bundleDigest invalid" };
  }
  return { ok: true };
}

function readCohortFields(
  raw: Record<string, unknown>,
): { ok: true; fields: ParsedCohortFields } | { ok: false; reason: string } {
  console.assert(isPlainObject(raw), "raw object for read");
  console.assert(true, "readCohortFields entry");
  const shape = checkCohortShape(raw);
  if (!shape.ok) return shape;
  const exportedAtIso = requireNonEmptyString(raw.exportedAtIso, "exportedAtIso");
  if (!exportedAtIso.ok) return exportedAtIso;
  const packId = requireNonEmptyString(raw.packId, "packId");
  if (!packId.ok) return packId;
  if (packId.value.length > MAX_ID_LEN) {
    return { ok: false, reason: "packId exceeds MAX_ID_LEN" };
  }
  const packVersion = requireNonEmptyString(raw.packVersion, "packVersion");
  if (!packVersion.ok) return packVersion;
  const total = requireNonNegInt(raw.total, "total");
  if (!total.ok) return total;
  if (total.value > MAX_COHORT_WELLS) {
    return { ok: false, reason: "total exceeds MAX_COHORT_WELLS" };
  }
  const unmatched = requireNonNegInt(raw.unmatched, "unmatched");
  if (!unmatched.ok) return unmatched;
  const skipped = requireNonNegInt(raw.skipped, "skipped");
  if (!skipped.ok) return skipped;
  const byClass = readByClass(raw.byClass);
  if (!byClass.ok) return byClass;
  return {
    ok: true,
    fields: {
      schemaVersion: COHORT_SCHEMA_VERSION,
      exportedAtIso: exportedAtIso.value,
      packId: packId.value,
      packVersion: packVersion.value,
      total: total.value,
      byClass: byClass.rows,
      unmatched: unmatched.value,
      skipped: skipped.value,
      notes: raw.notes as string,
      bundleDigest: raw.bundleDigest as string,
    },
  };
}

function parseCohortJson(
  jsonText: string,
): { ok: true; raw: Record<string, unknown> } | ImportOutcomeCohortErr {
  console.assert(typeof jsonText === "string", "parse text string");
  console.assert(MAX_COHORT_JSON_CHARS > 0, "json cap positive");
  if (typeof jsonText !== "string") {
    return failImport("text invalid");
  }
  if (jsonText.length === 0) {
    return failImport("text empty");
  }
  if (jsonText.length > MAX_COHORT_JSON_CHARS) {
    return failImport("text exceeds size cap");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return failImport("JSON parse failed");
  }
  if (!isPlainObject(parsed)) {
    return failImport("bundle must be a JSON object");
  }
  return { ok: true, raw: parsed };
}

/**
 * Parse + verify a cohort summary JSON freeze artifact.
 * Recomputes bundleDigest against canonical fields; fail-closed on mismatch.
 */
export function importOutcomeCohort(
  jsonText: string,
): ImportOutcomeCohortResult {
  console.assert(typeof jsonText === "string", "import text is string");
  console.assert(MAX_COHORT_JSON_CHARS > 0, "json cap positive");
  const parsed = parseCohortJson(jsonText);
  if (!parsed.ok) return parsed;
  const read = readCohortFields(parsed.raw);
  if (!read.ok) return failImport(read.reason);
  const withoutDigest = {
    schemaVersion: read.fields.schemaVersion,
    exportedAtIso: read.fields.exportedAtIso,
    packId: read.fields.packId,
    packVersion: read.fields.packVersion,
    total: read.fields.total,
    byClass: read.fields.byClass,
    unmatched: read.fields.unmatched,
    skipped: read.fields.skipped,
    notes: read.fields.notes,
  };
  const recomputed = digestCanonical(canonicalBundleJson(withoutDigest));
  if (recomputed !== read.fields.bundleDigest) {
    return failImport("bundleDigest mismatch");
  }
  const bundle: OutcomeCohortBundle = {
    ...withoutDigest,
    byClass: cloneByClass(read.fields.byClass),
    bundleDigest: read.fields.bundleDigest,
  };
  console.assert(bundle.bundleDigest.length === 64, "digest hex length");
  console.assert(bundle.packId.length > 0, "packId present");
  return { ok: true, bundle };
}
