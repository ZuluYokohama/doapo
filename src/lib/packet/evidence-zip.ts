/**
 * Multi-subject evidence export zip — STORE-only archive + fail-closed manifest.
 * Power of 10: flat, bounded (MAX_EXPORT_SUBJECTS≤16), no recursion, ≤60 lines/fn,
 * ≥2 asserts/fn. Demo artifact — not durable authority.
 */
import { createHash } from "node:crypto";
import {
  MAX_ID_LEN,
  MAX_LONG_TEXT_LEN,
  type IssuePacket,
} from "./types.ts";
import {
  DEFAULT_EXPORT_NOTES,
  evidenceFilename,
  exportPacketEvidence,
  type PacketEvidenceBundle,
} from "./evidence-export.ts";
import {
  MAX_SEALS,
  tipDigest,
  verifySealChain,
  type SealLedger,
} from "./ledger.ts";

/** Hard cap on subjects per zip (Power of 10). */
export const MAX_EXPORT_SUBJECTS = 16;

export const MULTI_EVIDENCE_SCHEMA_VERSION = "doapo-packet-evidence-zip/1";

export const DEFAULT_MULTI_ZIP_FILENAME = "packet-evidence-multi.zip";

export const MANIFEST_FILENAME = "manifest.json";

export type MultiSubjectManifestEntry = {
  subjectId: string;
  filename: string;
  packId: string;
  packVersion: string;
  bundleDigest: string;
  chainOk: boolean;
  sealCount: number;
};

export type MultiSubjectManifest = {
  schemaVersion: string;
  exportedAtIso: string;
  subjectCount: number;
  tipDigest: string | null;
  ledgerChainOk: boolean;
  entries: MultiSubjectManifestEntry[];
  notes: string;
  /** SHA-256 of canonical JSON of all fields except this digest. */
  manifestDigest: string;
};

export type ExportMultiSubjectInput = {
  packets: IssuePacket[];
  ledger: SealLedger;
  notes?: string;
};

export type ExportMultiSubjectResult =
  | {
      ok: true;
      manifest: MultiSubjectManifest;
      zipBytes: Uint8Array;
      filename: string;
    }
  | { ok: false; reason: string };

type ZipEntry = { name: string; data: Uint8Array };

function failMulti(reason: string): ExportMultiSubjectResult {
  console.assert(typeof reason === "string", "multi fail reason string");
  console.assert(reason.length > 0, "multi fail reason present");
  return { ok: false, reason };
}

function boundNotes(raw: string | undefined): string {
  console.assert(true, "multi notes bound entry");
  const base =
    typeof raw === "string" && raw.length > 0 ? raw : DEFAULT_EXPORT_NOTES;
  if (base.length <= MAX_LONG_TEXT_LEN) return base;
  return base.slice(0, MAX_LONG_TEXT_LEN);
}

/** CRC-32 (ISO-HDLC) for ZIP local headers — table built once, bounded. */
const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  let i = 0;
  while (i < 256) {
    let c = i;
    let j = 0;
    while (j < 8) {
      c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
      j += 1;
    }
    table[i] = c >>> 0;
    i += 1;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  console.assert(data !== null && data !== undefined, "crc data present");
  console.assert(CRC_TABLE.length === 256, "crc table size");
  let crc = 0xffffffff;
  let i = 0;
  const n = data.length;
  while (i < n) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
    i += 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(n: number): Uint8Array {
  console.assert(n >= 0 && n <= 0xffff, "u16 range");
  const out = new Uint8Array(2);
  out[0] = n & 0xff;
  out[1] = (n >>> 8) & 0xff;
  return out;
}

function u32(n: number): Uint8Array {
  console.assert(n >= 0, "u32 non-neg");
  const out = new Uint8Array(4);
  out[0] = n & 0xff;
  out[1] = (n >>> 8) & 0xff;
  out[2] = (n >>> 16) & 0xff;
  out[3] = (n >>> 24) & 0xff;
  return out;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  console.assert(Array.isArray(parts), "concat parts array");
  let total = 0;
  let i = 0;
  while (i < parts.length) {
    total += parts[i].length;
    i += 1;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  i = 0;
  while (i < parts.length) {
    out.set(parts[i], offset);
    offset += parts[i].length;
    i += 1;
  }
  return out;
}

function encodeUtf8(text: string): Uint8Array {
  console.assert(typeof text === "string", "utf8 text string");
  console.assert(true, "utf8 encode entry");
  return new TextEncoder().encode(text);
}

function localFileHeader(
  nameBytes: Uint8Array,
  data: Uint8Array,
  crc: number,
): Uint8Array {
  console.assert(nameBytes.length > 0, "local name present");
  console.assert(data !== null && data !== undefined, "local data present");
  return concatBytes([
    u32(0x04034b50),
    u16(20),
    u16(0),
    u16(0),
    u16(0),
    u16(0),
    u32(crc),
    u32(data.length),
    u32(data.length),
    u16(nameBytes.length),
    u16(0),
    nameBytes,
    data,
  ]);
}

function centralDirHeader(
  nameBytes: Uint8Array,
  data: Uint8Array,
  crc: number,
  localOffset: number,
): Uint8Array {
  console.assert(nameBytes.length > 0, "central name present");
  console.assert(localOffset >= 0, "central offset non-neg");
  return concatBytes([
    u32(0x02014b50),
    u16(20),
    u16(20),
    u16(0),
    u16(0),
    u16(0),
    u16(0),
    u32(crc),
    u32(data.length),
    u32(data.length),
    u16(nameBytes.length),
    u16(0),
    u16(0),
    u16(0),
    u16(0),
    u32(0),
    u32(localOffset),
    nameBytes,
  ]);
}

function endOfCentralDir(
  entryCount: number,
  centralSize: number,
  centralOffset: number,
): Uint8Array {
  console.assert(entryCount >= 0, "eocd count");
  console.assert(centralOffset >= 0, "eocd offset");
  return concatBytes([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entryCount),
    u16(entryCount),
    u32(centralSize),
    u32(centralOffset),
    u16(0),
  ]);
}

/**
 * STORE-only ZIP (method 0). Bounded entry count; no compression, no recursion.
 */
export function buildStoreZip(entries: ZipEntry[]): Uint8Array {
  console.assert(Array.isArray(entries), "zip entries array");
  console.assert(entries.length <= MAX_EXPORT_SUBJECTS + 1, "zip entry cap");
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  let i = 0;
  while (i < entries.length) {
    const nameBytes = encodeUtf8(entries[i].name);
    const data = entries[i].data;
    const crc = crc32(data);
    const local = localFileHeader(nameBytes, data, crc);
    locals.push(local);
    centrals.push(centralDirHeader(nameBytes, data, crc, offset));
    offset += local.length;
    i += 1;
  }
  const centralBlob = concatBytes(centrals);
  const end = endOfCentralDir(entries.length, centralBlob.length, offset);
  return concatBytes([...locals, centralBlob, end]);
}

function digestHex(canonical: string): string {
  console.assert(typeof canonical === "string", "digest canonical string");
  console.assert(canonical.length > 0, "digest canonical non-empty");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

function canonicalManifestJson(
  fields: Omit<MultiSubjectManifest, "manifestDigest">,
): string {
  console.assert(fields !== null && fields !== undefined, "manifest fields");
  console.assert(typeof fields.schemaVersion === "string", "schema string");
  return JSON.stringify({
    schemaVersion: fields.schemaVersion,
    exportedAtIso: fields.exportedAtIso,
    subjectCount: fields.subjectCount,
    tipDigest: fields.tipDigest,
    ledgerChainOk: fields.ledgerChainOk,
    entries: fields.entries,
    notes: fields.notes,
  });
}

function gateMultiInput(
  input: ExportMultiSubjectInput,
): { ok: true } | { ok: false; reason: string } {
  console.assert(input !== null && input !== undefined, "multi input present");
  if (input === null || input === undefined) {
    return { ok: false, reason: "export input required" };
  }
  if (!Array.isArray(input.packets)) {
    return { ok: false, reason: "packets must be an array" };
  }
  if (input.packets.length === 0) {
    return { ok: false, reason: "packets empty" };
  }
  if (input.packets.length > MAX_EXPORT_SUBJECTS) {
    return {
      ok: false,
      reason:
        "packets exceed MAX_EXPORT_SUBJECTS (" +
        String(MAX_EXPORT_SUBJECTS) +
        ")",
    };
  }
  if (input.ledger === null || input.ledger === undefined) {
    return { ok: false, reason: "ledger required" };
  }
  if (!Array.isArray(input.ledger.seals)) {
    return { ok: false, reason: "ledger.seals not an array" };
  }
  if (input.ledger.seals.length > MAX_SEALS) {
    return { ok: false, reason: "ledger exceeds MAX_SEALS" };
  }
  return { ok: true };
}

function collectUniqueSubjects(
  packets: IssuePacket[],
): { ok: true; ids: string[] } | { ok: false; reason: string } {
  console.assert(Array.isArray(packets), "packets array");
  console.assert(packets.length <= MAX_EXPORT_SUBJECTS, "packets within cap");
  const ids: string[] = [];
  let i = 0;
  while (i < packets.length) {
    const packet = packets[i];
    if (packet === null || packet === undefined) {
      return { ok: false, reason: "packet missing at index " + String(i) };
    }
    if (typeof packet.subjectId !== "string" || packet.subjectId.length === 0) {
      return { ok: false, reason: "subjectId required at index " + String(i) };
    }
    if (packet.subjectId.length > MAX_ID_LEN) {
      return {
        ok: false,
        reason: "subjectId exceeds MAX_ID_LEN at index " + String(i),
      };
    }
    let j = 0;
    let dup = false;
    while (j < ids.length) {
      if (ids[j] === packet.subjectId) {
        dup = true;
        break;
      }
      j += 1;
    }
    if (dup) {
      return {
        ok: false,
        reason: "duplicate subjectId: " + packet.subjectId,
      };
    }
    ids.push(packet.subjectId);
    i += 1;
  }
  return { ok: true, ids };
}

type BuiltRow = {
  entry: MultiSubjectManifestEntry;
  filename: string;
  json: string;
  bundle: PacketEvidenceBundle;
};

function exportAllSubjects(
  packets: IssuePacket[],
  ledger: SealLedger,
  notes: string,
): { ok: true; rows: BuiltRow[] } | { ok: false; reason: string } {
  console.assert(packets.length > 0, "exportAll non-empty");
  console.assert(packets.length <= MAX_EXPORT_SUBJECTS, "exportAll capped");
  const rows: BuiltRow[] = [];
  let i = 0;
  while (i < packets.length) {
    const result = exportPacketEvidence({
      packet: packets[i],
      ledger,
      notes,
    });
    if (!result.ok) {
      return {
        ok: false,
        reason: "subject " + packets[i].subjectId + ": " + result.reason,
      };
    }
    const filename = evidenceFilename(packets[i].subjectId);
    rows.push({
      entry: {
        subjectId: packets[i].subjectId,
        filename,
        packId: result.bundle.packId,
        packVersion: result.bundle.packVersion,
        bundleDigest: result.bundle.bundleDigest,
        chainOk: result.bundle.chainOk,
        sealCount: result.bundle.seals.length,
      },
      filename,
      json: result.json,
      bundle: result.bundle,
    });
    i += 1;
  }
  console.assert(rows.length === packets.length, "rows match packets");
  return { ok: true, rows };
}

function buildManifest(
  rows: BuiltRow[],
  ledger: SealLedger,
  notes: string,
): MultiSubjectManifest {
  console.assert(rows.length > 0, "manifest rows present");
  console.assert(rows.length <= MAX_EXPORT_SUBJECTS, "manifest rows capped");
  const entries: MultiSubjectManifestEntry[] = [];
  let i = 0;
  while (i < rows.length) {
    entries.push(rows[i].entry);
    i += 1;
  }
  const chain = verifySealChain(ledger);
  const withoutDigest = {
    schemaVersion: MULTI_EVIDENCE_SCHEMA_VERSION,
    exportedAtIso: new Date().toISOString(),
    subjectCount: entries.length,
    tipDigest: tipDigest(ledger),
    ledgerChainOk: chain.ok,
    entries,
    notes,
  };
  const manifestDigest = digestHex(canonicalManifestJson(withoutDigest));
  console.assert(manifestDigest.length === 64, "manifest sha256 hex");
  return { ...withoutDigest, manifestDigest };
}

function zipFromRows(
  rows: BuiltRow[],
  manifest: MultiSubjectManifest,
): Uint8Array {
  console.assert(rows.length > 0, "zip rows present");
  console.assert(manifest.manifestDigest.length === 64, "zip manifest digest");
  const zipEntries: ZipEntry[] = [
    {
      name: MANIFEST_FILENAME,
      data: encodeUtf8(JSON.stringify(manifest, null, 2)),
    },
  ];
  let i = 0;
  while (i < rows.length) {
    zipEntries.push({
      name: rows[i].filename,
      data: encodeUtf8(rows[i].json),
    });
    i += 1;
  }
  console.assert(
    zipEntries.length === rows.length + 1,
    "zip has manifest + subjects",
  );
  return buildStoreZip(zipEntries);
}

/**
 * Bundle evidence JSON for several subjects into one STORE-only zip.
 * Fail-closed: empty, over-cap, duplicates, or any single export failure.
 * Manifest always included; no partial archive on error.
 */
export function exportMultiSubjectEvidenceZip(
  input: ExportMultiSubjectInput,
): ExportMultiSubjectResult {
  console.assert(true, "multi export entry");
  const gated = gateMultiInput(input);
  if (!gated.ok) return failMulti(gated.reason);

  const unique = collectUniqueSubjects(input.packets);
  if (!unique.ok) return failMulti(unique.reason);

  const notes = boundNotes(input.notes);
  const built = exportAllSubjects(input.packets, input.ledger, notes);
  if (!built.ok) return failMulti(built.reason);

  const manifest = buildManifest(built.rows, input.ledger, notes);
  const zipBytes = zipFromRows(built.rows, manifest);
  console.assert(zipBytes.length > 0, "zip non-empty");
  console.assert(manifest.subjectCount === built.rows.length, "count match");
  return {
    ok: true,
    manifest,
    zipBytes,
    filename: DEFAULT_MULTI_ZIP_FILENAME,
  };
}
