/**
 * Runtime paths: propose / evaluate / open.
 * Power of 10: flat, bounded, asserted, no recursion, ≤60 lines/fn.
 * Fail-closed: agent_propose and evaluator never stamp OPEN_CANDIDATE.
 */
import {
  MAX_LONG_TEXT_LEN,
  PACKET_SCHEMA_VERSION,
  type AuthorityRole,
  type GateVerdict,
  type IssuePacket,
} from "./types.ts";
import { validateIssuePacket } from "./validate.ts";
import { lookupPack } from "./packs/registry.ts";
import {
  applyKillGate,
  checkKillConditions,
} from "./kill-check.ts";

export const MAX_EVAL_REASONS = 16;

export type ProposeResult =
  | { ok: true; packet: IssuePacket }
  | { ok: false; reason: string };

export type EvaluateVerdict = "PASS" | "FAIL" | "RESIDUE";

export type EvaluateResult =
  | {
      ok: true;
      verdict: EvaluateVerdict;
      reasons: string[];
      packet: IssuePacket;
    }
  | { ok: false; reason: string };

export type OpenResult =
  | { ok: true; packet: IssuePacket }
  | { ok: false; reason: string };

/** Input for propose; proposedBy is forced to agent_propose. */
export type ProposeInput = {
  packId: string;
  packVersion: string;
  subjectId: string;
  subjectLabel: string;
  measuredFacts: IssuePacket["measuredFacts"];
  outcomeClassId: string | null;
  designIntent: string | null;
  fieldObservation: string | null;
  advisorAnswers: IssuePacket["advisorAnswers"];
  residue: IssuePacket["residue"];
  notes: string;
  /** Requested gate; OPEN_CANDIDATE is rejected. Default STOP. */
  gate?: GateVerdict;
};

function failPropose(reason: string): ProposeResult {
  return { ok: false, reason };
}

function failEvaluate(reason: string): EvaluateResult {
  return { ok: false, reason };
}

function failOpen(reason: string): OpenResult {
  return { ok: false, reason };
}

function clonePacket(packet: IssuePacket): IssuePacket {
  console.assert(packet !== null && packet !== undefined, "packet present");
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

function pushReason(reasons: string[], text: string): void {
  console.assert(reasons.length <= MAX_EVAL_REASONS, "reasons cap");
  if (reasons.length >= MAX_EVAL_REASONS) return;
  reasons.push(text);
}

/**
 * Agent propose path. Forces proposedBy agent_propose.
 * Never allows gate OPEN_CANDIDATE.
 */
export function proposePacket(input: ProposeInput): ProposeResult {
  console.assert(input !== null && input !== undefined, "input present");
  const requested: GateVerdict =
    input.gate === undefined || input.gate === null ? "STOP" : input.gate;
  if (requested === "OPEN_CANDIDATE") {
    return failPropose(
      "anti-promotion: agent_propose cannot request OPEN_CANDIDATE",
    );
  }
  const packet: IssuePacket = {
    schemaVersion: PACKET_SCHEMA_VERSION,
    packId: input.packId,
    packVersion: input.packVersion,
    subjectId: input.subjectId,
    subjectLabel: input.subjectLabel,
    measuredFacts: input.measuredFacts.slice(),
    outcomeClassId: input.outcomeClassId,
    designIntent: input.designIntent,
    fieldObservation: input.fieldObservation,
    advisorAnswers: input.advisorAnswers.slice(),
    residue: input.residue.slice(),
    proposedBy: "agent_propose",
    gate: requested,
    notes: input.notes,
  };
  const validation = validateIssuePacket(packet);
  if (!validation.ok) {
    return failPropose(validation.reason);
  }
  return { ok: true, packet };
}

/**
 * Evaluator path. Scores without stamping OPEN_CANDIDATE.
 * FAIL if validate fails; RESIDUE if residue non-empty; else PASS.
 * Kill-condition gate runs last: triggered kill forces STOP + FAIL.
 */
export function evaluatePacket(packet: IssuePacket): EvaluateResult {
  console.assert(true, "evaluate entry");
  if (packet === null || packet === undefined) {
    return failEvaluate("packet required");
  }
  console.assert(packet.packId.length > 0, "packId present");
  const next = clonePacket(packet);
  if (next.gate === "OPEN_CANDIDATE") {
    next.gate = "STOP";
  }
  const note =
    next.notes.length === 0
      ? "evaluated by evaluator"
      : next.notes + " | evaluated by evaluator";
  next.notes =
    note.length <= MAX_LONG_TEXT_LEN ? note : note.slice(0, MAX_LONG_TEXT_LEN);

  const reasons: string[] = [];
  const validation = validateIssuePacket(next);
  if (!validation.ok) {
    pushReason(reasons, validation.reason);
    return { ok: true, verdict: "FAIL", reasons, packet: next };
  }
  let verdict: EvaluateVerdict = "PASS";
  if (next.residue.length > 0) {
    pushReason(reasons, "residue non-empty");
    verdict = "RESIDUE";
  } else {
    pushReason(reasons, "validate ok; residue empty");
  }
  return finishEvaluateWithKills(next, reasons, verdict);
}

/** Apply pack killConditions; cannot PASS past a triggered kill. */
function finishEvaluateWithKills(
  packet: IssuePacket,
  reasons: string[],
  verdict: EvaluateVerdict,
): EvaluateResult {
  console.assert(packet !== null && packet !== undefined, "packet present");
  console.assert(reasons.length <= MAX_EVAL_REASONS, "reasons bounded");
  const looked = lookupPack(packet.packId);
  if (!looked.ok) {
    pushReason(reasons, "kill-check: " + looked.reason);
    packet.gate = "STOP";
    return { ok: true, verdict: "FAIL", reasons, packet };
  }
  const check = checkKillConditions(looked.pack, packet);
  const gated = applyKillGate(looked.pack, packet);
  if (!check.ok) {
    pushReason(reasons, "kill-check: " + check.reason);
    return { ok: true, verdict: "FAIL", reasons, packet: gated };
  }
  if (check.hit) {
    pushReason(reasons, "kill:" + check.killId + " triggered");
    return { ok: true, verdict: "FAIL", reasons, packet: gated };
  }
  return { ok: true, verdict, reasons, packet: gated };
}

/**
 * Human OPEN path. Only human_open may produce OPEN_CANDIDATE.
 */
export function openCandidate(
  packet: IssuePacket,
  openedBy: AuthorityRole,
): OpenResult {
  if (packet === null || packet === undefined) {
    return failOpen("packet required");
  }
  if (openedBy !== "human_open") {
    return failOpen(
      "anti-promotion: only human_open may stamp OPEN_CANDIDATE (got " +
        openedBy +
        ")",
    );
  }
  const next = clonePacket(packet);
  next.proposedBy = "human_open";
  next.gate = "OPEN_CANDIDATE";
  const validation = validateIssuePacket(next);
  if (!validation.ok) {
    return failOpen(validation.reason);
  }
  return { ok: true, packet: next };
}
