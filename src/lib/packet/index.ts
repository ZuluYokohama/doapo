export {
  PACKET_SCHEMA_VERSION,
  MAX_OUTCOME_CLASSES,
  MAX_ADVISOR_CHECKS,
  MAX_RESIDUE_ITEMS,
  MAX_KILL_CONDITIONS,
  MAX_MEASURED_FACTS,
  MAX_ADVISOR_ANSWERS,
  MAX_SOURCE_REFS,
  MAX_ID_LEN,
  MAX_TEXT_LEN,
  MAX_LONG_TEXT_LEN,
} from "./types.ts";

export type {
  EvidenceClass,
  GateVerdict,
  AuthorityRole,
  TruthLayerId,
  SourceRef,
  OutcomeClass,
  AdvisorCheck,
  ResidueItem,
  KillCondition,
  DomainPack,
  MeasuredFact,
  AdvisorAnswer,
  IssuePacket,
} from "./types.ts";

export {
  validateDomainPack,
  validateIssuePacket,
  type ValidateResult,
  type ValidateOk,
  type ValidateErr,
} from "./validate.ts";

export {
  MAX_EVAL_REASONS,
  proposePacket,
  evaluatePacket,
  openCandidate,
  type ProposeInput,
  type ProposeResult,
  type EvaluateVerdict,
  type EvaluateResult,
  type OpenResult,
} from "./roles.ts";

export { BAKKEN_PACK } from "./packs/bakken.ts";

export {
  getPack,
  lookupPack,
  listPackIds,
  MAX_REGISTERED_PACKS,
  type PackLookupResult,
  type PackLookupOk,
  type PackLookupErr,
} from "./packs/registry.ts";
