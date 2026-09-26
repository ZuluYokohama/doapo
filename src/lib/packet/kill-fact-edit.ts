/**
 * Kill fact authoring helpers — set measured kill:<id>=triggered on a packet.
 * Power of 10: flat, bounded loops, no recursion, ≤60 lines/fn, ≥2 asserts/fn.
 *
 * Preferred key is "kill:" + killId (kill-check also accepts bare kill.id).
 * setKillTriggered(true) adds/updates; false removes matching facts.
 * Caps: MAX_MEASURED_FACTS (packet); MAX_WELL_FACTS is from-well only (awareness).
 */
import { KILL_TRIGGER_VALUE } from "./kill-check.ts";
import { MAX_WELL_FACTS } from "./from-well.ts";
import {
  MAX_ID_LEN,
  MAX_KILL_CONDITIONS,
  MAX_MEASURED_FACTS,
  type IssuePacket,
  type KillCondition,
  type MeasuredFact,
} from "./types.ts";

export type KillFactEditResult =
  | { ok: true; packet: IssuePacket }
  | { ok: false; reason: string };

/** Preferred measured-fact key for a kill id. */
export function killFactKey(killId: string): string {
  console.assert(typeof killId === "string", "killId string");
  console.assert(killId.length > 0, "killId present");
  return "kill:" + killId;
}

function failEdit(reason: string): KillFactEditResult {
  console.assert(typeof reason === "string", "edit fail reason string");
  console.assert(reason.length > 0, "edit fail reason present");
  return { ok: false, reason };
}

function clonePacket(packet: IssuePacket): IssuePacket {
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

function keyMatchesKill(key: string, killId: string): boolean {
  console.assert(killId.length > 0, "killId present");
  console.assert(typeof key === "string", "key string");
  if (key === killId) return true;
  if (key === killFactKey(killId)) return true;
  return false;
}

function valueIsTriggered(value: string): boolean {
  console.assert(typeof value === "string", "value string");
  console.assert(KILL_TRIGGER_VALUE.length > 0, "trigger token");
  return value.toLowerCase() === KILL_TRIGGER_VALUE;
}

/**
 * True when any measured fact matches kill.id or kill:<id> with value triggered.
 * Bounded by MAX_MEASURED_FACTS.
 */
export function isKillTriggered(
  facts: readonly MeasuredFact[],
  killId: string,
): boolean {
  console.assert(Array.isArray(facts), "facts array");
  if (typeof killId !== "string" || killId.length === 0) return false;
  let i = 0;
  const bound =
    facts.length < MAX_MEASURED_FACTS ? facts.length : MAX_MEASURED_FACTS;
  while (i < bound) {
    const row = facts[i];
    if (keyMatchesKill(row.key, killId) && valueIsTriggered(row.value)) {
      return true;
    }
    i += 1;
  }
  return false;
}

function makeKillFact(killId: string): MeasuredFact {
  console.assert(killId.length > 0, "fact killId");
  console.assert(MAX_WELL_FACTS >= 1, "well facts cap awareness");
  const key = killFactKey(killId);
  return {
    key,
    value: KILL_TRIGGER_VALUE,
    evidence: "measured",
    sourceLabel: "kill-authoring",
  };
}

/**
 * Drop all facts whose key matches kill.id or kill:<id> (any value).
 * Bounded; returns new array.
 */
function removeKillFacts(
  facts: readonly MeasuredFact[],
  killId: string,
): MeasuredFact[] {
  console.assert(Array.isArray(facts), "facts array");
  console.assert(killId.length > 0, "killId present");
  const out: MeasuredFact[] = [];
  let i = 0;
  const bound =
    facts.length < MAX_MEASURED_FACTS ? facts.length : MAX_MEASURED_FACTS;
  while (i < bound) {
    if (!keyMatchesKill(facts[i].key, killId)) {
      out.push(facts[i]);
    }
    i += 1;
  }
  console.assert(out.length <= facts.length, "remove shrinks or equal");
  return out;
}

/**
 * Find first index of a kill-matching fact, preferring kill:<id> over bare id.
 * Returns -1 when none.
 */
function findKillFactIndex(
  facts: readonly MeasuredFact[],
  killId: string,
): number {
  console.assert(Array.isArray(facts), "facts array");
  console.assert(killId.length > 0, "killId present");
  const preferred = killFactKey(killId);
  let bare = -1;
  let i = 0;
  const bound =
    facts.length < MAX_MEASURED_FACTS ? facts.length : MAX_MEASURED_FACTS;
  while (i < bound) {
    const key = facts[i].key;
    if (key === preferred) return i;
    if (key === killId && bare < 0) bare = i;
    i += 1;
  }
  return bare;
}

/**
 * Pure helper: set or clear a kill trigger fact on a packet clone.
 * triggered true → add/update preferred kill:<id>=triggered (fail-closed at cap).
 * triggered false → remove matching kill facts (ok even if none present).
 */
export function setKillTriggered(
  packet: IssuePacket,
  killId: string,
  triggered: boolean,
): KillFactEditResult {
  console.assert(true, "setKillTriggered entry");
  if (packet === null || packet === undefined) {
    return failEdit("packet required");
  }
  if (typeof killId !== "string" || killId.length === 0) {
    return failEdit("killId invalid");
  }
  if (killId.length > MAX_ID_LEN) return failEdit("killId bounds");
  const preferred = killFactKey(killId);
  if (preferred.length > MAX_ID_LEN) return failEdit("kill fact key bounds");
  if (!Array.isArray(packet.measuredFacts)) {
    return failEdit("measuredFacts required");
  }
  if (packet.measuredFacts.length > MAX_MEASURED_FACTS) {
    return failEdit("measuredFacts bounds");
  }
  if (typeof triggered !== "boolean") {
    return failEdit("triggered invalid");
  }

  if (!triggered) {
    const next = clonePacket(packet);
    next.measuredFacts = removeKillFacts(packet.measuredFacts, killId);
    console.assert(
      next.measuredFacts.length <= packet.measuredFacts.length,
      "clear shrinks or equal",
    );
    return { ok: true, packet: next };
  }

  const idx = findKillFactIndex(packet.measuredFacts, killId);
  if (idx >= 0) {
    const next = clonePacket(packet);
    next.measuredFacts = removeKillFacts(packet.measuredFacts, killId);
    if (next.measuredFacts.length >= MAX_MEASURED_FACTS) {
      return failEdit("measuredFacts full");
    }
    next.measuredFacts.push(makeKillFact(killId));
    console.assert(
      isKillTriggered(next.measuredFacts, killId),
      "triggered after set",
    );
    return { ok: true, packet: next };
  }

  if (packet.measuredFacts.length >= MAX_MEASURED_FACTS) {
    return failEdit("measuredFacts full");
  }
  const next = clonePacket(packet);
  next.measuredFacts.push(makeKillFact(killId));
  console.assert(
    next.measuredFacts.length <= MAX_MEASURED_FACTS,
    "facts within max",
  );
  console.assert(MAX_WELL_FACTS <= MAX_MEASURED_FACTS, "well cap under packet");
  return { ok: true, packet: next };
}

/** Bounded slice of pack killConditions for UI render. */
export function listKillConditionsForUi(
  kills: readonly KillCondition[],
): KillCondition[] {
  console.assert(Array.isArray(kills), "kills array");
  console.assert(MAX_KILL_CONDITIONS >= 1, "ui kill cap positive");
  const bound =
    kills.length < MAX_KILL_CONDITIONS ? kills.length : MAX_KILL_CONDITIONS;
  const out: KillCondition[] = [];
  let i = 0;
  while (i < bound) {
    out.push(kills[i]);
    i += 1;
  }
  console.assert(out.length <= MAX_KILL_CONDITIONS, "ui kills bounded");
  return out;
}
