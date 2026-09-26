import assert from "node:assert/strict";
import { test } from "node:test";
import type { WellRow } from "../outcomes.ts";
import { BAKKEN_PACK } from "./packs/bakken.ts";
import type { DomainPack, KillCondition } from "./types.ts";
import {
  MAX_KILL_SCAN_WELLS,
  listKillScanHits,
  scanWellsForKills,
} from "./kill-scan.ts";

function sampleWell(overrides: Partial<WellRow> = {}): WellRow {
  return {
    fileNo: 12345,
    api: "33053012340000",
    operator: "Example Operator LLC",
    wellName: "EXAMPLE 1-2H",
    td: 10200,
    spud: Date.UTC(2024, 5, 15),
    field: "BAKKEN",
    legal: "SESE Sec 1 T150N R95W",
    lat: 47.12345,
    lon: -103.12345,
    wellType: "OG",
    status: "NC",
    county: "MCKENZIE",
    ...overrides,
  };
}

function packWithStatusKill(): DomainPack {
  const kill: KillCondition = {
    id: "status",
    statement: "STOP when status measured fact is triggered.",
  };
  return {
    ...BAKKEN_PACK,
    id: "test-status-kill",
    killConditions: [kill, ...BAKKEN_PACK.killConditions].slice(0, 8),
  };
}

test("scanWellsForKills miss on normal NDIC well facts", () => {
  const result = scanWellsForKills({
    wells: [sampleWell(), sampleWell({ api: "33053099990000", fileNo: 99 })],
    pack: BAKKEN_PACK,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.scanned, 2);
  assert.equal(result.hitCount, 0);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].hit, false);
  assert.equal(result.rows[1].hit, false);
  assert.ok(result.rows[0].subjectId.length > 0);
});

test("scanWellsForKills hit when status fact equals triggered", () => {
  const pack = packWithStatusKill();
  const result = scanWellsForKills({
    wells: [
      sampleWell({ status: "triggered", wellName: "KILL WELL" }),
      sampleWell({ api: "33053000010000", fileNo: 1, status: "A" }),
    ],
    pack,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.scanned, 2);
  assert.equal(result.hitCount, 1);
  assert.equal(result.rows[0].hit, true);
  assert.equal(result.rows[0].killId, "status");
  assert.equal(result.rows[1].hit, false);
  const hits = listKillScanHits(result.rows);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].wellLabel, "KILL WELL");
});

test("scanWellsForKills respects MAX_KILL_SCAN_WELLS cap", () => {
  const wells: WellRow[] = [];
  let i = 0;
  while (i < MAX_KILL_SCAN_WELLS + 8) {
    wells.push(
      sampleWell({
        api: "33053" + String(10000000 + i).slice(-8),
        fileNo: 1000 + i,
        wellName: "W" + String(i),
      }),
    );
    i += 1;
  }
  const result = scanWellsForKills({ wells, pack: BAKKEN_PACK });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.scanned, MAX_KILL_SCAN_WELLS);
  assert.equal(result.rows.length, MAX_KILL_SCAN_WELLS);
});

test("scanWellsForKills honors lower maxWells bound", () => {
  const wells = [
    sampleWell({ api: "33053000010000", fileNo: 1 }),
    sampleWell({ api: "33053000020000", fileNo: 2 }),
    sampleWell({ api: "33053000030000", fileNo: 3 }),
  ];
  const result = scanWellsForKills({
    wells,
    pack: BAKKEN_PACK,
    maxWells: 2,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.scanned, 2);
});

test("scanWellsForKills fail-closed on missing pack", () => {
  const result = scanWellsForKills({
    wells: [sampleWell()],
    pack: null as unknown as DomainPack,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /pack/);
});

test("scanWellsForKills fail-closed on invalid maxWells", () => {
  const result = scanWellsForKills({
    wells: [sampleWell()],
    pack: BAKKEN_PACK,
    maxWells: 0,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /maxWells/);
});

test("scanWellsForKills records build failure reason", () => {
  const result = scanWellsForKills({
    wells: [sampleWell({ api: null, fileNo: null })],
    pack: BAKKEN_PACK,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.scanned, 1);
  assert.equal(result.rows[0].hit, false);
  assert.ok(result.rows[0].reason != null && result.rows[0].reason.length > 0);
});

test("listKillScanHits returns only hits bounded", () => {
  const rows = [
    { subjectId: "a", wellLabel: "A", hit: false },
    { subjectId: "b", wellLabel: "B", hit: true, killId: "k1" },
    { subjectId: "c", wellLabel: "C", hit: true, killId: "k2" },
  ];
  const hits = listKillScanHits(rows);
  assert.equal(hits.length, 2);
  assert.equal(hits[0].subjectId, "b");
  assert.equal(hits[1].subjectId, "c");
});
