import {
  MAX_ADVISOR_ANSWERS,
  MAX_ADVISOR_CHECKS,
  MAX_ID_LEN,
  MAX_KILL_CONDITIONS,
  MAX_LONG_TEXT_LEN,
  MAX_MEASURED_FACTS,
  MAX_OUTCOME_CLASSES,
  MAX_RESIDUE_ITEMS,
  MAX_SOURCE_REFS,
  MAX_TEXT_LEN,
  PACKET_SCHEMA_VERSION,
  type AdvisorAnswer,
  type AdvisorCheck,
  type AuthorityRole,
  type DomainPack,
  type EvidenceClass,
  type GateVerdict,
  type IssuePacket,
  type KillCondition,
  type MeasuredFact,
  type OutcomeClass,
  type ResidueItem,
  type SourceRef,
  type TruthLayerId,
} from "./types.ts";

export type ValidateOk = { ok: true };
export type ValidateErr = { ok: false; reason: string };
export type ValidateResult = ValidateOk | ValidateErr;

const EVIDENCE: readonly EvidenceClass[] = [
  "measured",
  "derived",
  "aspirational",
  "ledger",
  "unknown",
] as const;

const GATES: readonly GateVerdict[] = [
  "OPEN_CANDIDATE",
  "STOP",
  "RESIDUE",
  "ABSTAIN",
] as const;

const LAYERS: readonly TruthLayerId[] = [
  "design",
  "control_envelope",
  "field_data",
  "authorized_action",
] as const;

const ROLES: readonly AuthorityRole[] = [
  "agent_propose",
  "evaluator",
  "human_open",
  "ops_execute",
] as const;

function fail(reason: string): ValidateErr {
  return { ok: false, reason };
}

function ok(): ValidateOk {
  return { ok: true };
}

function isNonEmptyString(value: unknown, max: number): boolean {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function listHasString(list: readonly string[], value: string): boolean {
  let i = 0;
  const bound = list.length;
  while (i < bound) {
    if (list[i] === value) return true;
    i += 1;
  }
  return false;
}

function isEvidence(value: unknown): value is EvidenceClass {
  return typeof value === "string" && listHasString(EVIDENCE, value);
}

function isGate(value: unknown): value is GateVerdict {
  return typeof value === "string" && listHasString(GATES, value);
}

function isLayer(value: unknown): value is TruthLayerId {
  return typeof value === "string" && listHasString(LAYERS, value);
}

function isRole(value: unknown): value is AuthorityRole {
  return typeof value === "string" && listHasString(ROLES, value);
}

function validateOutcomeClass(row: OutcomeClass, index: number): ValidateResult {
  console.assert(index >= 0, "outcome index >= 0");
  console.assert(index < MAX_OUTCOME_CLASSES, "outcome index in range");
  if (!isNonEmptyString(row.id, MAX_ID_LEN)) {
    return fail(`outcomeClasses[${index}].id invalid`);
  }
  if (!isNonEmptyString(row.label, MAX_TEXT_LEN)) {
    return fail(`outcomeClasses[${index}].label invalid`);
  }
  if (!isNonEmptyString(row.short, MAX_ID_LEN)) {
    return fail(`outcomeClasses[${index}].short invalid`);
  }
  if (!Array.isArray(row.statusCodes) || row.statusCodes.length > 32) {
    return fail(`outcomeClasses[${index}].statusCodes invalid`);
  }
  let j = 0;
  while (j < row.statusCodes.length) {
    if (!isNonEmptyString(row.statusCodes[j], MAX_ID_LEN)) {
      return fail(`outcomeClasses[${index}].statusCodes[${j}] invalid`);
    }
    j += 1;
  }
  return ok();
}

function validateAdvisorCheck(row: AdvisorCheck, index: number): ValidateResult {
  console.assert(index >= 0, "advisor index >= 0");
  if (!isNonEmptyString(row.id, MAX_ID_LEN)) {
    return fail(`advisorChecks[${index}].id invalid`);
  }
  if (!isNonEmptyString(row.prompt, MAX_LONG_TEXT_LEN)) {
    return fail(`advisorChecks[${index}].prompt invalid`);
  }
  if (!isLayer(row.layer)) {
    return fail(`advisorChecks[${index}].layer invalid`);
  }
  if (!isRole(row.answerAuthority)) {
    return fail(`advisorChecks[${index}].answerAuthority invalid`);
  }
  return ok();
}

function validateResidue(row: ResidueItem, index: number, path: string): ValidateResult {
  if (!isNonEmptyString(row.id, MAX_ID_LEN)) {
    return fail(`${path}[${index}].id invalid`);
  }
  if (!isNonEmptyString(row.statement, MAX_LONG_TEXT_LEN)) {
    return fail(`${path}[${index}].statement invalid`);
  }
  if (!isEvidence(row.evidence)) {
    return fail(`${path}[${index}].evidence invalid`);
  }
  return ok();
}

function validateKill(row: KillCondition, index: number): ValidateResult {
  if (!isNonEmptyString(row.id, MAX_ID_LEN)) {
    return fail(`killConditions[${index}].id invalid`);
  }
  if (!isNonEmptyString(row.statement, MAX_LONG_TEXT_LEN)) {
    return fail(`killConditions[${index}].statement invalid`);
  }
  return ok();
}

function validateSource(row: SourceRef, index: number): ValidateResult {
  if (!isNonEmptyString(row.label, MAX_TEXT_LEN)) {
    return fail(`publicSources[${index}].label invalid`);
  }
  if (!isNonEmptyString(row.url, MAX_LONG_TEXT_LEN)) {
    return fail(`publicSources[${index}].url invalid`);
  }
  if (!isEvidence(row.evidence)) {
    return fail(`publicSources[${index}].evidence invalid`);
  }
  return ok();
}

export function validateDomainPack(pack: DomainPack): ValidateResult {
  console.assert(pack !== null && pack !== undefined, "pack present");
  if (pack.schemaVersion !== PACKET_SCHEMA_VERSION) {
    return fail("schemaVersion mismatch");
  }
  if (!isNonEmptyString(pack.id, MAX_ID_LEN)) return fail("id invalid");
  if (!isNonEmptyString(pack.version, MAX_ID_LEN)) return fail("version invalid");
  if (!isNonEmptyString(pack.title, MAX_TEXT_LEN)) return fail("title invalid");
  if (!isNonEmptyString(pack.substrate, MAX_LONG_TEXT_LEN)) {
    return fail("substrate invalid");
  }

  if (
    !Array.isArray(pack.outcomeClasses) ||
    pack.outcomeClasses.length < 1 ||
    pack.outcomeClasses.length > MAX_OUTCOME_CLASSES
  ) {
    return fail("outcomeClasses bounds");
  }
  let i = 0;
  while (i < pack.outcomeClasses.length) {
    const rowResult = validateOutcomeClass(pack.outcomeClasses[i], i);
    if (!rowResult.ok) return rowResult;
    i += 1;
  }

  if (
    !Array.isArray(pack.advisorChecks) ||
    pack.advisorChecks.length > MAX_ADVISOR_CHECKS
  ) {
    return fail("advisorChecks bounds");
  }
  i = 0;
  while (i < pack.advisorChecks.length) {
    const rowResult = validateAdvisorCheck(pack.advisorChecks[i], i);
    if (!rowResult.ok) return rowResult;
    i += 1;
  }

  if (
    !Array.isArray(pack.residueDefaults) ||
    pack.residueDefaults.length > MAX_RESIDUE_ITEMS
  ) {
    return fail("residueDefaults bounds");
  }
  i = 0;
  while (i < pack.residueDefaults.length) {
    const rowResult = validateResidue(pack.residueDefaults[i], i, "residueDefaults");
    if (!rowResult.ok) return rowResult;
    i += 1;
  }

  if (
    !Array.isArray(pack.killConditions) ||
    pack.killConditions.length < 1 ||
    pack.killConditions.length > MAX_KILL_CONDITIONS
  ) {
    return fail("killConditions bounds");
  }
  i = 0;
  while (i < pack.killConditions.length) {
    const rowResult = validateKill(pack.killConditions[i], i);
    if (!rowResult.ok) return rowResult;
    i += 1;
  }

  if (
    !Array.isArray(pack.publicSources) ||
    pack.publicSources.length > MAX_SOURCE_REFS
  ) {
    return fail("publicSources bounds");
  }
  i = 0;
  while (i < pack.publicSources.length) {
    const rowResult = validateSource(pack.publicSources[i], i);
    if (!rowResult.ok) return rowResult;
    i += 1;
  }

  return ok();
}

function validateFact(row: MeasuredFact, index: number): ValidateResult {
  if (!isNonEmptyString(row.key, MAX_ID_LEN)) {
    return fail(`measuredFacts[${index}].key invalid`);
  }
  if (!isNonEmptyString(row.value, MAX_LONG_TEXT_LEN)) {
    return fail(`measuredFacts[${index}].value invalid`);
  }
  if (!isEvidence(row.evidence)) {
    return fail(`measuredFacts[${index}].evidence invalid`);
  }
  if (!isNonEmptyString(row.sourceLabel, MAX_TEXT_LEN)) {
    return fail(`measuredFacts[${index}].sourceLabel invalid`);
  }
  return ok();
}

function validateAnswer(row: AdvisorAnswer, index: number): ValidateResult {
  if (!isNonEmptyString(row.checkId, MAX_ID_LEN)) {
    return fail(`advisorAnswers[${index}].checkId invalid`);
  }
  if (!isNonEmptyString(row.answer, MAX_LONG_TEXT_LEN)) {
    return fail(`advisorAnswers[${index}].answer invalid`);
  }
  if (!isEvidence(row.evidence)) {
    return fail(`advisorAnswers[${index}].evidence invalid`);
  }
  if (!isRole(row.answeredAs)) {
    return fail(`advisorAnswers[${index}].answeredAs invalid`);
  }
  return ok();
}

/** Fail-closed: agent_propose may never stamp OPEN_CANDIDATE. */
export function validateIssuePacket(packet: IssuePacket): ValidateResult {
  console.assert(packet !== null && packet !== undefined, "packet present");
  if (packet.schemaVersion !== PACKET_SCHEMA_VERSION) {
    return fail("schemaVersion mismatch");
  }
  if (!isNonEmptyString(packet.packId, MAX_ID_LEN)) return fail("packId invalid");
  if (!isNonEmptyString(packet.packVersion, MAX_ID_LEN)) {
    return fail("packVersion invalid");
  }
  if (!isNonEmptyString(packet.subjectId, MAX_ID_LEN)) {
    return fail("subjectId invalid");
  }
  if (!isNonEmptyString(packet.subjectLabel, MAX_TEXT_LEN)) {
    return fail("subjectLabel invalid");
  }
  if (
    packet.outcomeClassId !== null &&
    !isNonEmptyString(packet.outcomeClassId, MAX_ID_LEN)
  ) {
    return fail("outcomeClassId invalid");
  }
  if (
    packet.designIntent !== null &&
    !isNonEmptyString(packet.designIntent, MAX_LONG_TEXT_LEN)
  ) {
    return fail("designIntent invalid");
  }
  if (
    packet.fieldObservation !== null &&
    !isNonEmptyString(packet.fieldObservation, MAX_LONG_TEXT_LEN)
  ) {
    return fail("fieldObservation invalid");
  }
  if (typeof packet.notes !== "string" || packet.notes.length > MAX_LONG_TEXT_LEN) {
    return fail("notes invalid");
  }
  if (!isGate(packet.gate)) return fail("gate invalid");
  if (!isRole(packet.proposedBy)) return fail("proposedBy invalid");

  if (packet.proposedBy === "agent_propose" && packet.gate === "OPEN_CANDIDATE") {
    return fail("anti-promotion: agent_propose cannot stamp OPEN_CANDIDATE");
  }

  if (
    !Array.isArray(packet.measuredFacts) ||
    packet.measuredFacts.length > MAX_MEASURED_FACTS
  ) {
    return fail("measuredFacts bounds");
  }
  let i = 0;
  while (i < packet.measuredFacts.length) {
    const rowResult = validateFact(packet.measuredFacts[i], i);
    if (!rowResult.ok) return rowResult;
    i += 1;
  }

  if (
    !Array.isArray(packet.advisorAnswers) ||
    packet.advisorAnswers.length > MAX_ADVISOR_ANSWERS
  ) {
    return fail("advisorAnswers bounds");
  }
  i = 0;
  while (i < packet.advisorAnswers.length) {
    const rowResult = validateAnswer(packet.advisorAnswers[i], i);
    if (!rowResult.ok) return rowResult;
    i += 1;
  }

  if (!Array.isArray(packet.residue) || packet.residue.length > MAX_RESIDUE_ITEMS) {
    return fail("residue bounds");
  }
  i = 0;
  while (i < packet.residue.length) {
    const rowResult = validateResidue(packet.residue[i], i, "residue");
    if (!rowResult.ok) return rowResult;
    i += 1;
  }

  return ok();
}
