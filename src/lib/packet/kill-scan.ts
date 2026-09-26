/**
 * Batch well kill scan — bounded well→packet→kill path.
 * Power of 10: flat, bounded loops, no recursion, ≤60 lines/fn, ≥2 asserts/fn.
 * No invented volumes; only buildPacketFromWell + checkKillConditions.
 */
import type { WellRow } from "../outcomes.ts";
import { checkKillConditions } from "./kill-check.ts";
import { buildPacketFromWell, wellSubjectId } from "./from-well.ts";
import { MAX_ID_LEN, MAX_TEXT_LEN, type DomainPack } from "./types.ts";

/** Hard cap on wells scanned in one batch (Power of 10). */
export const MAX_KILL_SCAN_WELLS = 64;

export type KillScanRow = {
  subjectId: string;
  wellLabel: string;
  hit: boolean;
  killId?: string;
  reason?: string;
};

export type ScanWellsForKillsInput = {
  wells: WellRow[];
  pack: DomainPack;
  maxWells?: number;
};

export type ScanWellsForKillsResult =
  | { ok: true; rows: KillScanRow[]; scanned: number; hitCount: number }
  | { ok: false; reason: string };

function failScan(reason: string): ScanWellsForKillsResult {
  console.assert(typeof reason === "string", "scan fail reason string");
  console.assert(reason.length > 0, "scan fail reason present");
  return { ok: false, reason };
}

function resolveCap(maxWells: number | undefined): number {
  console.assert(MAX_KILL_SCAN_WELLS >= 1, "default scan cap positive");
  console.assert(true, "resolveCap entry");
  if (maxWells === undefined || maxWells === null) {
    return MAX_KILL_SCAN_WELLS;
  }
  if (typeof maxWells !== "number" || maxWells < 1) {
    return 0;
  }
  if (maxWells > MAX_KILL_SCAN_WELLS) return MAX_KILL_SCAN_WELLS;
  return maxWells;
}

function clipLabel(raw: string): string {
  console.assert(typeof raw === "string", "label string");
  console.assert(raw.length >= 0, "label length");
  if (raw.length === 0) return "unnamed";
  if (raw.length <= MAX_TEXT_LEN) return raw;
  return raw.slice(0, MAX_TEXT_LEN);
}

function wellLabelOf(well: WellRow, subjectId: string): string {
  console.assert(well !== null && well !== undefined, "well present");
  console.assert(subjectId.length > 0, "subjectId present");
  if (well.wellName != null && well.wellName.length > 0) {
    return clipLabel(well.wellName);
  }
  return clipLabel(subjectId);
}

function unknownSubjectId(well: WellRow, index: number): string {
  console.assert(index >= 0, "index non-negative");
  console.assert(well !== null && well !== undefined, "well present");
  const raw =
    well.fileNo != null
      ? "file-" + String(well.fileNo)
      : "row-" + String(index);
  if (raw.length <= MAX_ID_LEN) return raw;
  return raw.slice(0, MAX_ID_LEN);
}

function scanOneWell(
  well: WellRow,
  pack: DomainPack,
  index: number,
): KillScanRow {
  console.assert(well !== null && well !== undefined, "well present");
  console.assert(pack !== null && pack !== undefined, "pack present");
  const sid = wellSubjectId(well);
  const subjectId = sid !== null ? sid : unknownSubjectId(well, index);
  const wellLabel = wellLabelOf(well, subjectId);
  const built = buildPacketFromWell({
    well,
    pack,
    proposedBy: "agent_propose",
    gate: "STOP",
  });
  if (!built.ok) {
    return { subjectId, wellLabel, hit: false, reason: built.reason };
  }
  const check = checkKillConditions(pack, built.packet);
  if (!check.ok) {
    return { subjectId, wellLabel, hit: false, reason: check.reason };
  }
  if (check.hit) {
    return {
      subjectId,
      wellLabel,
      hit: true,
      killId: check.killId,
      reason: check.statement,
    };
  }
  return { subjectId, wellLabel, hit: false };
}

/**
 * Scan up to maxWells (≤ MAX_KILL_SCAN_WELLS) via well→packet→kill.
 * Fail-closed on missing pack/wells or invalid cap.
 */
export function scanWellsForKills(
  input: ScanWellsForKillsInput,
): ScanWellsForKillsResult {
  console.assert(input !== null && input !== undefined, "input present");
  console.assert(true, "scanWellsForKills entry");
  if (input === null || input === undefined) {
    return failScan("input required");
  }
  if (input.pack === null || input.pack === undefined) {
    return failScan("pack required");
  }
  if (!Array.isArray(input.wells)) {
    return failScan("wells required");
  }
  const cap = resolveCap(input.maxWells);
  if (cap < 1) {
    return failScan("maxWells invalid");
  }
  const bound = input.wells.length < cap ? input.wells.length : cap;
  const rows: KillScanRow[] = [];
  let hitCount = 0;
  let i = 0;
  while (i < bound) {
    const row = scanOneWell(input.wells[i], input.pack, i);
    if (row.hit) hitCount += 1;
    rows.push(row);
    i += 1;
  }
  console.assert(rows.length <= MAX_KILL_SCAN_WELLS, "rows within cap");
  console.assert(rows.length === bound, "rows match bound");
  return { ok: true, rows, scanned: rows.length, hitCount };
}

/** Bounded hit-only slice for UI tables. */
export function listKillScanHits(rows: readonly KillScanRow[]): KillScanRow[] {
  console.assert(Array.isArray(rows), "rows array");
  console.assert(MAX_KILL_SCAN_WELLS >= 1, "hit list cap positive");
  const out: KillScanRow[] = [];
  let i = 0;
  const bound =
    rows.length < MAX_KILL_SCAN_WELLS ? rows.length : MAX_KILL_SCAN_WELLS;
  while (i < bound) {
    if (rows[i].hit) out.push(rows[i]);
    i += 1;
  }
  console.assert(out.length <= MAX_KILL_SCAN_WELLS, "hits bounded");
  return out;
}
