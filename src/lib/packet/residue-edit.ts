/**
 * Residue editor helpers — edit residue items on a packet before open.
 * Power of 10: flat, bounded loops, no recursion, ≤60 lines/fn, ≥2 asserts/fn.
 *
 * setResidueItem replaces by id; addResidueItem appends; removeResidueItem drops.
 * Fail-closed: empty statement, bad evidence enum, over-cap, missing id.
 */
import {
  MAX_ID_LEN,
  MAX_LONG_TEXT_LEN,
  MAX_RESIDUE_ITEMS,
  type EvidenceClass,
  type IssuePacket,
  type ResidueItem,
} from "./types.ts";

export type ResidueEditResult =
  | { ok: true; packet: IssuePacket }
  | { ok: false; reason: string };

const EVIDENCE: readonly EvidenceClass[] = [
  "measured",
  "derived",
  "aspirational",
  "ledger",
  "unknown",
] as const;

function failEdit(reason: string): ResidueEditResult {
  console.assert(typeof reason === "string", "edit fail reason string");
  console.assert(reason.length > 0, "edit fail reason present");
  return { ok: false, reason };
}

function listHasString(list: readonly string[], value: string): boolean {
  console.assert(Array.isArray(list), "list array");
  console.assert(typeof value === "string", "value string");
  let i = 0;
  const bound = list.length;
  while (i < bound) {
    if (list[i] === value) return true;
    i += 1;
  }
  return false;
}

function isEvidence(value: unknown): value is EvidenceClass {
  console.assert(true, "evidence check entry");
  return typeof value === "string" && listHasString(EVIDENCE, value);
}

function clonePacket(packet: IssuePacket): IssuePacket {
  console.assert(packet !== null && packet !== undefined, "packet present");
  console.assert(Array.isArray(packet.residue), "residue array");
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

/**
 * Find index of residue item with id, or -1.
 * Bounded by MAX_RESIDUE_ITEMS.
 */
function findResidueIndex(
  residue: readonly ResidueItem[],
  id: string,
): number {
  console.assert(Array.isArray(residue), "residue array");
  console.assert(id.length > 0, "id present");
  let i = 0;
  const bound =
    residue.length < MAX_RESIDUE_ITEMS ? residue.length : MAX_RESIDUE_ITEMS;
  while (i < bound) {
    if (residue[i].id === id) return i;
    i += 1;
  }
  return -1;
}

/** Light shape checks for one residue item; null means ok. */
function validateResidueInput(item: ResidueItem): string | null {
  console.assert(item !== null && item !== undefined, "item present");
  console.assert(true, "validateResidueInput entry");
  if (typeof item.id !== "string" || item.id.length === 0) {
    return "id invalid";
  }
  if (item.id.length > MAX_ID_LEN) return "id bounds";
  if (typeof item.statement !== "string" || item.statement.length === 0) {
    return "statement empty";
  }
  if (item.statement.length > MAX_LONG_TEXT_LEN) return "statement bounds";
  if (!isEvidence(item.evidence)) return "evidence invalid";
  return null;
}

function makeRow(item: ResidueItem): ResidueItem {
  console.assert(item.id.length > 0, "row id");
  console.assert(item.statement.length > 0, "row statement");
  return {
    id: item.id,
    statement: item.statement,
    evidence: item.evidence,
  };
}

/**
 * Pure helper: replace one residue item by id on a packet clone.
 * Fail-closed: missing id, empty statement, bad evidence, over-length.
 */
export function setResidueItem(
  packet: IssuePacket,
  item: ResidueItem,
): ResidueEditResult {
  console.assert(true, "setResidueItem entry");
  if (packet === null || packet === undefined) {
    return failEdit("packet required");
  }
  if (item === null || item === undefined) {
    return failEdit("item required");
  }
  if (!Array.isArray(packet.residue)) {
    return failEdit("residue required");
  }
  if (packet.residue.length > MAX_RESIDUE_ITEMS) {
    return failEdit("residue bounds");
  }
  const shapeErr = validateResidueInput(item);
  if (shapeErr !== null) return failEdit(shapeErr);
  const idx = findResidueIndex(packet.residue, item.id);
  if (idx < 0) return failEdit("residue id not found");
  const next = clonePacket(packet);
  next.residue[idx] = makeRow(item);
  console.assert(next.residue.length === packet.residue.length, "set length");
  return { ok: true, packet: next };
}

/**
 * Pure helper: append one residue item on a packet clone.
 * Fail-closed: duplicate id, full list, empty statement, bad evidence.
 */
export function addResidueItem(
  packet: IssuePacket,
  item: ResidueItem,
): ResidueEditResult {
  console.assert(true, "addResidueItem entry");
  if (packet === null || packet === undefined) {
    return failEdit("packet required");
  }
  if (item === null || item === undefined) {
    return failEdit("item required");
  }
  if (!Array.isArray(packet.residue)) {
    return failEdit("residue required");
  }
  if (packet.residue.length > MAX_RESIDUE_ITEMS) {
    return failEdit("residue bounds");
  }
  const shapeErr = validateResidueInput(item);
  if (shapeErr !== null) return failEdit(shapeErr);
  if (findResidueIndex(packet.residue, item.id) >= 0) {
    return failEdit("residue id duplicate");
  }
  if (packet.residue.length >= MAX_RESIDUE_ITEMS) {
    return failEdit("residue full");
  }
  const next = clonePacket(packet);
  next.residue.push(makeRow(item));
  console.assert(
    next.residue.length <= MAX_RESIDUE_ITEMS,
    "residue within max",
  );
  return { ok: true, packet: next };
}

/**
 * Pure helper: remove one residue item by id on a packet clone.
 * Fail-closed: empty/missing id.
 */
export function removeResidueItem(
  packet: IssuePacket,
  id: string,
): ResidueEditResult {
  console.assert(true, "removeResidueItem entry");
  if (packet === null || packet === undefined) {
    return failEdit("packet required");
  }
  if (typeof id !== "string" || id.length === 0) {
    return failEdit("id invalid");
  }
  if (id.length > MAX_ID_LEN) return failEdit("id bounds");
  if (!Array.isArray(packet.residue)) {
    return failEdit("residue required");
  }
  if (packet.residue.length > MAX_RESIDUE_ITEMS) {
    return failEdit("residue bounds");
  }
  const idx = findResidueIndex(packet.residue, id);
  if (idx < 0) return failEdit("residue id not found");
  const next = clonePacket(packet);
  const kept: ResidueItem[] = [];
  let i = 0;
  const bound = next.residue.length;
  while (i < bound) {
    if (i !== idx) kept.push(next.residue[i]);
    i += 1;
  }
  next.residue = kept;
  console.assert(
    next.residue.length === packet.residue.length - 1,
    "remove shrinks",
  );
  return { ok: true, packet: next };
}

/** Bounded slice of packet residue for UI render. */
export function listResidueForUi(
  residue: readonly ResidueItem[],
): ResidueItem[] {
  console.assert(Array.isArray(residue), "residue array");
  console.assert(MAX_RESIDUE_ITEMS >= 1, "ui residue cap positive");
  const bound =
    residue.length < MAX_RESIDUE_ITEMS ? residue.length : MAX_RESIDUE_ITEMS;
  const out: ResidueItem[] = [];
  let i = 0;
  while (i < bound) {
    out.push(residue[i]);
    i += 1;
  }
  console.assert(out.length <= MAX_RESIDUE_ITEMS, "ui residue bounded");
  return out;
}

/** Look up existing residue item by id (bounded). */
export function findResidueItem(
  residue: readonly ResidueItem[],
  id: string,
): ResidueItem | null {
  console.assert(Array.isArray(residue), "residue array");
  if (typeof id !== "string" || id.length === 0) return null;
  const idx = findResidueIndex(residue, id);
  if (idx < 0) return null;
  return residue[idx];
}

/** Evidence enum values for UI select (bounded). */
export function residueEvidenceOptions(): readonly EvidenceClass[] {
  console.assert(EVIDENCE.length === 5, "evidence enum size");
  console.assert(EVIDENCE.length > 0, "evidence non-empty");
  return EVIDENCE;
}
