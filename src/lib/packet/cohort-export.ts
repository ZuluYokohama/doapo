/**
 * Outcome cohort export — fail-closed downloadable summary artifact.
 * Power of 10: flat control flow, bounded loops, no recursion, ≥2 asserts/fn.
 * Pure module: no DOM. Demo artifact — not durable authority.
 */
import { createHash } from "node:crypto";
import type { WellRow } from "../outcomes.ts";
import {
  MAX_ID_LEN,
  MAX_LONG_TEXT_LEN,
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
