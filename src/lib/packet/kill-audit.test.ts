import assert from "node:assert/strict";
import { test } from "node:test";
import { exampleHumanOpenCandidate } from "./fixtures/example-bakken-issue.ts";
import { BAKKEN_PACK } from "./packs/bakken.ts";
import { DUC_QUEUE_PACK } from "./packs/duc-queue.ts";
import type { DomainPack, IssuePacket, KillCondition } from "./types.ts";
import {
  MAX_AUDIT_PACKS,
  auditKillsAcrossPacks,
  auditPacketKills,
  listKillAuditHits,
  listPacksForAudit,
  mergePacksForAudit,
} from "./kill-audit.ts";

function packWithKill(id: string, killId: string): DomainPack {
  const kill: KillCondition = {
    id: killId,
    statement: "STOP when " + killId + " is triggered.",
  };
  return {
    ...BAKKEN_PACK,
    id,
    version: "9.9.9",
    killConditions: [kill],
  };
}

function packetWithKillFact(killId: string): IssuePacket {
  const base = exampleHumanOpenCandidate();
  const fact = {
    key: "kill:" + killId,
    value: "triggered",
    evidence: "measured" as const,
    sourceLabel: "test-kill",
  };
  return {
    ...base,
    measuredFacts: [...base.measuredFacts, fact].slice(0, 128),
  };
}

test("auditKillsAcrossPacks miss on bakken + duc with clean packet", () => {
  const packet = exampleHumanOpenCandidate();
  const result = auditKillsAcrossPacks({
    packet,
    packs: [BAKKEN_PACK, DUC_QUEUE_PACK],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.audited, 2);
  assert.equal(result.hitCount, 0);
  assert.equal(result.rows[0].packId, "bakken");
  assert.equal(result.rows[0].hit, false);
  assert.equal(result.rows[1].packId, "bakken-duc");
  assert.equal(result.rows[1].hit, false);
});

test("auditKillsAcrossPacks hit only on pack that defines the kill", () => {
  const shared = packWithKill("pack-a", "cross-kill-a");
  const other = packWithKill("pack-b", "other-kill");
  const packet = packetWithKillFact("cross-kill-a");
  const result = auditPacketKills(packet, [shared, other]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.audited, 2);
  assert.equal(result.hitCount, 1);
  assert.equal(result.rows[0].hit, true);
  assert.equal(result.rows[0].killId, "cross-kill-a");
  assert.equal(result.rows[1].hit, false);
  const hits = listKillAuditHits(result.rows);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].packId, "pack-a");
});

test("auditKillsAcrossPacks prefer overlay for matching id", () => {
  const overlay = packWithKill("bakken", "overlay-kill");
  const packet = packetWithKillFact("overlay-kill");
  const result = auditKillsAcrossPacks({
    packet,
    packs: [BAKKEN_PACK],
    overlay,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.audited, 1);
  assert.equal(result.rows[0].packId, "bakken");
  assert.equal(result.rows[0].packVersion, "9.9.9");
  assert.equal(result.rows[0].hit, true);
  assert.equal(result.rows[0].killId, "overlay-kill");
});

test("auditKillsAcrossPacks appends overlay when id not listed", () => {
  const overlay = packWithKill("session-only", "sess-kill");
  const packet = packetWithKillFact("sess-kill");
  const result = auditKillsAcrossPacks({
    packet,
    packs: [BAKKEN_PACK],
    overlay,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.audited, 2);
  assert.equal(result.rows[1].packId, "session-only");
  assert.equal(result.rows[1].hit, true);
});

test("auditKillsAcrossPacks fail-closed on empty packs", () => {
  const result = auditKillsAcrossPacks({
    packet: exampleHumanOpenCandidate(),
    packs: [],
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /packs empty/);
});

test("auditKillsAcrossPacks fail-closed on missing packet", () => {
  const result = auditKillsAcrossPacks({
    packet: null as unknown as IssuePacket,
    packs: [BAKKEN_PACK],
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /packet/);
});

test("auditKillsAcrossPacks fail-closed on invalid maxPacks", () => {
  const result = auditKillsAcrossPacks({
    packet: exampleHumanOpenCandidate(),
    packs: [BAKKEN_PACK],
    maxPacks: 0,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /maxPacks/);
});

test("auditKillsAcrossPacks respects maxPacks cap", () => {
  const packs = [
    packWithKill("p1", "k1"),
    packWithKill("p2", "k2"),
    packWithKill("p3", "k3"),
  ];
  const result = auditKillsAcrossPacks({
    packet: exampleHumanOpenCandidate(),
    packs,
    maxPacks: 2,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.audited, 2);
  assert.equal(result.rows.length, 2);
});

test("listPacksForAudit returns registered packs bounded", () => {
  const packs = listPacksForAudit(null);
  assert.ok(packs.length >= 2);
  assert.ok(packs.length <= MAX_AUDIT_PACKS);
  assert.equal(packs[0].id, "bakken");
});

test("mergePacksForAudit does not mutate input", () => {
  const packs = [BAKKEN_PACK];
  const overlay = packWithKill("bakken", "x");
  const merged = mergePacksForAudit(packs, overlay);
  assert.equal(packs[0].version, BAKKEN_PACK.version);
  assert.equal(merged[0].version, "9.9.9");
});

test("listKillAuditHits returns only hits bounded", () => {
  const rows = [
    { packId: "a", packVersion: "1", hit: false },
    { packId: "b", packVersion: "1", hit: true, killId: "k1" },
    { packId: "c", packVersion: "1", hit: true, killId: "k2" },
  ];
  const hits = listKillAuditHits(rows);
  assert.equal(hits.length, 2);
  assert.equal(hits[0].packId, "b");
});
