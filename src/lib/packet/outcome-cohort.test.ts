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

import {
  COHORT_SCHEMA_VERSION,
  DEFAULT_COHORT_EXPORT_NOTES,
  cohortFilename,
  exportOutcomeCohort,
} from "./cohort-export.ts";
import { createHash } from "node:crypto";

test("exportOutcomeCohort happy path with digest", () => {
  const wells = [
    sampleWell({ status: "NC", api: "33053000010000", fileNo: 1 }),
    sampleWell({ status: "A", api: "33053000020000", fileNo: 2 }),
  ];
  const result = exportOutcomeCohort({ wells, pack: BAKKEN_PACK });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.bundle.schemaVersion, COHORT_SCHEMA_VERSION);
  assert.equal(result.bundle.packId, BAKKEN_PACK.id);
  assert.equal(result.bundle.packVersion, BAKKEN_PACK.version);
  assert.equal(result.bundle.total, 2);
  assert.equal(result.bundle.unmatched, 0);
  assert.equal(result.bundle.skipped, 0);
  assert.equal(result.bundle.byClass.length, BAKKEN_PACK.outcomeClasses.length);
  assert.equal(countFor(result.bundle.byClass, "duc"), 1);
  assert.equal(countFor(result.bundle.byClass, "producing"), 1);
  assert.equal(result.bundle.bundleDigest.length, 64);
  assert.match(result.bundle.notes, /demo cohort|not durable/i);
  assert.ok(result.json.includes(BAKKEN_PACK.id));
  assert.ok(result.json.includes(result.bundle.bundleDigest));
});

test("exportOutcomeCohort digest matches canonical recompute", () => {
  const result = exportOutcomeCohort({
    wells: [sampleWell({ status: "A", api: "33053000010000", fileNo: 1 })],
    pack: BAKKEN_PACK,
    notes: "unit-test notes",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const ordered = {
    schemaVersion: result.bundle.schemaVersion,
    exportedAtIso: result.bundle.exportedAtIso,
    packId: result.bundle.packId,
    packVersion: result.bundle.packVersion,
    total: result.bundle.total,
    byClass: result.bundle.byClass,
    unmatched: result.bundle.unmatched,
    skipped: result.bundle.skipped,
    notes: result.bundle.notes,
  };
  const recomputed = createHash("sha256")
    .update(JSON.stringify(ordered), "utf8")
    .digest("hex");
  assert.equal(recomputed, result.bundle.bundleDigest);
  assert.equal(result.bundle.notes, "unit-test notes");
});

test("exportOutcomeCohort fail-closed via summarize (invalid maxWells)", () => {
  const result = exportOutcomeCohort({
    wells: [sampleWell()],
    pack: BAKKEN_PACK,
    maxWells: 0,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /maxWells/);
});

test("exportOutcomeCohort fail-closed on missing pack", () => {
  const result = exportOutcomeCohort({
    wells: [sampleWell()],
    pack: null as unknown as DomainPack,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /pack/);
});

test("exportOutcomeCohort fail-closed on missing wells", () => {
  const result = exportOutcomeCohort({
    wells: null as unknown as WellRow[],
    pack: BAKKEN_PACK,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /wells/);
});

test("exportOutcomeCohort empty wells still ok", () => {
  const result = exportOutcomeCohort({
    wells: [],
    pack: BAKKEN_PACK,
    notes: DEFAULT_COHORT_EXPORT_NOTES,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.bundle.total, 0);
  assert.equal(result.bundle.unmatched, 0);
  assert.equal(result.bundle.skipped, 0);
  assert.equal(result.bundle.bundleDigest.length, 64);
});

test("exportOutcomeCohort respects MAX_COHORT_WELLS via summarize", () => {
  const wells: WellRow[] = [];
  let i = 0;
  while (i < MAX_COHORT_WELLS + 4) {
    wells.push(
      sampleWell({
        api: "33053" + String(20000000 + i).slice(-8),
        fileNo: 2000 + i,
        wellName: "E" + String(i),
        status: "A",
      }),
    );
    i += 1;
  }
  const result = exportOutcomeCohort({ wells, pack: BAKKEN_PACK });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.bundle.total, MAX_COHORT_WELLS);
  assert.equal(countFor(result.bundle.byClass, "producing"), MAX_COHORT_WELLS);
});

test("cohortFilename sanitizes and truncates", () => {
  assert.equal(
    cohortFilename("bakken"),
    "outcome-cohort-bakken.json",
  );
  assert.equal(
    cohortFilename("a/b:c"),
    "outcome-cohort-a_b_c.json",
  );
  assert.equal(cohortFilename(""), "outcome-cohort-unknown.json");
  const long = "x".repeat(80);
  const name = cohortFilename(long);
  assert.ok(name.startsWith("outcome-cohort-"));
  assert.ok(name.endsWith(".json"));
  assert.ok(name.length < 80);
});
