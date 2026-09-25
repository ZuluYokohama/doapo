/**
 * Bind a live NDIC WellRow into an issue packet.
 * Power of 10: flat, bounded, asserted, no recursion, ≤60 lines/fn.
 * Fail-closed: only real WellRow fields; never invent oil/gas/water volumes.
 */
import {
  formatApi,
  formatSpud,
  outcomeOf,
  type WellRow,
} from "../outcomes.ts";
import {
  MAX_ID_LEN,
  MAX_MEASURED_FACTS,
  MAX_RESIDUE_ITEMS,
  MAX_TEXT_LEN,
  PACKET_SCHEMA_VERSION,
  type AuthorityRole,
  type DomainPack,
  type GateVerdict,
  type IssuePacket,
  type MeasuredFact,
  type ResidueItem,
} from "./types.ts";

const SOURCE_LABEL = "NDIC GIS";

/** Hard cap on facts emitted from one well (Power of 10). */
export const MAX_WELL_FACTS = 16;

export type BuildPacketFromWellInput = {
  well: WellRow;
  pack: DomainPack;
  proposedBy: AuthorityRole;
  gate: GateVerdict;
};

export type BuildPacketResult =
  | { ok: true; packet: IssuePacket }
  | { ok: false; reason: string };

function fail(reason: string): BuildPacketResult {
  return { ok: false, reason };
}

function pushFact(
  facts: MeasuredFact[],
  key: string,
  value: string,
): void {
  console.assert(facts.length < MAX_WELL_FACTS, "well facts under MAX_WELL_FACTS");
  console.assert(facts.length < MAX_MEASURED_FACTS, "well facts under MAX_MEASURED_FACTS");
  if (facts.length >= MAX_WELL_FACTS) return;
  if (value.length === 0) return;
  const clipped =
    value.length <= 2048 ? value : value.slice(0, 2048);
  facts.push({
    key,
    value: clipped,
    evidence: "measured",
    sourceLabel: SOURCE_LABEL,
  });
}

/**
 * Map only fields that exist on WellRow. Never emits oil/gas/water volumes.
 */
export function wellToMeasuredFacts(well: WellRow): MeasuredFact[] {
  console.assert(well !== null && well !== undefined, "well present");
  const facts: MeasuredFact[] = [];
  if (well.api != null && well.api.length > 0) {
    pushFact(facts, "api", well.api);
  }
  if (well.fileNo != null) {
    pushFact(facts, "fileNo", String(well.fileNo));
  }
  if (well.status != null && well.status.length > 0) {
    pushFact(facts, "status", well.status);
  }
  if (well.county != null && well.county.length > 0) {
    pushFact(facts, "county", well.county);
  }
  if (well.operator != null && well.operator.length > 0) {
    pushFact(facts, "operator", well.operator);
  }
  if (well.wellName != null && well.wellName.length > 0) {
    pushFact(facts, "wellName", well.wellName);
  }
  if (well.spud != null) {
    pushFact(facts, "spud", formatSpud(well.spud));
  }
  if (well.field != null && well.field.length > 0) {
    pushFact(facts, "field", well.field);
  }
  if (well.legal != null && well.legal.length > 0) {
    pushFact(facts, "legal", well.legal);
  }
  if (well.wellType != null && well.wellType.length > 0) {
    pushFact(facts, "wellType", well.wellType);
  }
  if (well.td != null) {
    pushFact(facts, "td", String(well.td));
  }
  if (well.lat != null) {
    pushFact(facts, "lat", String(well.lat));
  }
  if (well.lon != null) {
    pushFact(facts, "lon", String(well.lon));
  }
  console.assert(facts.length <= MAX_WELL_FACTS, "facts bounded");
  return facts;
}

function copyResidueDefaults(pack: DomainPack): ResidueItem[] {
  const out: ResidueItem[] = [];
  let i = 0;
  const bound = pack.residueDefaults.length;
  console.assert(bound <= MAX_RESIDUE_ITEMS, "residueDefaults in bound");
  while (i < bound && out.length < MAX_RESIDUE_ITEMS) {
    const row = pack.residueDefaults[i];
    out.push({
      id: row.id,
      statement: row.statement,
      evidence: row.evidence,
    });
    i += 1;
  }
  return out;
}

function outcomeInPack(pack: DomainPack, outcomeId: string): boolean {
  let i = 0;
  while (i < pack.outcomeClasses.length) {
    if (pack.outcomeClasses[i].id === outcomeId) return true;
    i += 1;
  }
  return false;
}

function resolveOutcomeClassId(
  well: WellRow,
  pack: DomainPack,
): string | null {
  const id = outcomeOf(well.status);
  if (id === null) return null;
  if (!outcomeInPack(pack, id)) return null;
  return id;
}

function subjectFromWell(well: WellRow): { id: string; label: string } | null {
  if (well.api != null && well.api.length > 0) {
    const digits = well.api.replace(/\D/g, "");
    const id =
      digits.length > 0
        ? digits.slice(0, MAX_ID_LEN)
        : well.api.slice(0, MAX_ID_LEN);
    if (id.length === 0) return null;
    const labelRaw =
      well.wellName != null && well.wellName.length > 0
        ? well.wellName
        : formatApi(well.api);
    const label =
      labelRaw.length <= MAX_TEXT_LEN
        ? labelRaw
        : labelRaw.slice(0, MAX_TEXT_LEN);
    if (label.length === 0) return null;
    return { id, label };
  }
  if (well.fileNo != null) {
    const id = ("file-" + String(well.fileNo)).slice(0, MAX_ID_LEN);
    const labelRaw =
      well.wellName != null && well.wellName.length > 0
        ? well.wellName
        : "File " + String(well.fileNo);
    const label =
      labelRaw.length <= MAX_TEXT_LEN
        ? labelRaw
        : labelRaw.slice(0, MAX_TEXT_LEN);
    if (label.length === 0) return null;
    return { id, label };
  }
  return null;
}

/**
 * Build an issue packet from a live NDIC well + domain pack.
 * Residue defaults are copied from the pack. No invented volumes.
 */
export function buildPacketFromWell(
  input: BuildPacketFromWellInput,
): BuildPacketResult {
  console.assert(input !== null && input !== undefined, "input present");
  if (input.well === null || input.well === undefined) {
    return fail("well required");
  }
  if (input.pack === null || input.pack === undefined) {
    return fail("pack required");
  }
  const subject = subjectFromWell(input.well);
  if (subject === null) {
    return fail("well missing api and fileNo — fail-closed");
  }
  const measuredFacts = wellToMeasuredFacts(input.well);
  const residue = copyResidueDefaults(input.pack);
  const outcomeClassId = resolveOutcomeClassId(input.well, input.pack);
  const packet: IssuePacket = {
    schemaVersion: PACKET_SCHEMA_VERSION,
    packId: input.pack.id,
    packVersion: input.pack.version,
    subjectId: subject.id,
    subjectLabel: subject.label,
    measuredFacts,
    outcomeClassId,
    designIntent: null,
    fieldObservation:
      input.well.status != null && input.well.status.length > 0
        ? "NDIC status " + input.well.status + " on public index"
        : null,
    advisorAnswers: [],
    residue,
    proposedBy: input.proposedBy,
    gate: input.gate,
    notes: "built from live NDIC well row",
  };
  return { ok: true, packet };
}
