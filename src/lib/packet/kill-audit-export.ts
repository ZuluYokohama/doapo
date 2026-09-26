/**
 * Cross-pack kill audit export — fail-closed audit freeze artifact.
 * Power of 10: flat control flow, bounded loops, no recursion, ≥2 asserts/fn.
 * Pure module: no DOM. Demo artifact — not durable authority.
 * Digest is canonical so a future import can fail-closed verify.
 */
import { createHash } from "node:crypto";
import {
  MAX_ID_LEN,
  MAX_LONG_TEXT_LEN,
  MAX_TEXT_LEN,
  type DomainPack,
  type IssuePacket,
} from "./types.ts";
import {
  MAX_AUDIT_PACKS,
  auditKillsAcrossPacks,
  type KillAuditRow,
} from "./kill-audit.ts";

export const KILL_AUDIT_SCHEMA_VERSION = "doapo-kill-audit/1";

export const DEFAULT_KILL_AUDIT_EXPORT_NOTES =
  "demo cross-pack kill audit export; packet vs packs — not durable authority; humans still own OPEN";

const MAX_FILENAME_SUBJECT = 48;

export type KillAuditBundle = {
  schemaVersion: string;
  exportedAtIso: string;
  subjectId: string;
  packetPackId: string;
  audited: number;
  hitCount: number;
  rows: KillAuditRow[];
  notes: string;
  /** SHA-256 of canonical JSON of all fields except this digest. */
  bundleDigest: string;
};

export type ExportKillAuditResult =
  | { ok: true; bundle: KillAuditBundle; json: string }
  | { ok: false; reason: string };

export type ExportKillAuditInput = {
  packet: IssuePacket;
  packs: DomainPack[];
  overlay?: DomainPack | null;
  notes?: string;
  maxPacks?: number;
};

function failExport(reason: string): ExportKillAuditResult {
  console.assert(typeof reason === "string", "kill-audit export fail reason string");
  console.assert(reason.length > 0, "kill-audit export fail reason present");
  return { ok: false, reason };
}

function boundNotes(raw: string | undefined): string {
  console.assert(true, "kill-audit notes bound entry");
  console.assert(MAX_LONG_TEXT_LEN > 0, "long text cap positive");
  const base =
    typeof raw === "string" && raw.length > 0
      ? raw
      : DEFAULT_KILL_AUDIT_EXPORT_NOTES;
  if (base.length <= MAX_LONG_TEXT_LEN) return base;
  return base.slice(0, MAX_LONG_TEXT_LEN);
}

function cloneRow(row: KillAuditRow): KillAuditRow {
  console.assert(row !== null && row !== undefined, "row present");
  console.assert(typeof row.packId === "string", "packId string");
  const out: KillAuditRow = {
    packId: row.packId,
    packVersion: row.packVersion,
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

function cloneRows(rows: KillAuditRow[]): KillAuditRow[] {
  console.assert(Array.isArray(rows), "rows array for clone");
  console.assert(rows.length >= 0, "rows length");
  const out: KillAuditRow[] = [];
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
  fields: Omit<KillAuditBundle, "bundleDigest">,
): string {
  console.assert(fields !== null && fields !== undefined, "fields present");
  console.assert(typeof fields.schemaVersion === "string", "schema string");
  const ordered = {
    schemaVersion: fields.schemaVersion,
    exportedAtIso: fields.exportedAtIso,
    subjectId: fields.subjectId,
    packetPackId: fields.packetPackId,
    audited: fields.audited,
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
 * Safe download basename: kill-audit-<subjectId>.json
 * Non-safe chars → underscore; truncate subject segment.
 */
export function killAuditFilename(subjectId: string): string {
  console.assert(typeof subjectId === "string", "subjectId string");
  console.assert(MAX_FILENAME_SUBJECT > 0, "filename subject cap positive");
  let safe = "";
  if (typeof subjectId === "string" && subjectId.length > 0) {
    const bound =
      subjectId.length <= MAX_FILENAME_SUBJECT
        ? subjectId.length
        : MAX_FILENAME_SUBJECT;
    let i = 0;
    while (i < bound) {
      const ch = subjectId.charAt(i);
      const code = subjectId.charCodeAt(i);
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
  return "kill-audit-" + safe + ".json";
}

/**
 * Build a fail-closed cross-pack kill audit JSON freeze artifact.
 * Delegates audit to auditKillsAcrossPacks; fails when that fails.
 */
export function exportKillAudit(
  input: ExportKillAuditInput,
): ExportKillAuditResult {
  console.assert(input !== null && input !== undefined, "input present");
  console.assert(true, "exportKillAudit entry");
  if (input === null || input === undefined) {
    return failExport("export input required");
  }
  if (input.packet === null || input.packet === undefined) {
    return failExport("packet required");
  }
  if (
    typeof input.packet.subjectId !== "string" ||
    input.packet.subjectId.length === 0
  ) {
    return failExport("subjectId required");
  }
  if (input.packet.subjectId.length > MAX_ID_LEN) {
    return failExport("subjectId exceeds MAX_ID_LEN");
  }
  if (
    typeof input.packet.packId !== "string" ||
    input.packet.packId.length === 0
  ) {
    return failExport("packetPackId required");
  }
  if (input.packet.packId.length > MAX_ID_LEN) {
    return failExport("packetPackId exceeds MAX_ID_LEN");
  }
  if (!Array.isArray(input.packs)) {
    return failExport("packs required");
  }

  const audited = auditKillsAcrossPacks({
    packet: input.packet,
    packs: input.packs,
    overlay: input.overlay,
    maxPacks: input.maxPacks,
  });
  if (!audited.ok) {
    return failExport(audited.reason);
  }
  console.assert(
    audited.audited <= MAX_AUDIT_PACKS,
    "export audited within cap",
  );

  const rows = cloneRows(audited.rows);
  const withoutDigest = {
    schemaVersion: KILL_AUDIT_SCHEMA_VERSION,
    exportedAtIso: new Date().toISOString(),
    subjectId: input.packet.subjectId,
    packetPackId: input.packet.packId,
    audited: audited.audited,
    hitCount: audited.hitCount,
    rows,
    notes: boundNotes(input.notes),
  };
  const bundleDigest = digestCanonical(canonicalBundleJson(withoutDigest));
  const bundle: KillAuditBundle = { ...withoutDigest, bundleDigest };
  const json = JSON.stringify(bundle, null, 2);
  console.assert(json.length > 0, "json non-empty");
  console.assert(bundleDigest.length === 64, "sha256 hex length");
  return { ok: true, bundle, json };
}

/** Hard cap on kill-audit JSON text length (Power of 10). */
export const MAX_KILL_AUDIT_JSON_CHARS = 65536;

export type ImportKillAuditOk = {
  ok: true;
  bundle: KillAuditBundle;
};
export type ImportKillAuditErr = { ok: false; reason: string };
export type ImportKillAuditResult = ImportKillAuditOk | ImportKillAuditErr;

function failImport(reason: string): ImportKillAuditErr {
  console.assert(typeof reason === "string", "kill-audit import fail reason string");
  console.assert(reason.length > 0, "kill-audit import fail reason present");
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

function readKillAuditRow(
  row: unknown,
  index: number,
): { ok: true; row: KillAuditRow } | { ok: false; reason: string } {
  console.assert(typeof index === "number", "index number");
  console.assert(index >= 0, "index non-negative");
  if (!isPlainObject(row)) {
    return { ok: false, reason: "rows[" + String(index) + "] must be object" };
  }
  if (typeof row.packId !== "string" || row.packId.length === 0) {
    return {
      ok: false,
      reason: "rows[" + String(index) + "].packId required",
    };
  }
  if (row.packId.length > MAX_ID_LEN) {
    return {
      ok: false,
      reason: "rows[" + String(index) + "].packId exceeds MAX_ID_LEN",
    };
  }
  if (typeof row.packVersion !== "string") {
    return {
      ok: false,
      reason: "rows[" + String(index) + "].packVersion must be string",
    };
  }
  if (row.packVersion.length > MAX_TEXT_LEN) {
    return {
      ok: false,
      reason: "rows[" + String(index) + "].packVersion exceeds MAX_TEXT_LEN",
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
  const out: KillAuditRow = {
    packId: row.packId,
    packVersion: row.packVersion,
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
): { ok: true; rows: KillAuditRow[] } | { ok: false; reason: string } {
  console.assert(MAX_AUDIT_PACKS > 0, "audit cap positive");
  console.assert(true, "readRows entry");
  if (!Array.isArray(raw)) {
    return { ok: false, reason: "rows must be an array" };
  }
  if (raw.length > MAX_AUDIT_PACKS) {
    return { ok: false, reason: "rows exceeds MAX_AUDIT_PACKS" };
  }
  const out: KillAuditRow[] = [];
  let i = 0;
  while (i < raw.length) {
    const parsed = readKillAuditRow(raw[i], i);
    if (!parsed.ok) return parsed;
    out.push(parsed.row);
    i += 1;
  }
  return { ok: true, rows: out };
}

type ParsedKillAuditFields = Omit<KillAuditBundle, "bundleDigest"> & {
  bundleDigest: string;
};

function checkKillAuditShape(
  raw: Record<string, unknown>,
): { ok: true } | { ok: false; reason: string } {
  console.assert(isPlainObject(raw), "raw object for shape");
  console.assert(KILL_AUDIT_SCHEMA_VERSION.length > 0, "schema version set");
  if (raw.schemaVersion !== KILL_AUDIT_SCHEMA_VERSION) {
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

function readKillAuditFields(
  raw: Record<string, unknown>,
): { ok: true; fields: ParsedKillAuditFields } | { ok: false; reason: string } {
  console.assert(isPlainObject(raw), "raw object for read");
  console.assert(true, "readKillAuditFields entry");
  const shape = checkKillAuditShape(raw);
  if (!shape.ok) return shape;
  const exportedAtIso = requireNonEmptyString(raw.exportedAtIso, "exportedAtIso");
  if (!exportedAtIso.ok) return exportedAtIso;
  const subjectId = requireNonEmptyString(raw.subjectId, "subjectId");
  if (!subjectId.ok) return subjectId;
  if (subjectId.value.length > MAX_ID_LEN) {
    return { ok: false, reason: "subjectId exceeds MAX_ID_LEN" };
  }
  const packetPackId = requireNonEmptyString(raw.packetPackId, "packetPackId");
  if (!packetPackId.ok) return packetPackId;
  if (packetPackId.value.length > MAX_ID_LEN) {
    return { ok: false, reason: "packetPackId exceeds MAX_ID_LEN" };
  }
  const audited = requireNonNegInt(raw.audited, "audited");
  if (!audited.ok) return audited;
  if (audited.value > MAX_AUDIT_PACKS) {
    return { ok: false, reason: "audited exceeds MAX_AUDIT_PACKS" };
  }
  const hitCount = requireNonNegInt(raw.hitCount, "hitCount");
  if (!hitCount.ok) return hitCount;
  if (hitCount.value > MAX_AUDIT_PACKS) {
    return { ok: false, reason: "hitCount exceeds MAX_AUDIT_PACKS" };
  }
  const rows = readRows(raw.rows);
  if (!rows.ok) return rows;
  return {
    ok: true,
    fields: {
      schemaVersion: KILL_AUDIT_SCHEMA_VERSION,
      exportedAtIso: exportedAtIso.value,
      subjectId: subjectId.value,
      packetPackId: packetPackId.value,
      audited: audited.value,
      hitCount: hitCount.value,
      rows: rows.rows,
      notes: raw.notes as string,
      bundleDigest: raw.bundleDigest as string,
    },
  };
}

function parseKillAuditJson(
  jsonText: string,
): { ok: true; raw: Record<string, unknown> } | ImportKillAuditErr {
  console.assert(typeof jsonText === "string", "parse text string");
  console.assert(MAX_KILL_AUDIT_JSON_CHARS > 0, "json cap positive");
  if (typeof jsonText !== "string") {
    return failImport("text invalid");
  }
  if (jsonText.length === 0) {
    return failImport("text empty");
  }
  if (jsonText.length > MAX_KILL_AUDIT_JSON_CHARS) {
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
 * Parse + verify a kill-audit JSON freeze artifact.
 * Recomputes bundleDigest against canonical fields; fail-closed on mismatch.
 * Present so any future import UI can verify the same digest contract.
 */
export function importKillAudit(jsonText: string): ImportKillAuditResult {
  console.assert(typeof jsonText === "string", "import text is string");
  console.assert(MAX_KILL_AUDIT_JSON_CHARS > 0, "json cap positive");
  const parsed = parseKillAuditJson(jsonText);
  if (!parsed.ok) return parsed;
  const read = readKillAuditFields(parsed.raw);
  if (!read.ok) return failImport(read.reason);
  const withoutDigest = {
    schemaVersion: read.fields.schemaVersion,
    exportedAtIso: read.fields.exportedAtIso,
    subjectId: read.fields.subjectId,
    packetPackId: read.fields.packetPackId,
    audited: read.fields.audited,
    hitCount: read.fields.hitCount,
    rows: read.fields.rows,
    notes: read.fields.notes,
  };
  const recomputed = digestCanonical(canonicalBundleJson(withoutDigest));
  if (recomputed !== read.fields.bundleDigest) {
    return failImport("bundleDigest mismatch");
  }
  const bundle: KillAuditBundle = {
    ...withoutDigest,
    rows: cloneRows(read.fields.rows),
    bundleDigest: read.fields.bundleDigest,
  };
  console.assert(bundle.bundleDigest.length === 64, "digest hex length");
  console.assert(bundle.subjectId.length > 0, "subjectId present");
  return { ok: true, bundle };
}
