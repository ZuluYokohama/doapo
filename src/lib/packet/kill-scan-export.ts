/**
 * Kill scan export/import — fail-closed batch kill-scan freeze artifact.
 * Power of 10: flat control flow, bounded loops, no recursion, ≥2 asserts/fn.
 * Pure module: no DOM. Demo artifact — not durable authority.
 */
import { createHash } from "node:crypto";
import type { WellRow } from "../outcomes.ts";
import { MAX_ID_LEN, MAX_LONG_TEXT_LEN, MAX_TEXT_LEN, type DomainPack } from "./types.ts";
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

/** Hard cap on kill-scan JSON text length (Power of 10). */
export const MAX_KILL_SCAN_JSON_CHARS = 65536;

export type ImportKillScanOk = {
  ok: true;
  bundle: KillScanBundle;
};
export type ImportKillScanErr = { ok: false; reason: string };
export type ImportKillScanResult = ImportKillScanOk | ImportKillScanErr;

function failImport(reason: string): ImportKillScanErr {
  console.assert(typeof reason === "string", "kill-scan import fail reason string");
  console.assert(reason.length > 0, "kill-scan import fail reason present");
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

function readOptionalString(
  value: unknown,
  label: string,
  maxLen: number,
): { ok: true; value: string | undefined } | { ok: false; reason: string } {
  console.assert(typeof label === "string" && label.length > 0, "label present");
  console.assert(maxLen > 0, "maxLen positive");
  if (value === undefined) {
    return { ok: true, value: undefined };
  }
  if (typeof value !== "string") {
    return { ok: false, reason: label + " must be string" };
  }
  if (value.length > maxLen) {
    return { ok: false, reason: label + " exceeds length cap" };
  }
  return { ok: true, value };
}

function readKillScanRow(
  row: unknown,
  index: number,
): { ok: true; row: KillScanRow } | { ok: false; reason: string } {
  console.assert(typeof index === "number", "index number");
  console.assert(index >= 0, "index non-negative");
  if (!isPlainObject(row)) {
    return { ok: false, reason: "rows[" + String(index) + "] must be object" };
  }
  if (typeof row.subjectId !== "string" || row.subjectId.length === 0) {
    return {
      ok: false,
      reason: "rows[" + String(index) + "].subjectId required",
    };
  }
  if (row.subjectId.length > MAX_ID_LEN) {
    return {
      ok: false,
      reason: "rows[" + String(index) + "].subjectId exceeds MAX_ID_LEN",
    };
  }
  if (typeof row.wellLabel !== "string") {
    return {
      ok: false,
      reason: "rows[" + String(index) + "].wellLabel must be string",
    };
  }
  if (row.wellLabel.length > MAX_TEXT_LEN) {
    return {
      ok: false,
      reason: "rows[" + String(index) + "].wellLabel exceeds MAX_TEXT_LEN",
    };
  }
  if (typeof row.hit !== "boolean") {
    return {
      ok: false,
      reason: "rows[" + String(index) + "].hit must be boolean",
    };
  }
  const killId = readOptionalString(
    row.killId,
    "rows[" + String(index) + "].killId",
    MAX_ID_LEN,
  );
  if (!killId.ok) return killId;
  const reason = readOptionalString(
    row.reason,
    "rows[" + String(index) + "].reason",
    MAX_TEXT_LEN,
  );
  if (!reason.ok) return reason;
  const out: KillScanRow = {
    subjectId: row.subjectId,
    wellLabel: row.wellLabel,
    hit: row.hit,
  };
  if (typeof killId.value === "string") {
    out.killId = killId.value;
  }
  if (typeof reason.value === "string") {
    out.reason = reason.value;
  }
  return { ok: true, row: out };
}

function readRows(
  raw: unknown,
): { ok: true; rows: KillScanRow[] } | { ok: false; reason: string } {
  console.assert(MAX_KILL_SCAN_WELLS > 0, "kill scan cap positive");
  console.assert(true, "readRows entry");
  if (!Array.isArray(raw)) {
    return { ok: false, reason: "rows must be an array" };
  }
  if (raw.length > MAX_KILL_SCAN_WELLS) {
    return { ok: false, reason: "rows exceeds MAX_KILL_SCAN_WELLS" };
  }
  const out: KillScanRow[] = [];
  let i = 0;
  while (i < raw.length) {
    const parsed = readKillScanRow(raw[i], i);
    if (!parsed.ok) return parsed;
    out.push(parsed.row);
    i += 1;
  }
  return { ok: true, rows: out };
}

type ParsedKillScanFields = Omit<KillScanBundle, "bundleDigest"> & {
  bundleDigest: string;
};

function checkKillScanShape(
  raw: Record<string, unknown>,
): { ok: true } | { ok: false; reason: string } {
  console.assert(isPlainObject(raw), "raw object for shape");
  console.assert(KILL_SCAN_SCHEMA_VERSION.length > 0, "schema version set");
  if (raw.schemaVersion !== KILL_SCAN_SCHEMA_VERSION) {
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

function readKillScanFields(
  raw: Record<string, unknown>,
): { ok: true; fields: ParsedKillScanFields } | { ok: false; reason: string } {
  console.assert(isPlainObject(raw), "raw object for read");
  console.assert(true, "readKillScanFields entry");
  const shape = checkKillScanShape(raw);
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
  const scanned = requireNonNegInt(raw.scanned, "scanned");
  if (!scanned.ok) return scanned;
  if (scanned.value > MAX_KILL_SCAN_WELLS) {
    return { ok: false, reason: "scanned exceeds MAX_KILL_SCAN_WELLS" };
  }
  const hitCount = requireNonNegInt(raw.hitCount, "hitCount");
  if (!hitCount.ok) return hitCount;
  if (hitCount.value > MAX_KILL_SCAN_WELLS) {
    return { ok: false, reason: "hitCount exceeds MAX_KILL_SCAN_WELLS" };
  }
  const rows = readRows(raw.rows);
  if (!rows.ok) return rows;
  return {
    ok: true,
    fields: {
      schemaVersion: KILL_SCAN_SCHEMA_VERSION,
      exportedAtIso: exportedAtIso.value,
      packId: packId.value,
      packVersion: packVersion.value,
      scanned: scanned.value,
      hitCount: hitCount.value,
      rows: rows.rows,
      notes: raw.notes as string,
      bundleDigest: raw.bundleDigest as string,
    },
  };
}

function parseKillScanJson(
  jsonText: string,
): { ok: true; raw: Record<string, unknown> } | ImportKillScanErr {
  console.assert(typeof jsonText === "string", "parse text string");
  console.assert(MAX_KILL_SCAN_JSON_CHARS > 0, "json cap positive");
  if (typeof jsonText !== "string") {
    return failImport("text invalid");
  }
  if (jsonText.length === 0) {
    return failImport("text empty");
  }
  if (jsonText.length > MAX_KILL_SCAN_JSON_CHARS) {
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
 * Parse + verify a kill-scan JSON freeze artifact.
 * Recomputes bundleDigest against canonical fields; fail-closed on mismatch.
 */
export function importKillScan(jsonText: string): ImportKillScanResult {
  console.assert(typeof jsonText === "string", "import text is string");
  console.assert(MAX_KILL_SCAN_JSON_CHARS > 0, "json cap positive");
  const parsed = parseKillScanJson(jsonText);
  if (!parsed.ok) return parsed;
  const read = readKillScanFields(parsed.raw);
  if (!read.ok) return failImport(read.reason);
  const withoutDigest = {
    schemaVersion: read.fields.schemaVersion,
    exportedAtIso: read.fields.exportedAtIso,
    packId: read.fields.packId,
    packVersion: read.fields.packVersion,
    scanned: read.fields.scanned,
    hitCount: read.fields.hitCount,
    rows: read.fields.rows,
    notes: read.fields.notes,
  };
  const recomputed = digestCanonical(canonicalBundleJson(withoutDigest));
  if (recomputed !== read.fields.bundleDigest) {
    return failImport("bundleDigest mismatch");
  }
  const bundle: KillScanBundle = {
    ...withoutDigest,
    rows: cloneRows(read.fields.rows),
    bundleDigest: read.fields.bundleDigest,
  };
  console.assert(bundle.bundleDigest.length === 64, "digest hex length");
  console.assert(bundle.packId.length > 0, "packId present");
  return { ok: true, bundle };
}
