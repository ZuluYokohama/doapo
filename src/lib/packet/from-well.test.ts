import assert from "node:assert/strict";
import { test } from "node:test";
import type { WellRow } from "../outcomes.ts";
import { BAKKEN_PACK } from "./packs/bakken.ts";
import { DUC_QUEUE_PACK } from "./packs/duc-queue.ts";
import {
  MAX_WELL_FACTS,
  buildPacketFromWell,
  wellToMeasuredFacts,
} from "./from-well.ts";
import { validateIssuePacket } from "./validate.ts";

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

test("wellToMeasuredFacts maps real WellRow fields only", () => {
  const facts = wellToMeasuredFacts(sampleWell());
  assert.ok(facts.length >= 1);
  assert.ok(facts.length <= MAX_WELL_FACTS);
  const keys = facts.map((row) => row.key);
  assert.ok(keys.includes("api"));
  assert.ok(keys.includes("status"));
  assert.ok(keys.includes("county"));
  assert.ok(keys.includes("operator"));
  assert.ok(keys.includes("spud"));
  assert.ok(keys.includes("fileNo"));
  let i = 0;
  while (i < facts.length) {
    assert.equal(facts[i].evidence, "measured");
    assert.equal(facts[i].sourceLabel, "NDIC GIS");
    i += 1;
  }
});

test("wellToMeasuredFacts never invents oil/gas/water volumes", () => {
  const facts = wellToMeasuredFacts(sampleWell({ status: "A" }));
  let i = 0;
  while (i < facts.length) {
    const key = facts[i].key.toLowerCase();
    const value = facts[i].value.toLowerCase();
    assert.equal(key.includes("oil"), false);
    assert.equal(key.includes("gas"), false);
    assert.equal(key.includes("water"), false);
    assert.equal(key.includes("volume"), false);
    assert.equal(key.includes("bbl"), false);
    assert.equal(value.includes("bbl"), false);
    assert.equal(/oil\s*volume|monthly\s*oil/.test(value), false);
    i += 1;
  }
});

test("buildPacketFromWell maps NC status to duc on bakken pack", () => {
  const built = buildPacketFromWell({
    well: sampleWell({ status: "NC" }),
    pack: BAKKEN_PACK,
    proposedBy: "agent_propose",
    gate: "STOP",
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(built.packet.outcomeClassId, "duc");
  assert.equal(built.packet.packId, BAKKEN_PACK.id);
  assert.equal(built.packet.residue.length, BAKKEN_PACK.residueDefaults.length);
  const validation = validateIssuePacket(built.packet);
  assert.equal(validation.ok, true);
});

test("buildPacketFromWell maps A status to producing on bakken", () => {
  const built = buildPacketFromWell({
    well: sampleWell({ status: "A" }),
    pack: BAKKEN_PACK,
    proposedBy: "human_open",
    gate: "OPEN_CANDIDATE",
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(built.packet.outcomeClassId, "producing");
});

test("buildPacketFromWell nulls outcome when not in pack (producing vs duc-queue)", () => {
  const built = buildPacketFromWell({
    well: sampleWell({ status: "A" }),
    pack: DUC_QUEUE_PACK,
    proposedBy: "agent_propose",
    gate: "STOP",
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(built.packet.outcomeClassId, null);
  assert.equal(built.packet.packId, DUC_QUEUE_PACK.id);
});

test("buildPacketFromWell keeps duc outcome when in duc-queue pack", () => {
  const built = buildPacketFromWell({
    well: sampleWell({ status: "NC" }),
    pack: DUC_QUEUE_PACK,
    proposedBy: "agent_propose",
    gate: "STOP",
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(built.packet.outcomeClassId, "duc");
});

test("buildPacketFromWell copies residueDefaults (no shared mutation)", () => {
  const built = buildPacketFromWell({
    well: sampleWell(),
    pack: BAKKEN_PACK,
    proposedBy: "agent_propose",
    gate: "STOP",
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.ok(built.packet.residue.length >= 1);
  built.packet.residue[0].statement = "mutated";
  assert.notEqual(
    BAKKEN_PACK.residueDefaults[0].statement,
    "mutated",
  );
});

test("buildPacketFromWell fail-closed without api and fileNo", () => {
  const built = buildPacketFromWell({
    well: sampleWell({ api: null, fileNo: null }),
    pack: BAKKEN_PACK,
    proposedBy: "agent_propose",
    gate: "STOP",
  });
  assert.equal(built.ok, false);
  if (!built.ok) {
    assert.match(built.reason, /fail-closed|missing/);
  }
});

test("buildPacketFromWell agent OPEN is still a packet; validate fails separately", () => {
  const built = buildPacketFromWell({
    well: sampleWell(),
    pack: BAKKEN_PACK,
    proposedBy: "agent_propose",
    gate: "OPEN_CANDIDATE",
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  const validation = validateIssuePacket(built.packet);
  assert.equal(validation.ok, false);
  if (!validation.ok) {
    assert.match(validation.reason, /anti-promotion/);
  }
});

test("wellToMeasuredFacts skips null optional fields and stays bounded", () => {
  const facts = wellToMeasuredFacts(
    sampleWell({
      field: null,
      legal: null,
      td: null,
      lat: null,
      lon: null,
      spud: null,
      wellType: null,
    }),
  );
  assert.ok(facts.length <= MAX_WELL_FACTS);
  const keys = facts.map((row) => row.key);
  assert.equal(keys.includes("field"), false);
  assert.equal(keys.includes("td"), false);
  assert.equal(keys.includes("spud"), false);
});
