/**
 * Browser demo session store for SealLedger.
 * Power of 10: bounded, fail-closed, no recursion.
 * Not durable authority — sessionStorage only.
 */
import {
  MAX_SEALS,
  createLedger,
  verifySealChain,
  type SealKind,
  type SealLedger,
  type SealRecord,
} from "./ledger.ts";
import {
  MAX_ID_LEN,
  MAX_LONG_TEXT_LEN,
  MAX_TEXT_LEN,
  type AuthorityRole,
  type GateVerdict,
} from "./types.ts";

export const LEDGER_STORE_KEY = "doapo.packet.seal-ledger.v1";
export const LEDGER_STORE_VERSION = 1;

/** Soft byte cap on serialized payload (fail-closed if exceeded). */
export const LEDGER_STORE_MAX_BYTES = 512_000;

export type LoadLedgerResult = {
  ledger: SealLedger;
  reason: string | null;
};

const SEAL_KINDS: readonly SealKind[] = [
  "propose",
  "evaluate",
  "open",
  "abstain",
  "stop",
];

const GATES: readonly GateVerdict[] = [
  "OPEN_CANDIDATE",
  "STOP",
  "RESIDUE",
  "ABSTAIN",
];

const ROLES: readonly AuthorityRole[] = [
  "agent_propose",
  "evaluator",
  "human_open",
  "ops_execute",
];

function emptyLoad(reason: string): LoadLedgerResult {
  console.assert(reason.length > 0, "load reason present");
  return { ledger: createLedger(), reason };
}

function includesString(list: readonly string[], value: string): boolean {
  let i = 0;
  while (i < list.length) {
    if (list[i] === value) return true;
    i += 1;
  }
  return false;
}

function isSealKind(value: unknown): value is SealKind {
  return typeof value === "string" && includesString(SEAL_KINDS, value);
}

function isGate(value: unknown): value is GateVerdict {
  return typeof value === "string" && includesString(GATES, value);
}

function isRole(value: unknown): value is AuthorityRole {
  return typeof value === "string" && includesString(ROLES, value);
}

function parseSeal(raw: unknown, index: number): SealRecord | null {
  console.assert(index >= 0, "seal index non-negative");
  if (raw === null || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== "string" || row.id.length === 0 || row.id.length > MAX_ID_LEN) {
    return null;
  }
  if (
    typeof row.atIso !== "string" ||
    row.atIso.length === 0 ||
    row.atIso.length > MAX_TEXT_LEN
  ) {
    return null;
  }
  if (!isSealKind(row.kind)) return null;
  if (
    typeof row.packetSubjectId !== "string" ||
    row.packetSubjectId.length === 0 ||
    row.packetSubjectId.length > MAX_ID_LEN
  ) {
    return null;
  }
  if (
    typeof row.packId !== "string" ||
    row.packId.length === 0 ||
    row.packId.length > MAX_ID_LEN
  ) {
    return null;
  }
  if (!isGate(row.gate)) return null;
  if (!isRole(row.proposedBy)) return null;
  if (
    typeof row.digest !== "string" ||
    row.digest.length === 0 ||
    row.digest.length > 128
  ) {
    return null;
  }
  if (typeof row.prevDigest !== "string" || row.prevDigest.length > 128) {
    return null;
  }
  if (typeof row.note !== "string" || row.note.length > MAX_LONG_TEXT_LEN) {
    return null;
  }
  return {
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
  };
}

function parseLedgerPayload(raw: string): LoadLedgerResult {
  console.assert(typeof raw === "string", "raw string");
  if (raw.length === 0) {
    return emptyLoad("empty payload");
  }
  if (raw.length > LEDGER_STORE_MAX_BYTES) {
    return emptyLoad("payload exceeds LEDGER_STORE_MAX_BYTES");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return emptyLoad("JSON parse failed");
  }
  if (parsed === null || typeof parsed !== "object") {
    return emptyLoad("payload not an object");
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.version !== LEDGER_STORE_VERSION) {
    return emptyLoad("unsupported store version");
  }
  if (!Array.isArray(obj.seals)) {
    return emptyLoad("seals not an array");
  }
  if (obj.seals.length > MAX_SEALS * 2) {
    return emptyLoad("seals grossly oversize");
  }
  const seals: SealRecord[] = [];
  let i = 0;
  const bound = obj.seals.length <= MAX_SEALS ? obj.seals.length : MAX_SEALS;
  while (i < bound) {
    const seal = parseSeal(obj.seals[i], i);
    if (seal === null) {
      return emptyLoad("corrupt seal at index " + String(i));
    }
    seals.push(seal);
    i += 1;
  }
  const ledger: SealLedger = { seals };
  const chain = verifySealChain(ledger);
  if (!chain.ok) {
    return emptyLoad(chain.reason);
  }
  return { ledger, reason: null };
}

function canUseSessionStorage(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.sessionStorage !== "undefined"
  );
}

/** Load session ledger. Fail-closed → empty ledger + reason. */
export function loadSessionLedger(): LoadLedgerResult {
  if (!canUseSessionStorage()) {
    return emptyLoad("sessionStorage unavailable");
  }
  let raw: string | null;
  try {
    raw = window.sessionStorage.getItem(LEDGER_STORE_KEY);
  } catch {
    return emptyLoad("sessionStorage getItem failed");
  }
  if (raw === null) {
    return { ledger: createLedger(), reason: null };
  }
  return parseLedgerPayload(raw);
}

export type SaveLedgerResult =
  | { ok: true }
  | { ok: false; reason: string };

/** Persist ledger. Caps at MAX_SEALS; verifies chain before write. */
export function saveSessionLedger(ledger: SealLedger): SaveLedgerResult {
  console.assert(ledger !== null && ledger !== undefined, "ledger present");
  if (!canUseSessionStorage()) {
    return { ok: false, reason: "sessionStorage unavailable" };
  }
  if (!Array.isArray(ledger.seals)) {
    return { ok: false, reason: "seals not an array" };
  }
  if (ledger.seals.length > MAX_SEALS) {
    return { ok: false, reason: "seals exceed MAX_SEALS" };
  }
  const chain = verifySealChain(ledger);
  if (!chain.ok) {
    return { ok: false, reason: chain.reason };
  }
  const payload = JSON.stringify({
    version: LEDGER_STORE_VERSION,
    seals: ledger.seals,
  });
  if (payload.length > LEDGER_STORE_MAX_BYTES) {
    return { ok: false, reason: "payload exceeds LEDGER_STORE_MAX_BYTES" };
  }
  try {
    window.sessionStorage.setItem(LEDGER_STORE_KEY, payload);
  } catch {
    return { ok: false, reason: "sessionStorage setItem failed" };
  }
  return { ok: true };
}

/** Clear demo ledger from session (ignore if unavailable). */
export function clearSessionLedger(): void {
  if (!canUseSessionStorage()) return;
  try {
    window.sessionStorage.removeItem(LEDGER_STORE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Parse a versioned JSON payload without touching sessionStorage.
 * Exported for unit tests (Node has no sessionStorage by default).
 */
export function parseStoredLedger(raw: string): LoadLedgerResult {
  console.assert(typeof raw === "string", "raw string");
  return parseLedgerPayload(raw);
}
