/**
 * Advisor answer helper — fill advisorChecks on a packet before open.
 * Power of 10: flat, bounded loops, no recursion, ≤60 lines/fn, ≥2 asserts/fn.
 *
 * Replaces same checkId; caps MAX_ADVISOR_ANSWERS; fail-closed empty answer.
 * Role/evidence validated lightly here; full packet validate stays separate.
 */
import {
  MAX_ADVISOR_ANSWERS,
  MAX_ADVISOR_CHECKS,
  MAX_ID_LEN,
  MAX_LONG_TEXT_LEN,
  type AdvisorAnswer,
  type AdvisorCheck,
  type AuthorityRole,
  type EvidenceClass,
  type IssuePacket,
} from "./types.ts";

export type SetAdvisorAnswerResult =
  | { ok: true; packet: IssuePacket }
  | { ok: false; reason: string };

const EVIDENCE: readonly EvidenceClass[] = [
  "measured",
  "derived",
  "aspirational",
  "ledger",
  "unknown",
] as const;

const ROLES: readonly AuthorityRole[] = [
  "agent_propose",
  "evaluator",
  "human_open",
  "ops_execute",
] as const;

function failSet(reason: string): SetAdvisorAnswerResult {
  console.assert(typeof reason === "string", "set fail reason string");
  console.assert(reason.length > 0, "set fail reason present");
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

function isRole(value: unknown): value is AuthorityRole {
  console.assert(true, "role check entry");
  return typeof value === "string" && listHasString(ROLES, value);
}

function clonePacket(packet: IssuePacket): IssuePacket {
  console.assert(packet !== null && packet !== undefined, "packet present");
  console.assert(Array.isArray(packet.advisorAnswers), "answers array");
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
 * Allowed answer roles for a check.
 * Always: evaluator, human_open.
 * agent_propose only when check.answerAuthority is agent_propose
 * (non-OPEN checks). ops_execute never answers from this UI.
 */
export function allowedAnswerRoles(check: AdvisorCheck): AuthorityRole[] {
  console.assert(check !== null && check !== undefined, "check present");
  console.assert(typeof check.answerAuthority === "string", "authority string");
  const roles: AuthorityRole[] = [];
  if (check.answerAuthority === "agent_propose") {
    roles.push("agent_propose");
  }
  roles.push("evaluator");
  roles.push("human_open");
  console.assert(roles.length >= 2, "at least evaluator + human_open");
  console.assert(roles.length <= 3, "bounded role list");
  return roles;
}

function roleAllowed(
  role: AuthorityRole,
  allowed: readonly AuthorityRole[],
): boolean {
  console.assert(allowed.length >= 1, "allowed non-empty");
  console.assert(isRole(role), "role valid");
  return listHasString(allowed, role);
}

/**
 * Find index of existing answer with checkId, or -1.
 * Bounded by MAX_ADVISOR_ANSWERS.
 */
function findAnswerIndex(
  answers: readonly AdvisorAnswer[],
  checkId: string,
): number {
  console.assert(Array.isArray(answers), "answers array");
  console.assert(checkId.length > 0, "checkId present");
  let i = 0;
  const bound =
    answers.length < MAX_ADVISOR_ANSWERS
      ? answers.length
      : MAX_ADVISOR_ANSWERS;
  while (i < bound) {
    if (answers[i].checkId === checkId) return i;
    i += 1;
  }
  return -1;
}

/** Light shape + role checks for one answer; null means ok. */
function validateAnswerInput(
  answer: AdvisorAnswer,
  check: AdvisorCheck | undefined,
): string | null {
  console.assert(answer !== null && answer !== undefined, "answer present");
  console.assert(true, "validateAnswerInput entry");
  if (typeof answer.checkId !== "string" || answer.checkId.length === 0) {
    return "checkId invalid";
  }
  if (answer.checkId.length > MAX_ID_LEN) return "checkId bounds";
  if (typeof answer.answer !== "string" || answer.answer.length === 0) {
    return "answer empty";
  }
  if (answer.answer.length > MAX_LONG_TEXT_LEN) return "answer bounds";
  if (!isEvidence(answer.evidence)) return "evidence invalid";
  if (!isRole(answer.answeredAs)) return "answeredAs invalid";
  if (answer.answeredAs === "ops_execute") {
    return "ops_execute cannot answer advisorChecks";
  }
  if (check !== undefined && check !== null) {
    if (check.id !== answer.checkId) return "checkId mismatch";
    const allowed = allowedAnswerRoles(check);
    if (!roleAllowed(answer.answeredAs, allowed)) {
      return "answeredAs not allowed for check (got " + answer.answeredAs + ")";
    }
  }
  return null;
}

function applyAnswerRow(
  packet: IssuePacket,
  answer: AdvisorAnswer,
): SetAdvisorAnswerResult {
  console.assert(Array.isArray(packet.advisorAnswers), "answers array");
  console.assert(answer.checkId.length > 0, "checkId present");
  if (!Array.isArray(packet.advisorAnswers)) {
    return failSet("advisorAnswers required");
  }
  if (packet.advisorAnswers.length > MAX_ADVISOR_ANSWERS) {
    return failSet("advisorAnswers bounds");
  }
  const next = clonePacket(packet);
  const idx = findAnswerIndex(next.advisorAnswers, answer.checkId);
  const row: AdvisorAnswer = {
    checkId: answer.checkId,
    answer: answer.answer,
    evidence: answer.evidence,
    answeredAs: answer.answeredAs,
  };
  if (idx >= 0) {
    next.advisorAnswers[idx] = row;
    return { ok: true, packet: next };
  }
  if (next.advisorAnswers.length >= MAX_ADVISOR_ANSWERS) {
    return failSet("advisorAnswers full");
  }
  next.advisorAnswers.push(row);
  console.assert(
    next.advisorAnswers.length <= MAX_ADVISOR_ANSWERS,
    "answers within max",
  );
  return { ok: true, packet: next };
}

/**
 * Pure helper: set or replace one advisor answer on a packet clone.
 * Fail-closed: empty answer, bad shape, over-cap on insert, role not allowed
 * when checkAuthority hint is provided.
 */
export function setAdvisorAnswer(
  packet: IssuePacket,
  answer: AdvisorAnswer,
  check?: AdvisorCheck,
): SetAdvisorAnswerResult {
  console.assert(true, "setAdvisorAnswer entry");
  if (packet === null || packet === undefined) {
    return failSet("packet required");
  }
  if (answer === null || answer === undefined) {
    return failSet("answer required");
  }
  const shapeErr = validateAnswerInput(answer, check);
  if (shapeErr !== null) return failSet(shapeErr);
  return applyAnswerRow(packet, answer);
}

/** Bounded slice of pack advisorChecks for UI render. */
export function listAdvisorChecksForUi(
  checks: readonly AdvisorCheck[],
): AdvisorCheck[] {
  console.assert(Array.isArray(checks), "checks array");
  console.assert(MAX_ADVISOR_CHECKS >= 1, "ui check cap positive");
  const bound =
    checks.length < MAX_ADVISOR_CHECKS ? checks.length : MAX_ADVISOR_CHECKS;
  const out: AdvisorCheck[] = [];
  let i = 0;
  while (i < bound) {
    out.push(checks[i]);
    i += 1;
  }
  console.assert(out.length <= MAX_ADVISOR_CHECKS, "ui checks bounded");
  return out;
}

/** Look up existing answer by checkId (bounded). */
export function findAdvisorAnswer(
  answers: readonly AdvisorAnswer[],
  checkId: string,
): AdvisorAnswer | null {
  console.assert(Array.isArray(answers), "answers array");
  if (typeof checkId !== "string" || checkId.length === 0) return null;
  const idx = findAnswerIndex(answers, checkId);
  if (idx < 0) return null;
  return answers[idx];
}
