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

import { createHash } from "node:crypto";
import {
  DEFAULT_KILL_SCAN_EXPORT_NOTES,
  KILL_SCAN_SCHEMA_VERSION,
  MAX_KILL_SCAN_JSON_CHARS,
  exportKillScan,
  importKillScan,
  killScanFilename,
} from "./kill-scan-export.ts";

test("exportKillScan happy path with digest", () => {
  const wells = [
    sampleWell({ api: "33053000010000", fileNo: 1 }),
    sampleWell({ api: "33053000020000", fileNo: 2 }),
  ];
  const result = exportKillScan({ wells, pack: BAKKEN_PACK });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.bundle.schemaVersion, KILL_SCAN_SCHEMA_VERSION);
  assert.equal(result.bundle.packId, BAKKEN_PACK.id);
  assert.equal(result.bundle.packVersion, BAKKEN_PACK.version);
  assert.equal(result.bundle.scanned, 2);
  assert.equal(result.bundle.hitCount, 0);
  assert.equal(result.bundle.rows.length, 2);
  assert.equal(result.bundle.bundleDigest.length, 64);
  assert.match(result.bundle.notes, /demo kill-scan|not durable/i);
  assert.ok(result.json.includes(BAKKEN_PACK.id));
  assert.ok(result.json.includes(result.bundle.bundleDigest));
});

test("exportKillScan digest matches canonical recompute", () => {
  const result = exportKillScan({
    wells: [sampleWell({ api: "33053000010000", fileNo: 1 })],
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
    scanned: result.bundle.scanned,
    hitCount: result.bundle.hitCount,
    rows: result.bundle.rows,
    notes: result.bundle.notes,
  };
  const recomputed = createHash("sha256")
    .update(JSON.stringify(ordered), "utf8")
    .digest("hex");
  assert.equal(recomputed, result.bundle.bundleDigest);
  assert.equal(result.bundle.notes, "unit-test notes");
});

test("exportKillScan includes hit rows with killId", () => {
  const pack = packWithStatusKill();
  const result = exportKillScan({
    wells: [
      sampleWell({ status: "triggered", wellName: "KILL WELL", fileNo: 7 }),
      sampleWell({ api: "33053000010000", fileNo: 1, status: "A" }),
    ],
    pack,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.bundle.scanned, 2);
  assert.equal(result.bundle.hitCount, 1);
  assert.equal(result.bundle.rows[0].hit, true);
  assert.equal(result.bundle.rows[0].killId, "status");
  assert.equal(result.bundle.rows[1].hit, false);
});

test("exportKillScan fail-closed via scan (invalid maxWells)", () => {
  const result = exportKillScan({
    wells: [sampleWell()],
    pack: BAKKEN_PACK,
    maxWells: 0,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /maxWells/);
});

test("exportKillScan fail-closed on missing pack", () => {
  const result = exportKillScan({
    wells: [sampleWell()],
    pack: null as unknown as DomainPack,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /pack/);
});

test("exportKillScan fail-closed on missing wells", () => {
  const result = exportKillScan({
    wells: null as unknown as WellRow[],
    pack: BAKKEN_PACK,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /wells/);
});

test("exportKillScan empty wells still ok", () => {
  const result = exportKillScan({
    wells: [],
    pack: BAKKEN_PACK,
    notes: DEFAULT_KILL_SCAN_EXPORT_NOTES,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.bundle.scanned, 0);
  assert.equal(result.bundle.hitCount, 0);
  assert.equal(result.bundle.rows.length, 0);
  assert.equal(result.bundle.bundleDigest.length, 64);
});

test("exportKillScan respects MAX_KILL_SCAN_WELLS via scan", () => {
  const wells: WellRow[] = [];
  let i = 0;
  while (i < MAX_KILL_SCAN_WELLS + 4) {
    wells.push(
      sampleWell({
        api: "33053" + String(20000000 + i).slice(-8),
        fileNo: 2000 + i,
        wellName: "E" + String(i),
      }),
    );
    i += 1;
  }
  const result = exportKillScan({ wells, pack: BAKKEN_PACK });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.bundle.scanned, MAX_KILL_SCAN_WELLS);
  assert.equal(result.bundle.rows.length, MAX_KILL_SCAN_WELLS);
});

test("killScanFilename sanitizes and truncates", () => {
  assert.equal(killScanFilename("bakken"), "kill-scan-bakken.json");
  assert.equal(killScanFilename("a/b:c"), "kill-scan-a_b_c.json");
  assert.equal(killScanFilename(""), "kill-scan-unknown.json");
  const long = "x".repeat(80);
  const name = killScanFilename(long);
  assert.ok(name.startsWith("kill-scan-"));
  assert.ok(name.endsWith(".json"));
  assert.ok(name.length < 80);
});

test("exportKillScan clones rows (mutation safe)", () => {
  const result = exportKillScan({
    wells: [sampleWell({ api: "33053000010000", fileNo: 1 })],
    pack: BAKKEN_PACK,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const before = result.bundle.rows[0].wellLabel;
  result.bundle.rows[0].wellLabel = before + "-mutated";
  const again = exportKillScan({
    wells: [sampleWell({ api: "33053000010000", fileNo: 1 })],
    pack: BAKKEN_PACK,
  });
  assert.equal(again.ok, true);
  if (!again.ok) return;
  assert.equal(again.bundle.rows[0].wellLabel, before);
});

test("importKillScan round-trip export → import", () => {
  const wells = [
    sampleWell({ api: "33053000010000", fileNo: 1 }),
    sampleWell({ api: "33053000020000", fileNo: 2 }),
  ];
  const exported = exportKillScan({ wells, pack: BAKKEN_PACK });
  assert.equal(exported.ok, true);
  if (!exported.ok) return;
  assert.ok(exported.json.length < MAX_KILL_SCAN_JSON_CHARS);
  const imported = importKillScan(exported.json);
  assert.equal(imported.ok, true);
  if (!imported.ok) return;
  assert.equal(imported.bundle.schemaVersion, KILL_SCAN_SCHEMA_VERSION);
  assert.equal(imported.bundle.packId, BAKKEN_PACK.id);
  assert.equal(imported.bundle.packVersion, BAKKEN_PACK.version);
  assert.equal(imported.bundle.scanned, 2);
  assert.equal(imported.bundle.hitCount, 0);
  assert.equal(imported.bundle.bundleDigest, exported.bundle.bundleDigest);
  assert.equal(imported.bundle.rows.length, exported.bundle.rows.length);
  assert.equal(imported.bundle.rows[0].subjectId, exported.bundle.rows[0].subjectId);
});

test("importKillScan round-trip with hit rows", () => {
  const pack = packWithStatusKill();
  const exported = exportKillScan({
    wells: [
      sampleWell({ status: "triggered", wellName: "KILL WELL", fileNo: 7 }),
      sampleWell({ api: "33053000010000", fileNo: 1, status: "A" }),
    ],
    pack,
  });
  assert.equal(exported.ok, true);
  if (!exported.ok) return;
  const imported = importKillScan(exported.json);
  assert.equal(imported.ok, true);
  if (!imported.ok) return;
  assert.equal(imported.bundle.hitCount, 1);
  assert.equal(imported.bundle.rows[0].hit, true);
  assert.equal(imported.bundle.rows[0].killId, "status");
  assert.equal(imported.bundle.rows[1].hit, false);
  assert.equal(imported.bundle.bundleDigest, exported.bundle.bundleDigest);
});

test("importKillScan fail-closed on empty / oversize / bad JSON", () => {
  const empty = importKillScan("");
  assert.equal(empty.ok, false);
  if (!empty.ok) assert.match(empty.reason, /empty/);
  const bad = importKillScan("{not-json");
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.match(bad.reason, /parse/i);
  const over = importKillScan("x".repeat(MAX_KILL_SCAN_JSON_CHARS + 1));
  assert.equal(over.ok, false);
  if (!over.ok) assert.match(over.reason, /size cap/);
  const notObj = importKillScan("[]");
  assert.equal(notObj.ok, false);
  if (!notObj.ok) assert.match(notObj.reason, /object/);
});

test("importKillScan fail-closed on schemaVersion mismatch", () => {
  const exported = exportKillScan({
    wells: [sampleWell({ api: "33053000010000", fileNo: 1 })],
    pack: BAKKEN_PACK,
  });
  assert.equal(exported.ok, true);
  if (!exported.ok) return;
  const broken = { ...exported.bundle, schemaVersion: "wrong/1" };
  const result = importKillScan(JSON.stringify(broken));
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /schemaVersion/);
});

test("importKillScan fail-closed on bundleDigest mismatch", () => {
  const exported = exportKillScan({
    wells: [sampleWell({ api: "33053000010000", fileNo: 1 })],
    pack: BAKKEN_PACK,
  });
  assert.equal(exported.ok, true);
  if (!exported.ok) return;
  const broken = {
    ...exported.bundle,
    scanned: exported.bundle.scanned + 1,
  };
  const result = importKillScan(JSON.stringify(broken));
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /bundleDigest/);
});

test("importKillScan fail-closed on tampered digest hex", () => {
  const exported = exportKillScan({
    wells: [sampleWell({ api: "33053000010000", fileNo: 1 })],
    pack: BAKKEN_PACK,
  });
  assert.equal(exported.ok, true);
  if (!exported.ok) return;
  const badHex = "0".repeat(64);
  assert.notEqual(badHex, exported.bundle.bundleDigest);
  const broken = { ...exported.bundle, bundleDigest: badHex };
  const result = importKillScan(JSON.stringify(broken));
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /bundleDigest/);
});

test("importKillScan fail-closed on missing packId", () => {
  const exported = exportKillScan({
    wells: [],
    pack: BAKKEN_PACK,
  });
  assert.equal(exported.ok, true);
  if (!exported.ok) return;
  const broken = { ...exported.bundle, packId: "" };
  const result = importKillScan(JSON.stringify(broken));
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /packId/);
});

test("importKillScan fail-closed on rows over cap", () => {
  const exported = exportKillScan({
    wells: [],
    pack: BAKKEN_PACK,
  });
  assert.equal(exported.ok, true);
  if (!exported.ok) return;
  const rows = [];
  let i = 0;
  while (i < MAX_KILL_SCAN_WELLS + 1) {
    rows.push({
      subjectId: "s" + String(i),
      wellLabel: "W" + String(i),
      hit: false,
    });
    i += 1;
  }
  const broken = { ...exported.bundle, rows };
  const result = importKillScan(JSON.stringify(broken));
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /rows|MAX_KILL_SCAN/);
});

test("importKillScan clones rows (mutation safe)", () => {
  const exported = exportKillScan({
    wells: [sampleWell({ api: "33053000010000", fileNo: 1 })],
    pack: BAKKEN_PACK,
  });
  assert.equal(exported.ok, true);
  if (!exported.ok) return;
  const imported = importKillScan(exported.json);
  assert.equal(imported.ok, true);
  if (!imported.ok) return;
  const before = imported.bundle.rows[0].wellLabel;
  imported.bundle.rows[0].wellLabel = before + "-mutated";
  const again = importKillScan(exported.json);
  assert.equal(again.ok, true);
  if (!again.ok) return;
  assert.equal(again.bundle.rows[0].wellLabel, before);
});
