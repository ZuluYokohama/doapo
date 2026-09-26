/**
 * Import DomainPack from bounded JSON text.
 * Power of 10: flat, bounded size, no recursion, ≤60 lines/fn, ≥2 asserts/fn.
 * Registry stays static — imported packs are session/UI overlays only.
 */
import { lookupPack, type PackLookupResult } from "./packs/registry.ts";
import {
  MAX_ID_LEN,
  type DomainPack,
} from "./types.ts";
import { validateDomainPack } from "./validate.ts";

/** Hard cap on JSON text length (Power of 10). */
export const MAX_PACK_JSON_CHARS = 262144;

export type ImportPackOk = { ok: true; pack: DomainPack };
export type ImportPackErr = { ok: false; reason: string };
export type ImportPackResult = ImportPackOk | ImportPackErr;

function failImport(reason: string): ImportPackErr {
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

/**
 * Shallow-copy pack arrays so callers cannot mutate the parse result in place.
 * Nested row objects are shared (validate already accepted them).
 */
function clonePack(pack: DomainPack): DomainPack {
  console.assert(pack !== null && pack !== undefined, "clone pack present");
  console.assert(Array.isArray(pack.outcomeClasses), "clone outcomes array");
  return {
    schemaVersion: pack.schemaVersion,
    id: pack.id,
    version: pack.version,
    title: pack.title,
    substrate: pack.substrate,
    outcomeClasses: pack.outcomeClasses.slice(),
    advisorChecks: pack.advisorChecks.slice(),
    residueDefaults: pack.residueDefaults.slice(),
    killConditions: pack.killConditions.slice(),
    publicSources: pack.publicSources.slice(),
  };
}

/**
 * Parse + fail-closed validate a DomainPack from JSON text.
 * Size-capped; JSON.parse errors → ok:false; validateDomainPack reasons pass through.
 */
export function importPackFromJson(text: string): ImportPackResult {
  console.assert(typeof text === "string", "import text is string");
  console.assert(MAX_PACK_JSON_CHARS > 0, "json cap positive");
  if (typeof text !== "string") {
    return failImport("text invalid");
  }
  if (text.length === 0) {
    return failImport("text empty");
  }
  if (text.length > MAX_PACK_JSON_CHARS) {
    return failImport("text exceeds size cap");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return failImport("JSON parse failed");
  }

  if (!isPlainObject(parsed)) {
    return failImport("pack must be a JSON object");
  }

  let checked;
  try {
    checked = validateDomainPack(parsed as DomainPack);
  } catch {
    return failImport("pack validate threw");
  }
  if (!checked.ok) {
    return failImport(checked.reason);
  }

  const pack = clonePack(parsed as DomainPack);
  console.assert(pack.id.length > 0 && pack.id.length <= MAX_ID_LEN, "pack id bound");
  return { ok: true, pack };
}

/**
 * Resolve a pack id preferring a session-imported overlay when ids match.
 * Static registry is never mutated; unknown id without overlay → fail-closed.
 */
export function resolvePack(
  id: string,
  overlay: DomainPack | null,
): PackLookupResult {
  console.assert(typeof id === "string", "resolve id string");
  console.assert(overlay === null || typeof overlay === "object", "overlay shape");
  if (
    overlay !== null &&
    typeof overlay.id === "string" &&
    overlay.id === id
  ) {
    return { ok: true, pack: overlay };
  }
  return lookupPack(id);
}
