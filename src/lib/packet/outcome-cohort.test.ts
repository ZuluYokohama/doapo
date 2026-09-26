import assert from "node:assert/strict";
import { test } from "node:test";
import type { WellRow } from "../outcomes.ts";
import { BAKKEN_PACK } from "./packs/bakken.ts";
import { DUC_QUEUE_PACK } from "./packs/duc-queue.ts";
import type { DomainPack } from "./types.ts";
import {
  MAX_COHORT_WELLS,
  summarizeOutcomeCohort,
} from "./outcome-cohort.ts";

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

function countFor(byClass: { id: string; count: number }[], id: string): number {
  let i = 0;
  while (i < byClass.length) {
    if (byClass[i].id === id) return byClass[i].count;
    i += 1;
  }
  return -1;
}

test("summarizeOutcomeCohort counts pack-member outcomes", () => {
  const result = summarizeOutcomeCohort({
    wells: [
      sampleWell({ status: "NC", api: "33053000010000", fileNo: 1 }),
      sampleWell({ status: "A", api: "33053000020000", fileNo: 2 }),
      sampleWell({ status: "DRL", api: "33053000030000", fileNo: 3 }),
      sampleWell({ status: "A", api: "33053000040000", fileNo: 4 }),
    ],
    pack: BAKKEN_PACK,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.total, 4);
  assert.equal(result.unmatched, 0);
  assert.equal(result.skipped, 0);
  assert.equal(countFor(result.byClass, "duc"), 1);
  assert.equal(countFor(result.byClass, "producing"), 2);
  assert.equal(countFor(result.byClass, "drilling"), 1);
  assert.equal(result.byClass.length, BAKKEN_PACK.outcomeClasses.length);
});

test("summarizeOutcomeCohort unmatched when status not in pack", () => {
  const result = summarizeOutcomeCohort({
    wells: [
      sampleWell({ status: "A", api: "33053000010000", fileNo: 1 }),
      sampleWell({ status: "NC", api: "33053000020000", fileNo: 2 }),
    ],
    pack: DUC_QUEUE_PACK,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.total, 2);
  assert.equal(result.unmatched, 1);
  assert.equal(countFor(result.byClass, "duc"), 1);
  assert.equal(countFor(result.byClass, "producing"), -1);
});

test("summarizeOutcomeCohort unmatched on unknown status", () => {
  const result = summarizeOutcomeCohort({
    wells: [sampleWell({ status: "ZZZ_UNKNOWN", api: "33053000010000", fileNo: 1 })],
    pack: BAKKEN_PACK,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.total, 1);
  assert.equal(result.unmatched, 1);
  assert.equal(result.skipped, 0);
});

test("summarizeOutcomeCohort skipped on build failure", () => {
  const result = summarizeOutcomeCohort({
    wells: [sampleWell({ api: null, fileNo: null })],
    pack: BAKKEN_PACK,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.total, 1);
  assert.equal(result.skipped, 1);
  assert.equal(result.unmatched, 0);
});

test("summarizeOutcomeCohort respects MAX_COHORT_WELLS cap", () => {
  const wells: WellRow[] = [];
  let i = 0;
  while (i < MAX_COHORT_WELLS + 8) {
    wells.push(
      sampleWell({
        api: "33053" + String(10000000 + i).slice(-8),
        fileNo: 1000 + i,
        wellName: "W" + String(i),
        status: "A",
      }),
    );
    i += 1;
  }
  const result = summarizeOutcomeCohort({ wells, pack: BAKKEN_PACK });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.total, MAX_COHORT_WELLS);
  assert.equal(countFor(result.byClass, "producing"), MAX_COHORT_WELLS);
});

test("summarizeOutcomeCohort honors lower maxWells bound", () => {
  const wells = [
    sampleWell({ api: "33053000010000", fileNo: 1, status: "NC" }),
    sampleWell({ api: "33053000020000", fileNo: 2, status: "A" }),
    sampleWell({ api: "33053000030000", fileNo: 3, status: "DRL" }),
  ];
  const result = summarizeOutcomeCohort({
    wells,
    pack: BAKKEN_PACK,
    maxWells: 2,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.total, 2);
  assert.equal(countFor(result.byClass, "duc"), 1);
  assert.equal(countFor(result.byClass, "producing"), 1);
  assert.equal(countFor(result.byClass, "drilling"), 0);
});

test("summarizeOutcomeCohort fail-closed on missing pack", () => {
  const result = summarizeOutcomeCohort({
    wells: [sampleWell()],
    pack: null as unknown as DomainPack,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /pack/);
});

test("summarizeOutcomeCohort fail-closed on invalid maxWells", () => {
  const result = summarizeOutcomeCohort({
    wells: [sampleWell()],
    pack: BAKKEN_PACK,
    maxWells: 0,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /maxWells/);
});

test("summarizeOutcomeCohort fail-closed on missing wells array", () => {
  const result = summarizeOutcomeCohort({
    wells: null as unknown as WellRow[],
    pack: BAKKEN_PACK,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /wells/);
});

test("summarizeOutcomeCohort empty wells yields zero totals", () => {
  const result = summarizeOutcomeCohort({
    wells: [],
    pack: BAKKEN_PACK,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.total, 0);
  assert.equal(result.unmatched, 0);
  assert.equal(result.skipped, 0);
  assert.equal(result.byClass.length, BAKKEN_PACK.outcomeClasses.length);
});
