/**
 * Cross-pack kill audit — one packet against many packs (bounded).
 * Power of 10: flat, bounded loops, no recursion, ≤60 lines/fn, ≥2 asserts/fn.
 * Facts are pack-agnostic kill ids; checkKillConditions per pack (no rebuild).
 */
import { checkKillConditions } from "./kill-check.ts";
import { getPack, listPackIds, MAX_REGISTERED_PACKS } from "./packs/registry.ts";
import {
  MAX_ID_LEN,
  MAX_TEXT_LEN,
  type DomainPack,
  type IssuePacket,
} from "./types.ts";

/** Hard cap on packs audited in one pass (Power of 10). */
export const MAX_AUDIT_PACKS = MAX_REGISTERED_PACKS;

export type KillAuditRow = {
  packId: string;
  packVersion: string;
  hit: boolean;
  killId?: string;
  reason?: string;
};

export type AuditKillsAcrossPacksInput = {
  packet: IssuePacket;
  packs: DomainPack[];
  /** Session overlay: prefer when id matches; append if not already listed. */
  overlay?: DomainPack | null;
  maxPacks?: number;
};

export type AuditKillsAcrossPacksResult =
  | { ok: true; rows: KillAuditRow[]; audited: number; hitCount: number }
  | { ok: false; reason: string };

function failAudit(reason: string): AuditKillsAcrossPacksResult {
  console.assert(typeof reason === "string", "audit fail reason string");
  console.assert(reason.length > 0, "audit fail reason present");
  return { ok: false, reason };
}

function resolveCap(maxPacks: number | undefined): number {
  console.assert(MAX_AUDIT_PACKS >= 1, "default audit cap positive");
  console.assert(true, "resolveCap entry");
  if (maxPacks === undefined || maxPacks === null) {
    return MAX_AUDIT_PACKS;
  }
  if (typeof maxPacks !== "number" || maxPacks < 1) {
    return 0;
  }
  if (maxPacks > MAX_AUDIT_PACKS) return MAX_AUDIT_PACKS;
  return maxPacks;
}

function clipId(raw: string): string {
  console.assert(typeof raw === "string", "id string");
  console.assert(raw.length >= 0, "id length");
  if (raw.length === 0) return "unknown";
  if (raw.length <= MAX_ID_LEN) return raw;
  return raw.slice(0, MAX_ID_LEN);
}

function clipVersion(raw: string): string {
  console.assert(typeof raw === "string", "version string");
  console.assert(raw.length >= 0, "version length");
  if (raw.length === 0) return "0";
  if (raw.length <= MAX_TEXT_LEN) return raw;
  return raw.slice(0, MAX_TEXT_LEN);
}

/**
 * Merge explicit packs with optional overlay (prefer overlay id; append if new).
 * Bounded ≤ MAX_AUDIT_PACKS. Does not mutate inputs.
 */
export function mergePacksForAudit(
  packs: DomainPack[],
  overlay: DomainPack | null | undefined,
): DomainPack[] {
  console.assert(Array.isArray(packs), "packs array");
  console.assert(true, "mergePacksForAudit entry");
  const out: DomainPack[] = [];
  let i = 0;
  const bound = packs.length < MAX_AUDIT_PACKS ? packs.length : MAX_AUDIT_PACKS;
  while (i < bound) {
    const pack = packs[i];
    if (
      overlay !== null &&
      overlay !== undefined &&
      typeof overlay.id === "string" &&
      overlay.id === pack.id
    ) {
      out.push(overlay);
    } else {
      out.push(pack);
    }
    i += 1;
  }
  if (
    overlay !== null &&
    overlay !== undefined &&
    typeof overlay.id === "string" &&
    overlay.id.length > 0
  ) {
    let found = false;
    let j = 0;
    while (j < out.length) {
      if (out[j].id === overlay.id) {
        found = true;
        break;
      }
      j += 1;
    }
    if (!found && out.length < MAX_AUDIT_PACKS) {
      out.push(overlay);
    }
  }
  console.assert(out.length <= MAX_AUDIT_PACKS, "merged packs within cap");
  return out;
}

/**
 * Registered packs (insertion order) + optional session overlay.
 * Fail-closed empty registry → [].
 */
export function listPacksForAudit(
  overlay: DomainPack | null = null,
): DomainPack[] {
  console.assert(
    overlay === null || typeof overlay === "object",
    "overlay shape",
  );
  console.assert(MAX_AUDIT_PACKS >= 1, "audit cap positive");
  const ids = listPackIds();
  const packs: DomainPack[] = [];
  let i = 0;
  const bound = ids.length < MAX_AUDIT_PACKS ? ids.length : MAX_AUDIT_PACKS;
  while (i < bound) {
    const pack = getPack(ids[i]);
    if (pack !== null) packs.push(pack);
    i += 1;
  }
  return mergePacksForAudit(packs, overlay);
}

function auditOnePack(pack: DomainPack, packet: IssuePacket): KillAuditRow {
  console.assert(pack !== null && pack !== undefined, "pack present");
  console.assert(packet !== null && packet !== undefined, "packet present");
  const packId = clipId(typeof pack.id === "string" ? pack.id : "");
  const packVersion = clipVersion(
    typeof pack.version === "string" ? pack.version : "",
  );
  const check = checkKillConditions(pack, packet);
  if (!check.ok) {
    return { packId, packVersion, hit: false, reason: check.reason };
  }
  if (check.hit) {
    return {
      packId,
      packVersion,
      hit: true,
      killId: check.killId,
      reason: check.statement,
    };
  }
  return { packId, packVersion, hit: false };
}

/**
 * Run checkKillConditions for each pack against the same packet facts.
 * Fail-closed on missing packet, empty packs list, or invalid cap.
 */
export function auditKillsAcrossPacks(
  input: AuditKillsAcrossPacksInput,
): AuditKillsAcrossPacksResult {
  console.assert(input !== null && input !== undefined, "input present");
  console.assert(true, "auditKillsAcrossPacks entry");
  if (input === null || input === undefined) {
    return failAudit("input required");
  }
  if (input.packet === null || input.packet === undefined) {
    return failAudit("packet required");
  }
  if (!Array.isArray(input.packs)) {
    return failAudit("packs required");
  }
  const merged = mergePacksForAudit(input.packs, input.overlay);
  if (merged.length < 1) {
    return failAudit("packs empty");
  }
  const cap = resolveCap(input.maxPacks);
  if (cap < 1) {
    return failAudit("maxPacks invalid");
  }
  const bound = merged.length < cap ? merged.length : cap;
  const rows: KillAuditRow[] = [];
  let hitCount = 0;
  let i = 0;
  while (i < bound) {
    const row = auditOnePack(merged[i], input.packet);
    if (row.hit) hitCount += 1;
    rows.push(row);
    i += 1;
  }
  console.assert(rows.length <= MAX_AUDIT_PACKS, "rows within cap");
  console.assert(rows.length === bound, "rows match bound");
  return { ok: true, rows, audited: rows.length, hitCount };
}

/**
 * Convenience: audit packet against an explicit pack list (no overlay merge).
 */
export function auditPacketKills(
  packet: IssuePacket,
  packs: DomainPack[],
): AuditKillsAcrossPacksResult {
  console.assert(packet !== null && packet !== undefined, "packet present");
  console.assert(Array.isArray(packs), "packs array");
  return auditKillsAcrossPacks({ packet, packs });
}

/** Bounded hit-only slice for UI tables. */
export function listKillAuditHits(
  rows: readonly KillAuditRow[],
): KillAuditRow[] {
  console.assert(Array.isArray(rows), "rows array");
  console.assert(MAX_AUDIT_PACKS >= 1, "hit list cap positive");
  const out: KillAuditRow[] = [];
  let i = 0;
  const bound = rows.length < MAX_AUDIT_PACKS ? rows.length : MAX_AUDIT_PACKS;
  while (i < bound) {
    if (rows[i].hit) out.push(rows[i]);
    i += 1;
  }
  console.assert(out.length <= MAX_AUDIT_PACKS, "hits bounded");
  return out;
}
