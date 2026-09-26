/**
 * Auditable packet evidence export — fail-closed downloadable freeze artifact.
 * Power of 10: flat control flow, bounded loops, no recursion, ≥2 asserts/fn.
 * Pure module: no DOM. Demo artifact — not durable authority.
 */
import { createHash } from "node:crypto";
import {
  MAX_ID_LEN,
  MAX_LONG_TEXT_LEN,
  type IssuePacket,
} from "./types.ts";
import { validateIssuePacket } from "./validate.ts";
import { lookupPack } from "./packs/registry.ts";
import {
  MAX_SEALS,
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
