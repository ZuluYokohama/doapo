/**
 * Kill-condition runtime check — fail-closed forced STOP.
 * Power of 10: flat, bounded loops, no recursion, ≤60 lines/fn, ≥2 asserts/fn.
 *
 * Matching rule (deterministic, single clear rule):
 *   Build a bounded haystack from measuredFacts as `key=value\n` lines.
 *   A killCondition hits when ANY measured fact has:
 *     (key === kill.id OR key === "kill:" + kill.id)
 *     AND value (case-insensitive) === "triggered"
 *   Equivalently: haystack includes `kill.id + "=triggered"` or
 *   `"kill:" + kill.id + "=triggered"`.
 * Packs/authors set that fact when a kill is observed in the field.
 * No fuzzy statement/keyword matching (avoids false positives).
 */
import {
  MAX_ID_LEN,
  MAX_KILL_CONDITIONS,
  MAX_LONG_TEXT_LEN,
  MAX_MEASURED_FACTS,
  MAX_RESIDUE_ITEMS,
  type DomainPack,
  type IssuePacket,
  type KillCondition,
  type MeasuredFact,
} from "./types.ts";

/** Affirmative trigger token (case-insensitive). */
export const KILL_TRIGGER_VALUE = "triggered";

export type KillCheckResult =
  | { ok: true; hit: false }
  | { ok: true; hit: true; killId: string; statement: string }
  | { ok: false; reason: string };

function failKill(reason: string): KillCheckResult {
  console.assert(typeof reason === "string", "kill fail reason string");
  console.assert(reason.length > 0, "kill fail reason present");
  return { ok: false, reason };
}

function normalizeValue(raw: string): string {
  console.assert(typeof raw === "string", "value is string");
  console.assert(raw.length <= MAX_LONG_TEXT_LEN, "value length bound");
  return raw.toLowerCase();
}

function keyMatchesKill(key: string, killId: string): boolean {
  console.assert(killId.length > 0, "killId present");
  console.assert(key.length > 0, "fact key present");
  if (key === killId) return true;
  if (key === "kill:" + killId) return true;
  return false;
}

function factTriggersKill(fact: MeasuredFact, killId: string): boolean {
  console.assert(fact !== null && fact !== undefined, "fact present");
  console.assert(killId.length > 0, "killId present");
  if (!keyMatchesKill(fact.key, killId)) return false;
  return normalizeValue(fact.value) === KILL_TRIGGER_VALUE;
}

/** Bounded haystack for docs/tests parity: `key=value\n` up to caps. */
export function buildKillHaystack(facts: MeasuredFact[]): string {
  console.assert(Array.isArray(facts), "facts array");
  console.assert(facts.length <= MAX_MEASURED_FACTS, "facts within max");
  let out = "";
  let i = 0;
  const bound =
    facts.length < MAX_MEASURED_FACTS ? facts.length : MAX_MEASURED_FACTS;
  while (i < bound) {
    const row = facts[i];
    const key =
      row.key.length <= MAX_ID_LEN ? row.key : row.key.slice(0, MAX_ID_LEN);
    const value =
      row.value.length <= MAX_LONG_TEXT_LEN
        ? row.value
        : row.value.slice(0, MAX_LONG_TEXT_LEN);
    const line = key + "=" + value + "\n";
    if (out.length + line.length > MAX_LONG_TEXT_LEN) break;
    out += line;
    i += 1;
  }
  return out;
}

function scanFactsForKill(
  facts: MeasuredFact[],
  kill: KillCondition,
): boolean {
  console.assert(kill.id.length > 0, "kill id present");
  console.assert(Array.isArray(facts), "facts array");
  let i = 0;
  const bound =
    facts.length < MAX_MEASURED_FACTS ? facts.length : MAX_MEASURED_FACTS;
  while (i < bound) {
    if (factTriggersKill(facts[i], kill.id)) return true;
    i += 1;
  }
  return false;
}

/**
 * Evaluate pack killConditions against packet measured facts.
 * Fail-closed on bad pack/packet shape.
 */
export function checkKillConditions(
  pack: DomainPack,
  packet: IssuePacket,
): KillCheckResult {
  console.assert(pack !== null && pack !== undefined, "pack present");
  console.assert(packet !== null && packet !== undefined, "packet present");
  if (pack === null || pack === undefined) {
    return failKill("pack required");
  }
  if (packet === null || packet === undefined) {
    return failKill("packet required");
  }
  if (!Array.isArray(pack.killConditions)) {
    return failKill("killConditions required");
  }
  if (pack.killConditions.length < 1) {
    return failKill("killConditions empty");
  }
  if (pack.killConditions.length > MAX_KILL_CONDITIONS) {
    return failKill("killConditions bounds");
  }
  if (!Array.isArray(packet.measuredFacts)) {
    return failKill("measuredFacts required");
  }
  if (packet.measuredFacts.length > MAX_MEASURED_FACTS) {
    return failKill("measuredFacts bounds");
  }

  let i = 0;
  const killBound =
    pack.killConditions.length < MAX_KILL_CONDITIONS
      ? pack.killConditions.length
      : MAX_KILL_CONDITIONS;
  while (i < killBound) {
    const kill = pack.killConditions[i];
    if (typeof kill.id !== "string" || kill.id.length === 0) {
      return failKill("killConditions[" + String(i) + "].id invalid");
    }
    if (scanFactsForKill(packet.measuredFacts, kill)) {
      const statement =
        typeof kill.statement === "string" && kill.statement.length > 0
          ? kill.statement
          : kill.id;
      return {
        ok: true,
        hit: true,
        killId: kill.id,
        statement:
          statement.length <= MAX_LONG_TEXT_LEN
            ? statement
            : statement.slice(0, MAX_LONG_TEXT_LEN),
      };
    }
    i += 1;
  }
  return { ok: true, hit: false };
}

function cloneForGate(packet: IssuePacket): IssuePacket {
  console.assert(packet !== null && packet !== undefined, "packet present");
  console.assert(Array.isArray(packet.measuredFacts), "facts array");
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

function appendKillNote(notes: string, killId: string): string {
  console.assert(killId.length > 0, "killId for note");
  console.assert(typeof notes === "string", "notes string");
  const bit = "kill:" + killId + " triggered → STOP";
  const next = notes.length === 0 ? bit : notes + " | " + bit;
  if (next.length <= MAX_LONG_TEXT_LEN) return next;
  return next.slice(0, MAX_LONG_TEXT_LEN);
}

function pushKillResidue(
  residue: IssuePacket["residue"],
  killId: string,
  statement: string,
): void {
  console.assert(residue.length <= MAX_RESIDUE_ITEMS, "residue cap");
  console.assert(killId.length > 0, "killId for residue");
  if (residue.length >= MAX_RESIDUE_ITEMS) return;
  const id =
    ("kill:" + killId).length <= MAX_ID_LEN
      ? "kill:" + killId
      : ("kill:" + killId).slice(0, MAX_ID_LEN);
  residue.push({
    id,
    statement:
      statement.length <= MAX_LONG_TEXT_LEN
        ? statement
        : statement.slice(0, MAX_LONG_TEXT_LEN),
    evidence: "derived",
  });
}

/**
 * Pure gate apply: clone packet; on kill hit (or bad check) force STOP + note.
 * No-op clone when check ok and no hit.
 */
export function applyKillGate(
  pack: DomainPack,
  packet: IssuePacket,
): IssuePacket {
  console.assert(pack !== null && pack !== undefined, "pack present");
  console.assert(packet !== null && packet !== undefined, "packet present");
  const next = cloneForGate(packet);
  const check = checkKillConditions(pack, packet);
  if (!check.ok) {
    next.gate = "STOP";
    next.notes = appendKillNote(next.notes, "check-failed");
    return next;
  }
  if (!check.hit) return next;
  next.gate = "STOP";
  next.notes = appendKillNote(next.notes, check.killId);
  pushKillResidue(next.residue, check.killId, check.statement);
  return next;
}
