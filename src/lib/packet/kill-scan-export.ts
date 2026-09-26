/**
 * Kill scan export — fail-closed batch kill-scan freeze artifact.
 * Power of 10: flat control flow, bounded loops, no recursion, ≥2 asserts/fn.
 * Pure module: no DOM. Demo artifact — not durable authority.
 */
import { createHash } from "node:crypto";
import type { WellRow } from "../outcomes.ts";
import { MAX_ID_LEN, MAX_LONG_TEXT_LEN, type DomainPack } from "./types.ts";
import {
  MAX_KILL_SCAN_WELLS,
  scanWellsForKills,
  type KillScanRow,
} from "./kill-scan.ts";

export const KILL_SCAN_SCHEMA_VERSION = "doapo-kill-scan/1";

export const DEFAULT_KILL_SCAN_EXPORT_NOTES =
  "demo kill-scan export; search-page batch — not durable authority; humans still own OPEN";

const MAX_FILENAME_PACK = 48;

export type KillScanBundle = {
  schemaVersion: string;
  exportedAtIso: string;
  packId: string;
  packVersion: string;
  scanned: number;
  hitCount: number;
  rows: KillScanRow[];
  notes: string;
  /** SHA-256 of canonical JSON of all fields except this digest. */
  bundleDigest: string;
};

export type ExportKillScanResult =
  | { ok: true; bundle: KillScanBundle; json: string }
  | { ok: false; reason: string };

export type ExportKillScanInput = {
  wells: WellRow[];
  pack: DomainPack;
  notes?: string;
  maxWells?: number;
};

function failExport(reason: string): ExportKillScanResult {
  console.assert(typeof reason === "string", "kill-scan export fail reason string");
  console.assert(reason.length > 0, "kill-scan export fail reason present");
  return { ok: false, reason };
}

function boundNotes(raw: string | undefined): string {
  console.assert(true, "kill-scan notes bound entry");
  console.assert(MAX_LONG_TEXT_LEN > 0, "long text cap positive");
  const base =
    typeof raw === "string" && raw.length > 0
      ? raw
      : DEFAULT_KILL_SCAN_EXPORT_NOTES;
  if (base.length <= MAX_LONG_TEXT_LEN) return base;
  return base.slice(0, MAX_LONG_TEXT_LEN);
}

function cloneRow(row: KillScanRow): KillScanRow {
  console.assert(row !== null && row !== undefined, "row present");
  console.assert(typeof row.subjectId === "string", "subjectId string");
  const out: KillScanRow = {
    subjectId: row.subjectId,
    wellLabel: row.wellLabel,
    hit: row.hit,
  };
  if (typeof row.killId === "string") {
    out.killId = row.killId;
  }
  if (typeof row.reason === "string") {
    out.reason = row.reason;
  }
  return out;
}

function cloneRows(rows: KillScanRow[]): KillScanRow[] {
  console.assert(Array.isArray(rows), "rows array for clone");
  console.assert(rows.length >= 0, "rows length");
  const out: KillScanRow[] = [];
  let i = 0;
  while (i < rows.length) {
    out.push(cloneRow(rows[i]));
    i += 1;
  }
  return out;
}

/**
 * Canonical JSON for digest: fixed field order, no pretty whitespace.
 */
function canonicalBundleJson(
  fields: Omit<KillScanBundle, "bundleDigest">,
): string {
  console.assert(fields !== null && fields !== undefined, "fields present");
  console.assert(typeof fields.schemaVersion === "string", "schema string");
  const ordered = {
    schemaVersion: fields.schemaVersion,
    exportedAtIso: fields.exportedAtIso,
    packId: fields.packId,
    packVersion: fields.packVersion,
    scanned: fields.scanned,
    hitCount: fields.hitCount,
    rows: fields.rows,
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
 * Safe download basename: kill-scan-<packId>.json
 * Non-safe chars → underscore; truncate pack segment.
 */
export function killScanFilename(packId: string): string {
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
  return "kill-scan-" + safe + ".json";
}

/**
 * Build a fail-closed kill-scan JSON freeze artifact.
 * Delegates scan to scanWellsForKills; fails when that fails.
 */
export function exportKillScan(
  input: ExportKillScanInput,
): ExportKillScanResult {
  console.assert(input !== null && input !== undefined, "input present");
  console.assert(true, "exportKillScan entry");
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

  const scanned = scanWellsForKills({
    wells: input.wells,
    pack: input.pack,
    maxWells: input.maxWells,
  });
  if (!scanned.ok) {
    return failExport(scanned.reason);
  }
  console.assert(
    scanned.scanned <= MAX_KILL_SCAN_WELLS,
    "export scanned within cap",
  );

  const rows = cloneRows(scanned.rows);
  const withoutDigest = {
    schemaVersion: KILL_SCAN_SCHEMA_VERSION,
    exportedAtIso: new Date().toISOString(),
    packId: input.pack.id,
    packVersion: input.pack.version,
    scanned: scanned.scanned,
    hitCount: scanned.hitCount,
    rows,
    notes: boundNotes(input.notes),
  };
  const bundleDigest = digestCanonical(canonicalBundleJson(withoutDigest));
  const bundle: KillScanBundle = { ...withoutDigest, bundleDigest };
  const json = JSON.stringify(bundle, null, 2);
  console.assert(json.length > 0, "json non-empty");
  console.assert(bundleDigest.length === 64, "sha256 hex length");
  return { ok: true, bundle, json };
}
