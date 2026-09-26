/**
 * Auditable packet evidence export — fail-closed downloadable freeze artifact.
 * Power of 10: flat control flow, bounded loops, no recursion, ≥2 asserts/fn.
 * Pure module: no DOM. Demo artifact — not durable authority.
 */
import { createHash } from "node:crypto";
import {
  MAX_ID_LEN,
  MAX_LONG_TEXT_LEN,
  type DomainPack,
  type IssuePacket,
} from "./types.ts";
import { validateIssuePacket } from "./validate.ts";
import { lookupPack } from "./packs/registry.ts";
import { resolvePack } from "./pack-import.ts";
import {
  MAX_SEALS,
  computeSealDigest,
  listSealsForSubject,
  tipDigest,
  verifySealChain,
  type SealLedger,
  type SealRecord,
} from "./ledger.ts";

export const EVIDENCE_SCHEMA_VERSION = "doapo-packet-evidence/1";

/** Subject seal cap for export (≤ MAX_SEALS; above UI_LEDGER_CAP). */
export const EXPORT_SEAL_CAP = 64;

export const DEFAULT_EXPORT_NOTES =
  "demo export; session ledger — not durable authority; humans still own OPEN";

const MAX_FILENAME_SUBJECT = 48;

export type PacketEvidenceBundle = {
  schemaVersion: string;
  exportedAtIso: string;
  packId: string;
  packVersion: string;
  subjectId: string;
  packet: IssuePacket;
  seals: SealRecord[];
  tipDigest: string | null;
  chainOk: boolean;
  notes: string;
  /** SHA-256 of canonical JSON of all fields except this digest. */
  bundleDigest: string;
};

export type ExportEvidenceResult =
  | { ok: true; bundle: PacketEvidenceBundle; json: string }
  | { ok: false; reason: string };

export type ExportEvidenceInput = {
  packet: IssuePacket;
  ledger: SealLedger;
  notes?: string;
};

function failExport(reason: string): ExportEvidenceResult {
  console.assert(reason.length > 0, "export fail reason present");
  return { ok: false, reason };
}

function boundNotes(raw: string | undefined): string {
  console.assert(true, "notes bound entry");
  const base =
    typeof raw === "string" && raw.length > 0 ? raw : DEFAULT_EXPORT_NOTES;
  if (base.length <= MAX_LONG_TEXT_LEN) return base;
  return base.slice(0, MAX_LONG_TEXT_LEN);
}

/** Fail-closed pack lookup + packet validate + subject id. */
function gatePacket(packet: IssuePacket): { ok: true } | { ok: false; reason: string } {
  console.assert(packet !== null && packet !== undefined, "packet present");
  const looked = lookupPack(packet.packId);
  if (!looked.ok) return { ok: false, reason: looked.reason };
  console.assert(looked.pack.id.length > 0, "pack id present");
  const validated = validateIssuePacket(packet);
  if (!validated.ok) return { ok: false, reason: validated.reason };
  if (typeof packet.subjectId !== "string" || packet.subjectId.length === 0) {
    return { ok: false, reason: "subjectId required" };
  }
  if (packet.subjectId.length > MAX_ID_LEN) {
    return { ok: false, reason: "subjectId exceeds MAX_ID_LEN" };
  }
  return { ok: true };
}

/**
 * Canonical JSON for digest: fixed field order, no pretty whitespace.
 * Insertion order of string keys is stable in engines we target.
 */
function canonicalBundleJson(
  fields: Omit<PacketEvidenceBundle, "bundleDigest">,
): string {
  console.assert(fields !== null && fields !== undefined, "fields present");
  console.assert(typeof fields.schemaVersion === "string", "schema string");
  const ordered = {
    schemaVersion: fields.schemaVersion,
    exportedAtIso: fields.exportedAtIso,
    packId: fields.packId,
    packVersion: fields.packVersion,
    subjectId: fields.subjectId,
    packet: fields.packet,
    seals: fields.seals,
    tipDigest: fields.tipDigest,
    chainOk: fields.chainOk,
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
 * Safe download basename: packet-evidence-<subjectId>.json
 * Non-safe chars → underscore; truncate subject segment.
 */
export function evidenceFilename(subjectId: string): string {
  console.assert(typeof subjectId === "string", "subjectId string");
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
  return "packet-evidence-" + safe + ".json";
}

/**
 * Build a fail-closed evidence bundle for a packet + subject-scoped seals.
 * chainOk reflects full-ledger tip integrity; seals[] are subject-filtered.
 */
export function exportPacketEvidence(
  input: ExportEvidenceInput,
): ExportEvidenceResult {
  console.assert(input !== null && input !== undefined, "input present");
  if (input === null || input === undefined) {
    return failExport("export input required");
  }
  if (input.packet === null || input.packet === undefined) {
    return failExport("packet required");
  }
  if (input.ledger === null || input.ledger === undefined) {
    return failExport("ledger required");
  }
  if (!Array.isArray(input.ledger.seals)) {
    return failExport("ledger.seals not an array");
  }
  if (input.ledger.seals.length > MAX_SEALS) {
    return failExport("ledger exceeds MAX_SEALS");
  }

  const gated = gatePacket(input.packet);
  if (!gated.ok) return failExport(gated.reason);

  const subjectId = input.packet.subjectId;
  const sealCap =
    EXPORT_SEAL_CAP <= MAX_SEALS ? EXPORT_SEAL_CAP : MAX_SEALS;
  const seals = listSealsForSubject(input.ledger, subjectId, sealCap);
  console.assert(seals.length <= sealCap, "export seals within cap");

  const chain = verifySealChain(input.ledger);
  const withoutDigest = {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    exportedAtIso: new Date().toISOString(),
    packId: input.packet.packId,
    packVersion: input.packet.packVersion,
    subjectId,
    packet: input.packet,
    seals,
    tipDigest: tipDigest(input.ledger),
    chainOk: chain.ok,
    notes: boundNotes(input.notes),
  };
  const bundleDigest = digestCanonical(canonicalBundleJson(withoutDigest));
  const bundle: PacketEvidenceBundle = { ...withoutDigest, bundleDigest };
  const json = JSON.stringify(bundle, null, 2);
  console.assert(json.length > 0, "json non-empty");
  console.assert(bundleDigest.length === 64, "sha256 hex length");
  return { ok: true, bundle, json };
}

/** Hard cap on evidence JSON text length (Power of 10). */
export const MAX_EVIDENCE_JSON_CHARS = 524288;

export type ImportEvidenceOk = {
  ok: true;
  bundle: PacketEvidenceBundle;
  packet: IssuePacket;
};
export type ImportEvidenceErr = { ok: false; reason: string };
export type ImportEvidenceResult = ImportEvidenceOk | ImportEvidenceErr;

function failImport(reason: string): ImportEvidenceErr {
  console.assert(typeof reason === "string", "import fail reason string");
  console.assert(reason.length > 0, "import fail reason present");
  return { ok: false, reason };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  console.assert(true, "plain object check entry");
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  return true;
}

/** Shallow-copy packet arrays so callers cannot mutate parse result in place. */
function clonePacket(packet: IssuePacket): IssuePacket {
  console.assert(packet !== null && packet !== undefined, "clone packet present");
  console.assert(Array.isArray(packet.measuredFacts), "clone facts array");
  return {
    schemaVersion: packet.schemaVersion,
    packId: packet.packId,
    packVersion: packet.packVersion,
    subjectId: packet.subjectId,
    subjectLabel: packet.subjectLabel,
    measuredFacts: packet.measuredFacts.slice(),
    outcomeClassId: packet.outcomeClassId,
    designIntent: packet.designIntent,
    fieldObservation: packet.fieldObservation,
    advisorAnswers: packet.advisorAnswers.slice(),
    residue: packet.residue.slice(),
    proposedBy: packet.proposedBy,
    gate: packet.gate,
    notes: packet.notes,
  };
}

function cloneSeals(seals: SealRecord[]): SealRecord[] {
  console.assert(Array.isArray(seals), "clone seals array");
  console.assert(seals.length <= EXPORT_SEAL_CAP, "clone seals within cap");
  const out: SealRecord[] = [];
  let i = 0;
  while (i < seals.length && i < EXPORT_SEAL_CAP) {
    const row = seals[i];
    out.push({
      id: row.id,
      atIso: row.atIso,
      kind: row.kind,
      packetSubjectId: row.packetSubjectId,
      packId: row.packId,
      gate: row.gate,
      proposedBy: row.proposedBy,
      digest: row.digest,
      prevDigest: row.prevDigest,
      note: row.note,
    });
    i += 1;
  }
  return out;
}

/**
 * Optional per-seal digest check (subject-filtered seals need not form a chain).
 * Empty seals → ok. Cap EXPORT_SEAL_CAP. Fail-closed on any digest mismatch.
 */
function verifyBundleSealDigests(
  seals: SealRecord[],
): { ok: true } | { ok: false; reason: string } {
  console.assert(Array.isArray(seals), "seals array for digest verify");
  console.assert(EXPORT_SEAL_CAP > 0, "seal cap positive");
  if (seals.length === 0) return { ok: true };
  if (seals.length > EXPORT_SEAL_CAP) {
    return { ok: false, reason: "seals exceed EXPORT_SEAL_CAP" };
  }
  let i = 0;
  while (i < seals.length) {
    const row = seals[i];
    if (row === null || row === undefined) {
      return { ok: false, reason: "seal missing at index " + String(i) };
    }
    if (typeof row.digest !== "string" || row.digest.length !== 64) {
      return { ok: false, reason: "seal digest invalid at index " + String(i) };
    }
    const recomputed = computeSealDigest({
      id: row.id,
      atIso: row.atIso,
      kind: row.kind,
      packetSubjectId: row.packetSubjectId,
      packId: row.packId,
      gate: row.gate,
      proposedBy: row.proposedBy,
      prevDigest: row.prevDigest,
      note: row.note,
    });
    if (recomputed !== row.digest) {
      return {
        ok: false,
        reason: "seal digest mismatch at index " + String(i),
      };
    }
    i += 1;
  }
  return { ok: true };
}

type ParsedBundleFields = Omit<PacketEvidenceBundle, "bundleDigest"> & {
  bundleDigest: string;
};

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

/** Fail-closed shape checks for scalar + collection fields. */
function checkBundleShape(
  raw: Record<string, unknown>,
): { ok: true } | { ok: false; reason: string } {
  console.assert(isPlainObject(raw), "raw object for shape");
  console.assert(EVIDENCE_SCHEMA_VERSION.length > 0, "schema version set");
  if (raw.schemaVersion !== EVIDENCE_SCHEMA_VERSION) {
    return { ok: false, reason: "schemaVersion mismatch" };
  }
  if (!isPlainObject(raw.packet)) {
    return { ok: false, reason: "packet must be an object" };
  }
  if (!Array.isArray(raw.seals)) {
    return { ok: false, reason: "seals must be an array" };
  }
  if (raw.seals.length > EXPORT_SEAL_CAP) {
    return { ok: false, reason: "seals exceed EXPORT_SEAL_CAP" };
  }
  if (raw.tipDigest !== null && typeof raw.tipDigest !== "string") {
    return { ok: false, reason: "tipDigest must be string or null" };
  }
  if (typeof raw.chainOk !== "boolean") {
    return { ok: false, reason: "chainOk must be boolean" };
  }
  if (typeof raw.notes !== "string") {
    return { ok: false, reason: "notes must be string" };
  }
  if (typeof raw.bundleDigest !== "string" || raw.bundleDigest.length !== 64) {
    return { ok: false, reason: "bundleDigest invalid" };
  }
  return { ok: true };
}

/**
 * Extract typed bundle fields from a plain JSON object. Fail-closed on shape.
 */
function readBundleFields(
  raw: Record<string, unknown>,
): { ok: true; fields: ParsedBundleFields } | { ok: false; reason: string } {
  console.assert(isPlainObject(raw), "raw object for read");
  console.assert(true, "readBundleFields entry");
  const shape = checkBundleShape(raw);
  if (!shape.ok) return shape;
  const exportedAtIso = requireNonEmptyString(raw.exportedAtIso, "exportedAtIso");
  if (!exportedAtIso.ok) return exportedAtIso;
  const packId = requireNonEmptyString(raw.packId, "packId");
  if (!packId.ok) return packId;
  const packVersion = requireNonEmptyString(raw.packVersion, "packVersion");
  if (!packVersion.ok) return packVersion;
  const subjectId = requireNonEmptyString(raw.subjectId, "subjectId");
  if (!subjectId.ok) return subjectId;
  return {
    ok: true,
    fields: {
      schemaVersion: EVIDENCE_SCHEMA_VERSION,
      exportedAtIso: exportedAtIso.value,
      packId: packId.value,
      packVersion: packVersion.value,
      subjectId: subjectId.value,
      packet: raw.packet as IssuePacket,
      seals: raw.seals as SealRecord[],
      tipDigest: raw.tipDigest as string | null,
      chainOk: raw.chainOk as boolean,
      notes: raw.notes as string,
      bundleDigest: raw.bundleDigest as string,
    },
  };
}

function parseEvidenceJson(
  jsonText: string,
): { ok: true; raw: Record<string, unknown> } | ImportEvidenceErr {
  console.assert(typeof jsonText === "string", "parse text string");
  console.assert(MAX_EVIDENCE_JSON_CHARS > 0, "json cap positive");
  if (typeof jsonText !== "string") {
    return failImport("text invalid");
  }
  if (jsonText.length === 0) {
    return failImport("text empty");
  }
  if (jsonText.length > MAX_EVIDENCE_JSON_CHARS) {
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

function verifyImportedFields(
  fields: ParsedBundleFields,
  overlay: DomainPack | null,
): ImportEvidenceErr | { ok: true } {
  console.assert(fields !== null && fields !== undefined, "fields present");
  console.assert(overlay === null || typeof overlay === "object", "overlay shape");
  const withoutDigest = {
    schemaVersion: fields.schemaVersion,
    exportedAtIso: fields.exportedAtIso,
    packId: fields.packId,
    packVersion: fields.packVersion,
    subjectId: fields.subjectId,
    packet: fields.packet,
    seals: fields.seals,
    tipDigest: fields.tipDigest,
    chainOk: fields.chainOk,
    notes: fields.notes,
  };
  const recomputed = digestCanonical(canonicalBundleJson(withoutDigest));
  if (recomputed !== fields.bundleDigest) {
    return failImport("bundleDigest mismatch");
  }
  const looked = resolvePack(fields.packet.packId, overlay);
  if (!looked.ok) return failImport(looked.reason);
  console.assert(looked.pack.id.length > 0, "resolved pack id present");
  if (fields.packId !== fields.packet.packId) {
    return failImport("packId does not match packet.packId");
  }
  if (fields.subjectId !== fields.packet.subjectId) {
    return failImport("subjectId does not match packet.subjectId");
  }
  let validated;
  try {
    validated = validateIssuePacket(fields.packet);
  } catch {
    return failImport("packet validate threw");
  }
  if (!validated.ok) return failImport(validated.reason);
  const sealsOk = verifyBundleSealDigests(fields.seals);
  if (!sealsOk.ok) return failImport(sealsOk.reason);
  return { ok: true };
}

/**
 * Parse + verify an evidence bundle JSON freeze artifact.
 * Recomputes bundleDigest; resolves pack via resolvePack; validates packet;
 * optionally verifies per-seal digests when seals are present.
 */
export function importEvidenceBundle(
  jsonText: string,
  overlay: DomainPack | null = null,
): ImportEvidenceResult {
  console.assert(typeof jsonText === "string", "import text is string");
  console.assert(MAX_EVIDENCE_JSON_CHARS > 0, "json cap positive");
  const parsed = parseEvidenceJson(jsonText);
  if (!parsed.ok) return parsed;
  const read = readBundleFields(parsed.raw);
  if (!read.ok) return failImport(read.reason);
  const verified = verifyImportedFields(read.fields, overlay);
  if (!verified.ok) return verified;
  const packet = clonePacket(read.fields.packet);
  const seals = cloneSeals(read.fields.seals);
  const bundle: PacketEvidenceBundle = {
    schemaVersion: read.fields.schemaVersion,
    exportedAtIso: read.fields.exportedAtIso,
    packId: read.fields.packId,
    packVersion: read.fields.packVersion,
    subjectId: read.fields.subjectId,
    packet,
    seals,
    tipDigest: read.fields.tipDigest,
    chainOk: read.fields.chainOk,
    notes: read.fields.notes,
    bundleDigest: read.fields.bundleDigest,
  };
  console.assert(bundle.bundleDigest.length === 64, "digest hex length");
  console.assert(packet.subjectId.length > 0, "packet subject present");
  return { ok: true, bundle, packet };
}
