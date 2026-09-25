/**
 * Pure display model for the read-only packet inspector.
 * Power of 10: flat slices with explicit caps, no recursion.
 */
import {
  MAX_KILL_CONDITIONS,
  MAX_MEASURED_FACTS,
  MAX_RESIDUE_ITEMS,
  MAX_SOURCE_REFS,
  type DomainPack,
  type EvidenceClass,
  type GateVerdict,
  type IssuePacket,
  type AuthorityRole,
} from "../lib/packet/index.ts";

export type InspectorFactRow = {
  key: string;
  value: string;
  evidence: EvidenceClass;
  sourceLabel: string;
};

export type InspectorResidueRow = {
  id: string;
  statement: string;
  evidence: EvidenceClass;
};

export type InspectorKillRow = {
  id: string;
  statement: string;
};

export type InspectorBenchmarkRow = {
  label: string;
  url: string;
  evidence: EvidenceClass;
};

export type InspectorModel = {
  packId: string;
  packVersion: string;
  packTitle: string;
  substrate: string;
  subjectId: string;
  subjectLabel: string;
  gate: GateVerdict;
  proposedBy: AuthorityRole;
  outcomeClassId: string | null;
  designIntent: string | null;
  fieldObservation: string | null;
  notes: string;
  facts: InspectorFactRow[];
  residue: InspectorResidueRow[];
  killConditions: InspectorKillRow[];
  arenaBenchmarks: InspectorBenchmarkRow[];
  factsTruncated: boolean;
  residueTruncated: boolean;
  killsTruncated: boolean;
  benchmarksTruncated: boolean;
};

function sliceFacts(packet: IssuePacket): {
  rows: InspectorFactRow[];
  truncated: boolean;
} {
  const source = packet.measuredFacts;
  const bound = source.length < MAX_MEASURED_FACTS ? source.length : MAX_MEASURED_FACTS;
  const rows: InspectorFactRow[] = [];
  let i = 0;
  while (i < bound) {
    const row = source[i];
    rows.push({
      key: row.key,
      value: row.value,
      evidence: row.evidence,
      sourceLabel: row.sourceLabel,
    });
    i += 1;
  }
  return { rows, truncated: source.length > MAX_MEASURED_FACTS };
}

function sliceResidue(packet: IssuePacket): {
  rows: InspectorResidueRow[];
  truncated: boolean;
} {
  const source = packet.residue;
  const bound = source.length < MAX_RESIDUE_ITEMS ? source.length : MAX_RESIDUE_ITEMS;
  const rows: InspectorResidueRow[] = [];
  let i = 0;
  while (i < bound) {
    const row = source[i];
    rows.push({
      id: row.id,
      statement: row.statement,
      evidence: row.evidence,
    });
    i += 1;
  }
  return { rows, truncated: source.length > MAX_RESIDUE_ITEMS };
}

function sliceKills(pack: DomainPack): {
  rows: InspectorKillRow[];
  truncated: boolean;
} {
  const source = pack.killConditions;
  const bound = source.length < MAX_KILL_CONDITIONS ? source.length : MAX_KILL_CONDITIONS;
  const rows: InspectorKillRow[] = [];
  let i = 0;
  while (i < bound) {
    const row = source[i];
    rows.push({ id: row.id, statement: row.statement });
    i += 1;
  }
  return { rows, truncated: source.length > MAX_KILL_CONDITIONS };
}

function sliceBenchmarks(pack: DomainPack): {
  rows: InspectorBenchmarkRow[];
  truncated: boolean;
} {
  const source = pack.arenaBenchmarks;
  const bound = source.length < MAX_SOURCE_REFS ? source.length : MAX_SOURCE_REFS;
  const rows: InspectorBenchmarkRow[] = [];
  let i = 0;
  while (i < bound) {
    const row = source[i];
    rows.push({
      label: row.label,
      url: row.url,
      evidence: row.evidence,
    });
    i += 1;
  }
  return { rows, truncated: source.length > MAX_SOURCE_REFS };
}

/** Build a bounded, read-only view model from pack + packet. */
export function buildInspectorModel(
  pack: DomainPack,
  packet: IssuePacket,
): InspectorModel {
  console.assert(pack !== null && pack !== undefined, "pack present");
  console.assert(packet !== null && packet !== undefined, "packet present");
  const facts = sliceFacts(packet);
  const residue = sliceResidue(packet);
  const kills = sliceKills(pack);
  const benchmarks = sliceBenchmarks(pack);
  return {
    packId: pack.id,
    packVersion: pack.version,
    packTitle: pack.title,
    substrate: pack.substrate,
    subjectId: packet.subjectId,
    subjectLabel: packet.subjectLabel,
    gate: packet.gate,
    proposedBy: packet.proposedBy,
    outcomeClassId: packet.outcomeClassId,
    designIntent: packet.designIntent,
    fieldObservation: packet.fieldObservation,
    notes: packet.notes,
    facts: facts.rows,
    residue: residue.rows,
    killConditions: kills.rows,
    arenaBenchmarks: benchmarks.rows,
    factsTruncated: facts.truncated,
    residueTruncated: residue.truncated,
    killsTruncated: kills.truncated,
    benchmarksTruncated: benchmarks.truncated,
  };
}
