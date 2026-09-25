/**
 * Multi-domain issue-resolution packet schema.
 * Power of 10: flat control flow, bounded sizes, no recursion.
 */

export const PACKET_SCHEMA_VERSION = "1.0.0" as const;

export const MAX_OUTCOME_CLASSES = 32;
export const MAX_ADVISOR_CHECKS = 64;
export const MAX_RESIDUE_ITEMS = 64;
export const MAX_KILL_CONDITIONS = 32;
export const MAX_MEASURED_FACTS = 128;
export const MAX_ADVISOR_ANSWERS = 64;
export const MAX_SOURCE_REFS = 16;
export const MAX_ID_LEN = 64;
export const MAX_TEXT_LEN = 512;
export const MAX_LONG_TEXT_LEN = 2048;

export type EvidenceClass =
  | "measured"
  | "derived"
  | "aspirational"
  | "ledger"
  | "unknown";

export type GateVerdict =
  | "OPEN_CANDIDATE"
  | "STOP"
  | "RESIDUE"
  | "ABSTAIN";

export type AuthorityRole =
  | "agent_propose"
  | "evaluator"
  | "human_open"
  | "ops_execute";

/** Four-layer truth separation (arena pattern; not any vendor SOP). */
export type TruthLayerId =
  | "design"
  | "control_envelope"
  | "field_data"
  | "authorized_action";

export type SourceRef = {
  label: string;
  url: string;
  evidence: EvidenceClass;
};

export type OutcomeClass = {
  id: string;
  label: string;
  short: string;
  /** Domain status codes that map into this class (e.g. NDIC). */
  statusCodes: string[];
};

export type AdvisorCheck = {
  id: string;
  prompt: string;
  layer: TruthLayerId;
  /** Role that may answer; human_open required for OPEN. */
  answerAuthority: AuthorityRole;
};

export type ResidueItem = {
  id: string;
  statement: string;
  evidence: EvidenceClass;
};

export type KillCondition = {
  id: string;
  statement: string;
};

export type DomainPack = {
  schemaVersion: typeof PACKET_SCHEMA_VERSION;
  id: string;
  version: string;
  title: string;
  /** One sentence: what measured substrate this pack reads. */
  substrate: string;
  outcomeClasses: OutcomeClass[];
  advisorChecks: AdvisorCheck[];
  residueDefaults: ResidueItem[];
  killConditions: KillCondition[];
  /**
   * Arena / leading-player references used as public benchmarks only.
   * Never treat as employer, partner, or controlling SOP.
   */
  arenaBenchmarks: SourceRef[];
};

export type MeasuredFact = {
  key: string;
  value: string;
  evidence: EvidenceClass;
  sourceLabel: string;
};

export type AdvisorAnswer = {
  checkId: string;
  answer: string;
  evidence: EvidenceClass;
  answeredAs: AuthorityRole;
};

export type IssuePacket = {
  schemaVersion: typeof PACKET_SCHEMA_VERSION;
  packId: string;
  packVersion: string;
  subjectId: string;
  subjectLabel: string;
  measuredFacts: MeasuredFact[];
  outcomeClassId: string | null;
  designIntent: string | null;
  fieldObservation: string | null;
  advisorAnswers: AdvisorAnswer[];
  residue: ResidueItem[];
  proposedBy: AuthorityRole;
  gate: GateVerdict;
  notes: string;
};
