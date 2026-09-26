/**
 * Append-only seal ledger for evidence class `ledger`.
 * Power of 10: bounded store, no rewrite/delete/insert-middle, no recursion.
 * Fail-closed: capacity and tip-chain mismatches reject.
 */
import { createHash } from "node:crypto";
import {
  MAX_ID_LEN,
  MAX_LONG_TEXT_LEN,
  MAX_TEXT_LEN,
  type AuthorityRole,
  type GateVerdict,
  type IssuePacket,
} from "./types.ts";
import type { OpenResult } from "./roles.ts";

export const MAX_SEALS = 256;
export const UI_LEDGER_CAP = 8;

export type SealKind =
  | "propose"
  | "evaluate"
  | "open"
  | "abstain"
  | "stop";

export type SealRecord = {
  id: string;
  atIso: string;
  kind: SealKind;
  packetSubjectId: string;
  packId: string;
  gate: GateVerdict;
  proposedBy: AuthorityRole;
  digest: string;
  prevDigest: string;
  note: string;
};

/** Input for append; digest is computed by appendSeal. */
export type SealAppendInput = {
  id: string;
  atIso: string;
  kind: SealKind;
  packetSubjectId: string;
  packId: string;
  gate: GateVerdict;
  proposedBy: AuthorityRole;
  prevDigest: string;
  note: string;
};

export type SealLedger = {
  seals: SealRecord[];
};

export type AppendSealResult =
  | { ok: true; record: SealRecord; ledger: SealLedger }
  | { ok: false; reason: string };

function failAppend(reason: string): AppendSealResult {
  return { ok: false, reason };
}

/** Stable SHA-256 hex of canonical seal fields + prevDigest. */
export function computeSealDigest(
  fields: Omit<SealAppendInput, "prevDigest"> & { prevDigest: string },
): string {
  console.assert(fields !== null && fields !== undefined, "fields present");
  const canonical =
    fields.id +
    "\0" +
    fields.atIso +
    "\0" +
    fields.kind +
    "\0" +
    fields.packetSubjectId +
    "\0" +
    fields.packId +
    "\0" +
    fields.gate +
    "\0" +
    fields.proposedBy +
    "\0" +
    fields.prevDigest +
    "\0" +
    fields.note;
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

function assertLedger(ledger: SealLedger): void {
  console.assert(ledger !== null && ledger !== undefined, "ledger present");
  console.assert(Array.isArray(ledger.seals), "seals array");
  console.assert(ledger.seals.length <= MAX_SEALS, "seals within MAX_SEALS");
}

export function createLedger(): SealLedger {
  return { seals: [] };
}

export function tipDigest(ledger: SealLedger): string | null {
  assertLedger(ledger);
  if (ledger.seals.length === 0) {
    return null;
  }
  return ledger.seals[ledger.seals.length - 1].digest;
}

/**
 * Append one seal. Fail-closed on capacity or tip mismatch.
 * Genesis: prevDigest must be "" when tip is null.
 */
export function appendSeal(
  ledger: SealLedger,
  input: SealAppendInput,
): AppendSealResult {
  assertLedger(ledger);
  if (input === null || input === undefined) {
    return failAppend("seal input required");
  }
  if (ledger.seals.length >= MAX_SEALS) {
    return failAppend("capacity: would exceed MAX_SEALS (" + MAX_SEALS + ")");
  }
  if (typeof input.id !== "string" || input.id.length === 0) {
    return failAppend("id required");
  }
  if (input.id.length > MAX_ID_LEN) {
    return failAppend("id exceeds MAX_ID_LEN");
  }
  if (typeof input.atIso !== "string" || input.atIso.length === 0) {
    return failAppend("atIso required");
  }
  if (input.atIso.length > MAX_TEXT_LEN) {
    return failAppend("atIso exceeds MAX_TEXT_LEN");
  }
  if (typeof input.note !== "string") {
    return failAppend("note required");
  }
  if (input.note.length > MAX_LONG_TEXT_LEN) {
    return failAppend("note exceeds MAX_LONG_TEXT_LEN");
  }
  if (typeof input.prevDigest !== "string") {
    return failAppend("prevDigest required (use empty string for genesis)");
  }

  const tip = tipDigest(ledger);
  if (tip === null) {
    if (input.prevDigest !== "") {
      return failAppend(
        "chain: genesis prevDigest must be empty string (got non-empty)",
      );
    }
  } else if (input.prevDigest !== tip) {
    return failAppend("chain: prevDigest does not match tip");
  }

  const digest = computeSealDigest({
    id: input.id,
    atIso: input.atIso,
    kind: input.kind,
    packetSubjectId: input.packetSubjectId,
    packId: input.packId,
    gate: input.gate,
    proposedBy: input.proposedBy,
    prevDigest: input.prevDigest,
    note: input.note,
  });

  const record: SealRecord = {
    id: input.id,
    atIso: input.atIso,
    kind: input.kind,
    packetSubjectId: input.packetSubjectId,
    packId: input.packId,
    gate: input.gate,
    proposedBy: input.proposedBy,
    digest,
    prevDigest: input.prevDigest,
    note: input.note,
  };

  const nextSeals = ledger.seals.slice();
  nextSeals.push(record);
  console.assert(nextSeals.length <= MAX_SEALS, "append within bound");
  return { ok: true, record, ledger: { seals: nextSeals } };
}

/** Shallow copy of seals (bounded by MAX_SEALS). */
export function listSeals(ledger: SealLedger): SealRecord[] {
  assertLedger(ledger);
  const out: SealRecord[] = [];
  const n = ledger.seals.length;
  console.assert(n <= MAX_SEALS, "list within MAX_SEALS");
  let i = 0;
  while (i < n) {
    out.push(ledger.seals[i]);
    i += 1;
  }
  return out;
}

/**
 * Build append input from an IssuePacket after role paths.
 * Caller supplies kind, prevDigest, and note; id/atIso are generated.
 */
export function sealFromPacket(
  packet: IssuePacket,
  kind: SealKind,
  prevDigest: string,
  note: string,
): SealAppendInput {
  console.assert(packet !== null && packet !== undefined, "packet present");
  const atIso = new Date().toISOString();
  const idBase =
    kind + "-" + packet.subjectId + "-" + String(Date.now());
  const id = idBase.length <= MAX_ID_LEN ? idBase : idBase.slice(0, MAX_ID_LEN);
  const safeNote =
    note.length <= MAX_LONG_TEXT_LEN ? note : note.slice(0, MAX_LONG_TEXT_LEN);
  return {
    id,
    atIso,
    kind,
    packetSubjectId: packet.subjectId,
    packId: packet.packId,
    gate: packet.gate,
    proposedBy: packet.proposedBy,
    prevDigest,
    note: safeNote,
  };
}

/**
 * Thin UI/demo hook: append an `open` seal after a successful openCandidate.
 * Does not mutate roles; keeps openCandidate pure.
 */
export function appendOpenSeal(
  ledger: SealLedger,
  openResult: OpenResult,
): AppendSealResult {
  assertLedger(ledger);
  if (openResult === null || openResult === undefined) {
    return failAppend("openResult required");
  }
  if (!openResult.ok) {
    return failAppend("openResult not ok: " + openResult.reason);
  }
  const tip = tipDigest(ledger);
  const prev = tip === null ? "" : tip;
  const input = sealFromPacket(
    openResult.packet,
    "open",
    prev,
    "human_open stamp",
  );
  return appendSeal(ledger, input);
}

/** Last N seals for UI (cap UI_LEDGER_CAP). Newest last. */
export function listRecentSeals(
  ledger: SealLedger,
  cap: number = UI_LEDGER_CAP,
): SealRecord[] {
  assertLedger(ledger);
  const bound = cap < 1 ? 1 : cap > UI_LEDGER_CAP ? UI_LEDGER_CAP : cap;
  const all = listSeals(ledger);
  if (all.length <= bound) {
    return all;
  }
  const start = all.length - bound;
  const out: SealRecord[] = [];
  let i = start;
  while (i < all.length) {
    out.push(all[i]);
    i += 1;
  }
  return out;
}


/**
 * Seals for one subject, chronological, hard-capped.
 * Fail-closed: empty / non-string subjectId → [].
 */
export function listSealsForSubject(
  ledger: SealLedger,
  subjectId: string,
  cap: number = UI_LEDGER_CAP,
): SealRecord[] {
  assertLedger(ledger);
  console.assert(typeof subjectId === "string", "subjectId string");
  if (typeof subjectId !== "string" || subjectId.length === 0) {
    return [];
  }
  if (subjectId.length > MAX_ID_LEN) {
    return [];
  }
  const bound = cap < 1 ? 1 : cap > UI_LEDGER_CAP ? UI_LEDGER_CAP : cap;
  const matched: SealRecord[] = [];
  const n = ledger.seals.length;
  let i = 0;
  while (i < n) {
    const row = ledger.seals[i];
    if (row.packetSubjectId === subjectId) {
      matched.push(row);
    }
    i += 1;
  }
  if (matched.length <= bound) {
    return matched;
  }
  const start = matched.length - bound;
  const out: SealRecord[] = [];
  let j = start;
  while (j < matched.length) {
    out.push(matched[j]);
    j += 1;
  }
  console.assert(out.length <= bound, "subject list within cap");
  return out;
}

/** Count seals for subject (full ledger scan, no UI cap). Fail-closed empty id → 0. */
export function countSealsForSubject(
  ledger: SealLedger,
  subjectId: string,
): number {
  assertLedger(ledger);
  console.assert(typeof subjectId === "string", "subjectId string");
  if (typeof subjectId !== "string" || subjectId.length === 0) {
    return 0;
  }
  if (subjectId.length > MAX_ID_LEN) {
    return 0;
  }
  let count = 0;
  const n = ledger.seals.length;
  let i = 0;
  while (i < n) {
    if (ledger.seals[i].packetSubjectId === subjectId) {
      count += 1;
    }
    i += 1;
  }
  console.assert(count <= MAX_SEALS, "count within MAX_SEALS");
  return count;
}

export type VerifyChainResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Recompute digests and prevDigest links. Fail-closed on any break.
 */
export function verifySealChain(ledger: SealLedger): VerifyChainResult {
  assertLedger(ledger);
  const n = ledger.seals.length;
  console.assert(n <= MAX_SEALS, "verify within MAX_SEALS");
  if (n === 0) {
    return { ok: true };
  }
  let i = 0;
  let expectedPrev = "";
  while (i < n) {
    const row = ledger.seals[i];
    if (row === null || row === undefined) {
      return { ok: false, reason: "chain: missing seal at index " + String(i) };
    }
    if (row.prevDigest !== expectedPrev) {
      return {
        ok: false,
        reason: "chain: prevDigest mismatch at index " + String(i),
      };
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
        reason: "chain: digest mismatch at index " + String(i),
      };
    }
    expectedPrev = row.digest;
    i += 1;
  }
  return { ok: true };
}
