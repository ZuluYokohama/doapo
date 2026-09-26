/**
 * Static domain-pack registry.
 * Power of 10: no recursion, bounded list, fail-closed unknown ids.
 */
import { BAKKEN_PACK } from "./bakken.ts";
import { DUC_QUEUE_PACK } from "./duc-queue.ts";
import type { DomainPack } from "../types.ts";

/** Hard upper bound on registered packs (Power of 10). */
export const MAX_REGISTERED_PACKS = 16;

const PACK_BY_ID: Readonly<Record<string, DomainPack>> = {
  bakken: BAKKEN_PACK,
  "bakken-duc": DUC_QUEUE_PACK,
};

export type PackLookupOk = { ok: true; pack: DomainPack };
export type PackLookupErr = { ok: false; reason: string };
export type PackLookupResult = PackLookupOk | PackLookupErr;

/**
 * Fail-closed pack lookup. Unknown id → null path via ok:false + reason.
 * Callers that want DomainPack | null use getPack.
 */
export function lookupPack(id: string): PackLookupResult {
  console.assert(typeof id === "string", "pack id is string");
  if (typeof id !== "string" || id.length === 0 || id.length > 64) {
    return { ok: false, reason: "pack id invalid" };
  }
  const pack = PACK_BY_ID[id];
  if (pack === undefined) {
    return { ok: false, reason: `unknown pack id: ${id}` };
  }
  return { ok: true, pack };
}

/** Unknown id → null. Prefer lookupPack when reason is needed. */
export function getPack(id: string): DomainPack | null {
  const result = lookupPack(id);
  if (!result.ok) return null;
  return result.pack;
}

/**
 * Bounded list of registered pack ids (insertion order of PACK_BY_ID keys).
 * Length asserted ≤ MAX_REGISTERED_PACKS.
 */
export function listPackIds(): string[] {
  const ids = Object.keys(PACK_BY_ID);
  console.assert(ids.length <= MAX_REGISTERED_PACKS, "registered packs in bound");
  console.assert(ids.length >= 1, "at least one pack registered");
  return ids;
}
