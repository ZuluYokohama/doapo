import assert from "node:assert/strict";
import { test } from "node:test";
import type { WellRow } from "../outcomes.ts";
import { BAKKEN_PACK } from "./packs/bakken.ts";
import { DUC_QUEUE_PACK } from "./packs/duc-queue.ts";
import {
  CONDITIONAL_RESIDUE_IDS,
  DERIVE_SOURCE_LABEL,
  DUC_AGE_DAYS_THRESHOLD,
  FACT_KEY_DAYS_SINCE_SPUD,
  KILL_ID_STALE_DUC,
  MS_PER_DAY,
  RESIDUE_ID_CONFIDENTIAL_LAG,
  RESIDUE_ID_DUC_AGE,
  daysSinceSpud,
  deriveFromWell,
  isAlwaysOnResidueId,
} from "./derive-from-well.ts";
import { buildPacketFromWell } from "./from-well.ts";
import { isKillTriggered } from "./kill-fact-edit.ts";
import { checkKillConditions } from "./kill-check.ts";
import { validateIssuePacket } from "./validate.ts";

const NOW = Date.UTC(2026, 8, 26); // 2026-09-26

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

test("daysSinceSpud computes whole days fail-closed", () => {
  const spud = NOW - 10 * MS_PER_DAY;
  assert.equal(daysSinceSpud(spud, NOW), 10);
  assert.equal(daysSinceSpud(null, NOW), null);
  assert.equal(daysSinceSpud(NOW + MS_PER_DAY, NOW), null);
  assert.equal(daysSinceSpud(Number.NaN, NOW), null);
});

test("isAlwaysOnResidueId excludes conditional ids", () => {
  assert.equal(isAlwaysOnResidueId("no-monthly-volumes"), true);
  assert.equal(isAlwaysOnResidueId(RESIDUE_ID_CONFIDENTIAL_LAG), false);
  assert.equal(isAlwaysOnResidueId(RESIDUE_ID_DUC_AGE), false);
  assert.ok(CONDITIONAL_RESIDUE_IDS.includes(RESIDUE_ID_CONFIDENTIAL_LAG));
});

test("deriveFromWell emits days-since-spud when spud present", () => {
  const days = daysSinceSpud(sampleWell().spud, NOW);
  assert.ok(days !== null);
  const derived = deriveFromWell({
    well: sampleWell(),
    pack: DUC_QUEUE_PACK,
    nowMs: NOW,
  });
  const fact = derived.facts.find((row) => row.key === FACT_KEY_DAYS_SINCE_SPUD);
  assert.ok(fact);
  assert.equal(fact.value, String(days));
  assert.equal(fact.evidence, "derived");
  assert.equal(fact.sourceLabel, DERIVE_SOURCE_LABEL);
});

test("deriveFromWell confidential-lag only when sealed", () => {
  const sealed = deriveFromWell({
    well: sampleWell({ status: "Confidential", spud: Date.UTC(2026, 0, 1) }),
    pack: BAKKEN_PACK,
    nowMs: NOW,
  });
  assert.ok(
    sealed.residue.some((row) => row.id === RESIDUE_ID_CONFIDENTIAL_LAG),
  );
  const active = deriveFromWell({
    well: sampleWell({ status: "A", spud: Date.UTC(2026, 0, 1) }),
    pack: BAKKEN_PACK,
    nowMs: NOW,
  });
  assert.equal(
    active.residue.some((row) => row.id === RESIDUE_ID_CONFIDENTIAL_LAG),
    false,
  );
});

test("deriveFromWell fresh NC: no duc-age residue, no stale-duc kill", () => {
  const freshSpud = NOW - 30 * MS_PER_DAY;
  const derived = deriveFromWell({
    well: sampleWell({ status: "NC", spud: freshSpud }),
    pack: DUC_QUEUE_PACK,
    nowMs: NOW,
  });
  assert.equal(
    derived.residue.some((row) => row.id === RESIDUE_ID_DUC_AGE),
    false,
  );
  assert.equal(isKillTriggered(derived.facts, KILL_ID_STALE_DUC), false);
});

test("deriveFromWell aged NC on bakken-duc: duc-age + stale-duc kill", () => {
  const agedSpud = NOW - (DUC_AGE_DAYS_THRESHOLD + 5) * MS_PER_DAY;
  const derived = deriveFromWell({
    well: sampleWell({ status: "NC", spud: agedSpud }),
    pack: DUC_QUEUE_PACK,
    nowMs: NOW,
  });
  assert.ok(derived.residue.some((row) => row.id === RESIDUE_ID_DUC_AGE));
  assert.equal(isKillTriggered(derived.facts, KILL_ID_STALE_DUC), true);
  const killFact = derived.facts.find(
    (row) => row.key === "kill:" + KILL_ID_STALE_DUC,
  );
  assert.ok(killFact);
  assert.equal(killFact.evidence, "derived");
});

test("deriveFromWell aged NC on bakken: duc-age residue, no stale-duc kill", () => {
  const agedSpud = NOW - (DUC_AGE_DAYS_THRESHOLD + 5) * MS_PER_DAY;
  const derived = deriveFromWell({
    well: sampleWell({ status: "NC", spud: agedSpud }),
    pack: BAKKEN_PACK,
    nowMs: NOW,
  });
  assert.ok(derived.residue.some((row) => row.id === RESIDUE_ID_DUC_AGE));
  assert.equal(isKillTriggered(derived.facts, KILL_ID_STALE_DUC), false);
});

test("deriveFromWell never invents oil/gas/water volumes", () => {
  const agedSpud = NOW - (DUC_AGE_DAYS_THRESHOLD + 90) * MS_PER_DAY;
  const derived = deriveFromWell({
    well: sampleWell({ status: "NC", spud: agedSpud }),
    pack: DUC_QUEUE_PACK,
    nowMs: NOW,
  });
  let i = 0;
  while (i < derived.facts.length) {
    const key = derived.facts[i].key.toLowerCase();
    const value = derived.facts[i].value.toLowerCase();
    assert.equal(key.includes("oil"), false);
    assert.equal(key.includes("gas"), false);
    assert.equal(key.includes("water"), false);
    assert.equal(key.includes("volume"), false);
    assert.equal(key.includes("bbl"), false);
    assert.equal(value.includes("bbl"), false);
    i += 1;
  }
  let r = 0;
  while (r < derived.residue.length) {
    const stmt = derived.residue[r].statement.toLowerCase();
    assert.equal(/monthly\s+(oil|gas|water)/.test(stmt), false);
    assert.equal(stmt.includes("bbl"), false);
    r += 1;
  }
});

test("buildPacketFromWell wires derivation into live packet (aged DUC)", () => {
  const agedSpud = NOW - (DUC_AGE_DAYS_THRESHOLD + 10) * MS_PER_DAY;
  const built = buildPacketFromWell({
    well: sampleWell({ status: "NC", spud: agedSpud }),
    pack: DUC_QUEUE_PACK,
    proposedBy: "agent_propose",
    gate: "STOP",
    nowMs: NOW,
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(built.packet.outcomeClassId, "duc");
  assert.ok(
    built.packet.measuredFacts.some(
      (row) => row.key === FACT_KEY_DAYS_SINCE_SPUD,
    ),
  );
  assert.ok(
    built.packet.residue.some((row) => row.id === RESIDUE_ID_DUC_AGE),
  );
  assert.ok(
    built.packet.residue.some((row) => row.id === "no-monthly-volumes"),
  );
  assert.equal(
    built.packet.residue.some((row) => row.id === RESIDUE_ID_CONFIDENTIAL_LAG),
    false,
  );
  assert.equal(isKillTriggered(built.packet.measuredFacts, KILL_ID_STALE_DUC), true);
  const check = checkKillConditions(DUC_QUEUE_PACK, built.packet);
  assert.equal(check.ok, true);
  if (check.ok) {
    assert.equal(check.hit, true);
    if (check.hit) assert.equal(check.killId, KILL_ID_STALE_DUC);
  }
  const validation = validateIssuePacket(built.packet);
  assert.equal(validation.ok, true);
});

test("buildPacketFromWell confidential well gets lag residue only when sealed", () => {
  const built = buildPacketFromWell({
    well: sampleWell({
      status: "Confidential",
      spud: Date.UTC(2026, 0, 1),
    }),
    pack: BAKKEN_PACK,
    proposedBy: "agent_propose",
    gate: "STOP",
    nowMs: NOW,
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(built.packet.outcomeClassId, "sealed");
  assert.ok(
    built.packet.residue.some((row) => row.id === RESIDUE_ID_CONFIDENTIAL_LAG),
  );
  // Always-on honesty residue still present; conditional duc-age absent.
  assert.ok(
    built.packet.residue.some((row) => row.id === "no-monthly-volumes"),
  );
  assert.equal(
    built.packet.residue.some((row) => row.id === RESIDUE_ID_DUC_AGE),
    false,
  );
});

test("buildPacketFromWell active well omits conditional residue", () => {
  const built = buildPacketFromWell({
    well: sampleWell({ status: "A", spud: Date.UTC(2025, 0, 1) }),
    pack: BAKKEN_PACK,
    proposedBy: "agent_propose",
    gate: "STOP",
    nowMs: NOW,
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(
    built.packet.residue.some((row) => row.id === RESIDUE_ID_CONFIDENTIAL_LAG),
    false,
  );
  assert.equal(
    built.packet.residue.some((row) => row.id === RESIDUE_ID_DUC_AGE),
    false,
  );
  assert.ok(built.packet.residue.length >= 1);
});

test("DUC_QUEUE_PACK declares stale-duc kill; BAKKEN does not", () => {
  assert.ok(
    DUC_QUEUE_PACK.killConditions.some((row) => row.id === KILL_ID_STALE_DUC),
  );
  assert.equal(
    BAKKEN_PACK.killConditions.some((row) => row.id === KILL_ID_STALE_DUC),
    false,
  );
});
