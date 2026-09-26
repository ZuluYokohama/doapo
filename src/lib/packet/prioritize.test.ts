import assert from "node:assert/strict";
import { test } from "node:test";
import type { WellRow } from "../outcomes.ts";
import {
  DUC_AGE_DAYS_THRESHOLD,
  MS_PER_DAY,
} from "./derive-from-well.ts";
import {
  MAX_PRIORITIZE_OPERATORS,
  MAX_PRIORITIZE_WELLS,
  prioritizeOperators,
  prioritizeWells,
  priorityScore,
} from "./prioritize.ts";

const NOW = Date.UTC(2026, 8, 26); // 2026-09-26 CDT calendar day UTC

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

test("priorityScore ranks stale DUC above fresh DUC and producing", () => {
  const staleDays = DUC_AGE_DAYS_THRESHOLD + 10;
  const freshDays = 30;
  const stale = priorityScore("NC", staleDays);
  const fresh = priorityScore("NC", freshDays);
  const active = priorityScore("A", null);
  assert.ok(stale > fresh);
  assert.ok(fresh > active);
  assert.ok(stale > 10000);
});

test("prioritizeWells orders by priority then days", () => {
  const result = prioritizeWells({
    wells: [
      sampleWell({
        status: "A",
        api: "33053000010000",
        fileNo: 1,
        wellName: "ACTIVE",
        spud: NOW - 100 * MS_PER_DAY,
      }),
      sampleWell({
        status: "NC",
        api: "33053000020000",
        fileNo: 2,
        wellName: "STALE",
        spud: NOW - (DUC_AGE_DAYS_THRESHOLD + 5) * MS_PER_DAY,
      }),
      sampleWell({
        status: "NC",
        api: "33053000030000",
        fileNo: 3,
        wellName: "FRESH",
        spud: NOW - 40 * MS_PER_DAY,
      }),
    ],
    nowMs: NOW,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.total, 3);
  assert.equal(result.skipped, 0);
  assert.equal(result.rows.length, 3);
  assert.equal(result.rows[0].wellLabel, "STALE");
  assert.equal(result.rows[0].staleDuc, true);
  assert.equal(result.rows[1].wellLabel, "FRESH");
  assert.equal(result.rows[1].staleDuc, false);
  assert.equal(result.rows[2].wellLabel, "ACTIVE");
  assert.equal(result.rows[0].operator, "Example Operator LLC");
  assert.equal(result.rows[0].county, "MCKENZIE");
  assert.ok(result.rows[0].daysSinceSpud !== null);
  assert.ok(
    (result.rows[0].daysSinceSpud as number) >= DUC_AGE_DAYS_THRESHOLD,
  );
});

test("prioritizeWells respects MAX_PRIORITIZE_WELLS cap", () => {
  const wells: WellRow[] = [];
  let i = 0;
  while (i < MAX_PRIORITIZE_WELLS + 8) {
    wells.push(
      sampleWell({
        api: "330530" + String(10000000 + i).slice(0, 8),
        fileNo: i + 1,
        wellName: "W" + String(i),
      }),
    );
    i += 1;
  }
  const result = prioritizeWells({ wells, nowMs: NOW });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.total, MAX_PRIORITIZE_WELLS);
  assert.equal(result.rows.length, MAX_PRIORITIZE_WELLS);
});

test("prioritizeWells honors lower maxWells bound", () => {
  const wells = [
    sampleWell({ api: "33053000010000", fileNo: 1 }),
    sampleWell({ api: "33053000020000", fileNo: 2 }),
    sampleWell({ api: "33053000030000", fileNo: 3 }),
  ];
  const result = prioritizeWells({ wells, maxWells: 2, nowMs: NOW });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.total, 2);
  assert.equal(result.rows.length, 2);
});

test("prioritizeWells fail-closed on missing wells array", () => {
  const result = prioritizeWells({
    wells: null as unknown as WellRow[],
    nowMs: NOW,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /wells/);
});

test("prioritizeWells fail-closed on invalid maxWells", () => {
  const result = prioritizeWells({
    wells: [sampleWell()],
    maxWells: 0,
    nowMs: NOW,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /maxWells/);
});

test("prioritizeWells empty wells yields zero rows", () => {
  const result = prioritizeWells({ wells: [], nowMs: NOW });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.total, 0);
  assert.equal(result.rows.length, 0);
});

test("prioritizeWells skips null well slots", () => {
  const wells = [
    sampleWell({ api: "33053000010000", fileNo: 1 }),
    null as unknown as WellRow,
    sampleWell({ api: "33053000030000", fileNo: 3 }),
  ];
  const result = prioritizeWells({ wells, nowMs: NOW });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.total, 3);
  assert.equal(result.skipped, 1);
  assert.equal(result.rows.length, 2);
});

test("prioritizeOperators aggregates counts and ranks stale DUC ops first", () => {
  const result = prioritizeOperators({
    wells: [
      sampleWell({
        operator: "Alpha Op",
        status: "A",
        api: "33053000010000",
        fileNo: 1,
        county: "WILLIAMS",
      }),
      sampleWell({
        operator: "Beta Op",
        status: "NC",
        api: "33053000020000",
        fileNo: 2,
        spud: NOW - (DUC_AGE_DAYS_THRESHOLD + 20) * MS_PER_DAY,
        county: "MCKENZIE",
      }),
      sampleWell({
        operator: "Beta Op",
        status: "NC",
        api: "33053000030000",
        fileNo: 3,
        spud: NOW - 50 * MS_PER_DAY,
        county: "MCKENZIE",
      }),
      sampleWell({
        operator: "Alpha Op",
        status: "Confidential",
        api: "33053000040000",
        fileNo: 4,
        county: "DUNN",
      }),
    ],
    nowMs: NOW,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.total, 4);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].operator, "Beta Op");
  assert.equal(result.rows[0].ducCount, 2);
  assert.equal(result.rows[0].staleDucCount, 1);
  assert.equal(result.rows[0].wellCount, 2);
  assert.ok(result.rows[0].maxDaysSinceSpud !== null);
  assert.equal(result.rows[1].operator, "Alpha Op");
  assert.equal(result.rows[1].sealedCount, 1);
  assert.equal(result.rows[1].wellCount, 2);
  assert.ok(result.rows[0].priority > result.rows[1].priority);
});

test("prioritizeOperators fail-closed mirrors wells validation", () => {
  const result = prioritizeOperators({
    wells: null as unknown as WellRow[],
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /wells/);
});

test("prioritizeOperators respects operator row cap constant", () => {
  assert.ok(MAX_PRIORITIZE_OPERATORS >= 1);
  assert.equal(MAX_PRIORITIZE_OPERATORS, 64);
  assert.equal(MAX_PRIORITIZE_WELLS, 64);
});

test("priorityScore never invents volumes — status-only paths stay finite", () => {
  const scores = [
    priorityScore("NC", 10),
    priorityScore("Confidential", null),
    priorityScore("DRL", 5),
    priorityScore(null, null),
    priorityScore("ZZZ", 99999),
  ];
  let i = 0;
  while (i < scores.length) {
    assert.ok(Number.isFinite(scores[i]));
    assert.ok(scores[i] >= 0);
    i += 1;
  }
});
