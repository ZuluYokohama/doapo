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
  KILL_TRIGGER_VALUE,
  checkKillConditions,
  applyKillGate,
  buildKillHaystack,
  type KillCheckResult,
} from "./kill-check.ts";

export {
  MAX_KILL_SCAN_WELLS,
  scanWellsForKills,
  listKillScanHits,
  type KillScanRow,
  type ScanWellsForKillsInput,
  type ScanWellsForKillsResult,
} from "./kill-scan.ts";

export {
  KILL_SCAN_SCHEMA_VERSION,
  DEFAULT_KILL_SCAN_EXPORT_NOTES,
  MAX_KILL_SCAN_JSON_CHARS,
  exportKillScan,
  importKillScan,
  killScanFilename,
  type KillScanBundle,
  type ExportKillScanResult,
  type ExportKillScanInput,
  type ImportKillScanResult,
  type ImportKillScanOk,
  type ImportKillScanErr,
} from "./kill-scan-export.ts";

export {
  MAX_COHORT_WELLS,
  summarizeOutcomeCohort,
  type CohortClassCount,
  type SummarizeOutcomeCohortInput,
  type SummarizeOutcomeCohortResult,
} from "./outcome-cohort.ts";

export {
  COHORT_SCHEMA_VERSION,
  DEFAULT_COHORT_EXPORT_NOTES,
  MAX_COHORT_JSON_CHARS,
  exportOutcomeCohort,
  importOutcomeCohort,
  cohortFilename,
  type OutcomeCohortBundle,
  type ExportOutcomeCohortResult,
  type ExportOutcomeCohortInput,
  type ImportOutcomeCohortResult,
  type ImportOutcomeCohortOk,
  type ImportOutcomeCohortErr,
} from "./cohort-export.ts";

export {
  MAX_AUDIT_PACKS,
  auditKillsAcrossPacks,
  auditPacketKills,
  listKillAuditHits,
  listPacksForAudit,
  mergePacksForAudit,
  type KillAuditRow,
  type AuditKillsAcrossPacksInput,
  type AuditKillsAcrossPacksResult,
} from "./kill-audit.ts";

export {
  setAdvisorAnswer,
  allowedAnswerRoles,
  listAdvisorChecksForUi,
  findAdvisorAnswer,
  type SetAdvisorAnswerResult,
} from "./advisor-answer.ts";

export {
  setResidueItem,
  addResidueItem,
  removeResidueItem,
  listResidueForUi,
  findResidueItem,
  residueEvidenceOptions,
  type ResidueEditResult,
} from "./residue-edit.ts";

export {
  killFactKey,
  isKillTriggered,
  setKillTriggered,
  listKillConditionsForUi,
  type KillFactEditResult,
} from "./kill-fact-edit.ts";

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

export {
  LEDGER_DURABLE_KEY,
  LEDGER_DURABLE_OPT_IN_KEY,
  durableLedgerPresent,
  isDurableOptIn,
  loadDurableLedger,
  saveDurableLedger,
  clearDurableLedger,
  persistSessionToDurable,
  appendAndPersist,
  loadPreferredLedger,
} from "./ledger-durable.ts";

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
  MAX_PACK_JSON_CHARS,
  importPackFromJson,
  resolvePack,
  type ImportPackResult,
  type ImportPackOk,
  type ImportPackErr,
} from "./pack-import.ts";

export {
  MAX_WELL_FACTS,
  wellToMeasuredFacts,
  wellSubjectId,
  buildPacketFromWell,
  type BuildPacketFromWellInput,
  type BuildPacketResult,
} from "./from-well.ts";

export {
  EVIDENCE_SCHEMA_VERSION,
  EXPORT_SEAL_CAP,
  DEFAULT_EXPORT_NOTES,
  MAX_EVIDENCE_JSON_CHARS,
  exportPacketEvidence,
  importEvidenceBundle,
  evidenceFilename,
  type PacketEvidenceBundle,
  type ExportEvidenceResult,
  type ExportEvidenceInput,
  type ImportEvidenceResult,
  type ImportEvidenceOk,
  type ImportEvidenceErr,
} from "./evidence-export.ts";

export {
  MAX_EXPORT_SUBJECTS,
  MULTI_EVIDENCE_SCHEMA_VERSION,
  DEFAULT_MULTI_ZIP_FILENAME,
  MANIFEST_FILENAME,
  exportMultiSubjectEvidenceZip,
  buildStoreZip,
  type MultiSubjectManifestEntry,
  type MultiSubjectManifest,
  type ExportMultiSubjectInput,
  type ExportMultiSubjectResult,
} from "./evidence-zip.ts";
