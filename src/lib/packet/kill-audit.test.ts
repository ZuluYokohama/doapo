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
import { createHash } from "node:crypto";
import {
  DEFAULT_KILL_AUDIT_EXPORT_NOTES,
  KILL_AUDIT_SCHEMA_VERSION,
  MAX_KILL_AUDIT_JSON_CHARS,
  exportKillAudit,
  importKillAudit,
  killAuditFilename,
} from "./kill-audit-export.ts";

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

test("exportKillAudit happy path with digest", () => {
  const packet = exampleHumanOpenCandidate();
  const result = exportKillAudit({
    packet,
    packs: [BAKKEN_PACK, DUC_QUEUE_PACK],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.bundle.schemaVersion, KILL_AUDIT_SCHEMA_VERSION);
  assert.equal(result.bundle.subjectId, packet.subjectId);
  assert.equal(result.bundle.packetPackId, packet.packId);
  assert.equal(result.bundle.audited, 2);
  assert.equal(result.bundle.hitCount, 0);
  assert.equal(result.bundle.rows.length, 2);
  assert.equal(result.bundle.bundleDigest.length, 64);
  assert.match(result.bundle.notes, /demo cross-pack|not durable/i);
  assert.ok(result.json.includes(packet.subjectId));
  assert.ok(result.json.includes(result.bundle.bundleDigest));
});

test("exportKillAudit digest matches canonical recompute", () => {
  const result = exportKillAudit({
    packet: exampleHumanOpenCandidate(),
    packs: [BAKKEN_PACK],
    notes: "unit-test notes",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const ordered = {
    schemaVersion: result.bundle.schemaVersion,
    exportedAtIso: result.bundle.exportedAtIso,
    subjectId: result.bundle.subjectId,
    packetPackId: result.bundle.packetPackId,
    audited: result.bundle.audited,
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

test("exportKillAudit includes hit rows with killId", () => {
  const shared = packWithKill("pack-a", "cross-kill-a");
  const other = packWithKill("pack-b", "other-kill");
  const packet = packetWithKillFact("cross-kill-a");
  const result = exportKillAudit({
    packet,
    packs: [shared, other],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.bundle.audited, 2);
  assert.equal(result.bundle.hitCount, 1);
  assert.equal(result.bundle.rows[0].hit, true);
  assert.equal(result.bundle.rows[0].killId, "cross-kill-a");
  assert.equal(result.bundle.rows[1].hit, false);
});

test("exportKillAudit fail-closed via audit (invalid maxPacks)", () => {
  const result = exportKillAudit({
    packet: exampleHumanOpenCandidate(),
    packs: [BAKKEN_PACK],
    maxPacks: 0,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /maxPacks/);
});

test("exportKillAudit fail-closed on missing packet", () => {
  const result = exportKillAudit({
    packet: null as unknown as IssuePacket,
    packs: [BAKKEN_PACK],
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /packet/);
});

test("exportKillAudit fail-closed on missing packs", () => {
  const result = exportKillAudit({
    packet: exampleHumanOpenCandidate(),
    packs: null as unknown as DomainPack[],
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /packs/);
});

test("exportKillAudit fail-closed on empty packs", () => {
  const result = exportKillAudit({
    packet: exampleHumanOpenCandidate(),
    packs: [],
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /packs empty/);
});

test("exportKillAudit prefers overlay for matching id", () => {
  const overlay = packWithKill("bakken", "overlay-kill");
  const packet = packetWithKillFact("overlay-kill");
  const result = exportKillAudit({
    packet,
    packs: [BAKKEN_PACK],
    overlay,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.bundle.audited, 1);
  assert.equal(result.bundle.rows[0].packVersion, "9.9.9");
  assert.equal(result.bundle.rows[0].hit, true);
  assert.equal(result.bundle.rows[0].killId, "overlay-kill");
});

test("exportKillAudit respects maxPacks via audit", () => {
  const packs = [
    packWithKill("p1", "k1"),
    packWithKill("p2", "k2"),
    packWithKill("p3", "k3"),
  ];
  const result = exportKillAudit({
    packet: exampleHumanOpenCandidate(),
    packs,
    maxPacks: 2,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.bundle.audited, 2);
  assert.equal(result.bundle.rows.length, 2);
});

test("killAuditFilename sanitizes and truncates", () => {
  assert.equal(killAuditFilename("well-1"), "kill-audit-well-1.json");
  assert.equal(killAuditFilename("a/b:c"), "kill-audit-a_b_c.json");
  assert.equal(killAuditFilename(""), "kill-audit-unknown.json");
  const long = "x".repeat(80);
  const name = killAuditFilename(long);
  assert.ok(name.startsWith("kill-audit-"));
  assert.ok(name.endsWith(".json"));
  assert.ok(name.length < 80);
});

test("exportKillAudit clones rows (mutation safe)", () => {
  const result = exportKillAudit({
    packet: exampleHumanOpenCandidate(),
    packs: [BAKKEN_PACK],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const before = result.bundle.rows[0].packId;
  result.bundle.rows[0].packId = before + "-mutated";
  const again = exportKillAudit({
    packet: exampleHumanOpenCandidate(),
    packs: [BAKKEN_PACK],
  });
  assert.equal(again.ok, true);
  if (!again.ok) return;
  assert.equal(again.bundle.rows[0].packId, before);
});

test("exportKillAudit default notes when omitted", () => {
  const result = exportKillAudit({
    packet: exampleHumanOpenCandidate(),
    packs: [BAKKEN_PACK],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.bundle.notes, DEFAULT_KILL_AUDIT_EXPORT_NOTES);
});

test("importKillAudit round-trip export → import", () => {
  const packet = exampleHumanOpenCandidate();
  const exported = exportKillAudit({
    packet,
    packs: [BAKKEN_PACK, DUC_QUEUE_PACK],
  });
  assert.equal(exported.ok, true);
  if (!exported.ok) return;
  assert.ok(exported.json.length < MAX_KILL_AUDIT_JSON_CHARS);
  const imported = importKillAudit(exported.json);
  assert.equal(imported.ok, true);
  if (!imported.ok) return;
  assert.equal(imported.bundle.schemaVersion, KILL_AUDIT_SCHEMA_VERSION);
  assert.equal(imported.bundle.bundleDigest, exported.bundle.bundleDigest);
  assert.equal(imported.bundle.subjectId, packet.subjectId);
  assert.equal(imported.bundle.packetPackId, packet.packId);
  assert.equal(imported.bundle.audited, 2);
  assert.equal(imported.bundle.rows.length, 2);
});

test("importKillAudit fail-closed on digest mismatch", () => {
  const exported = exportKillAudit({
    packet: exampleHumanOpenCandidate(),
    packs: [BAKKEN_PACK],
  });
  assert.equal(exported.ok, true);
  if (!exported.ok) return;
  const tampered = exported.json.replace(
    exported.bundle.notes,
    exported.bundle.notes + "x",
  );
  const imported = importKillAudit(tampered);
  assert.equal(imported.ok, false);
  if (imported.ok) return;
  assert.match(imported.reason, /bundleDigest mismatch|notes/);
});

test("importKillAudit fail-closed on schemaVersion mismatch", () => {
  const exported = exportKillAudit({
    packet: exampleHumanOpenCandidate(),
    packs: [BAKKEN_PACK],
  });
  assert.equal(exported.ok, true);
  if (!exported.ok) return;
  const bad = exported.json.replace(
    KILL_AUDIT_SCHEMA_VERSION,
    "doapo-kill-audit/999",
  );
  const imported = importKillAudit(bad);
  assert.equal(imported.ok, false);
  if (imported.ok) return;
  assert.match(imported.reason, /schemaVersion/);
});

test("importKillAudit fail-closed on empty text", () => {
  const imported = importKillAudit("");
  assert.equal(imported.ok, false);
  if (imported.ok) return;
  assert.match(imported.reason, /empty/);
});

test("importKillAudit fail-closed on invalid JSON", () => {
  const imported = importKillAudit("{not-json");
  assert.equal(imported.ok, false);
  if (imported.ok) return;
  assert.match(imported.reason, /JSON parse/);
});

test("importKillAudit fail-closed on size cap", () => {
  const huge = "x".repeat(MAX_KILL_AUDIT_JSON_CHARS + 1);
  const imported = importKillAudit(huge);
  assert.equal(imported.ok, false);
  if (imported.ok) return;
  assert.match(imported.reason, /size cap/);
});
