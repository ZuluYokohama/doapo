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

export {
  MAX_SEALS,
  UI_LEDGER_CAP,
  createLedger,
  appendSeal,
  listSeals,
  tipDigest,
  computeSealDigest,
  sealFromPacket,
  appendOpenSeal,
  listRecentSeals,
  listSealsForSubject,
  countSealsForSubject,
  verifySealChain,
  type SealKind,
  type SealRecord,
  type SealAppendInput,
  type SealLedger,
  type AppendSealResult,
  type VerifyChainResult,
} from "./ledger.ts";

export {
  LEDGER_STORE_KEY,
  LEDGER_STORE_VERSION,
  LEDGER_STORE_MAX_BYTES,
  loadSessionLedger,
  saveSessionLedger,
  clearSessionLedger,
  parseStoredLedger,
  type LoadLedgerResult,
  type SaveLedgerResult,
} from "./ledger-store.ts";

export { BAKKEN_PACK } from "./packs/bakken.ts";
export { DUC_QUEUE_PACK } from "./packs/duc-queue.ts";

export {
  getPack,
  lookupPack,
  listPackIds,
  MAX_REGISTERED_PACKS,
  type PackLookupResult,
  type PackLookupOk,
  type PackLookupErr,
} from "./packs/registry.ts";

export {
  MAX_WELL_FACTS,
  wellToMeasuredFacts,
  wellSubjectId,
  buildPacketFromWell,
  type BuildPacketFromWellInput,
  type BuildPacketResult,
} from "./from-well.ts";

