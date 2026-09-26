/**
 * Kill fact authoring helper tests.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  KILL_TRIGGER_VALUE,
  MAX_KILL_CONDITIONS,
  MAX_MEASURED_FACTS,
  MAX_WELL_FACTS,
  applyKillGate,
  checkKillConditions,
  evaluatePacket,
  isKillTriggered,
  killFactKey,
  listKillConditionsForUi,
  setKillTriggered,
  validateIssuePacket,
} from "./index.ts";
import { BAKKEN_PACK } from "./packs/bakken.ts";
import { exampleHumanOpenCandidate } from "./fixtures/example-bakken-issue.ts";

test("killFactKey prefers kill: prefix", () => {
  assert.equal(killFactKey("invented-volumes"), "kill:invented-volumes");
  assert.ok(killFactKey("x").startsWith("kill:"));
});

test("setKillTriggered adds preferred kill:<id>=triggered", () => {
  const packet = exampleHumanOpenCandidate();
  packet.gate = "STOP";
  packet.proposedBy = "agent_propose";
  const before = packet.measuredFacts.length;
  assert.equal(isKillTriggered(packet.measuredFacts, "invented-volumes"), false);
  const result = setKillTriggered(packet, "invented-volumes", true);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.packet.measuredFacts.length, before + 1);
  assert.equal(isKillTriggered(result.packet.measuredFacts, "invented-volumes"), true);
  const last = result.packet.measuredFacts[result.packet.measuredFacts.length - 1];
  assert.equal(last.key, "kill:invented-volumes");
  assert.equal(last.value, KILL_TRIGGER_VALUE);
  assert.equal(last.evidence, "measured");
  assert.equal(packet.measuredFacts.length, before);
});

test("setKillTriggered clears matching facts when false", () => {
  const packet = exampleHumanOpenCandidate();
  packet.gate = "STOP";
  packet.proposedBy = "agent_propose";
  const on = setKillTriggered(packet, "agent-self-open", true);
  assert.equal(on.ok, true);
  if (!on.ok) return;
  assert.equal(isKillTriggered(on.packet.measuredFacts, "agent-self-open"), true);
  const off = setKillTriggered(on.packet, "agent-self-open", false);
  assert.equal(off.ok, true);
  if (!off.ok) return;
  assert.equal(isKillTriggered(off.packet.measuredFacts, "agent-self-open"), false);
  let i = 0;
  while (i < off.packet.measuredFacts.length) {
    assert.notEqual(off.packet.measuredFacts[i].key, "agent-self-open");
    assert.notEqual(off.packet.measuredFacts[i].key, "kill:agent-self-open");
    i += 1;
  }
});

test("setKillTriggered normalizes bare key to preferred on update", () => {
  const packet = exampleHumanOpenCandidate();
  packet.gate = "STOP";
  packet.proposedBy = "agent_propose";
  packet.measuredFacts = packet.measuredFacts.slice();
  packet.measuredFacts.push({
    key: "external-doc-as-sop",
    value: "pending",
    evidence: "measured",
    sourceLabel: "field",
  });
  const result = setKillTriggered(packet, "external-doc-as-sop", true);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  let bare = 0;
  let pref = 0;
  let i = 0;
  while (i < result.packet.measuredFacts.length) {
    const key = result.packet.measuredFacts[i].key;
    if (key === "external-doc-as-sop") bare += 1;
    if (key === "kill:external-doc-as-sop") {
      pref += 1;
      assert.equal(result.packet.measuredFacts[i].value, KILL_TRIGGER_VALUE);
    }
    i += 1;
  }
  assert.equal(bare, 0);
  assert.equal(pref, 1);
  assert.equal(isKillTriggered(result.packet.measuredFacts, "external-doc-as-sop"), true);
});

test("setKillTriggered fail-closed on bad inputs and full list", () => {
  const packet = exampleHumanOpenCandidate();
  const emptyId = setKillTriggered(packet, "", true);
  assert.equal(emptyId.ok, false);
  if (!emptyId.ok) {
    assert.match(emptyId.reason, /killId/);
  }
  const full = {
    ...packet,
    measuredFacts: [] as typeof packet.measuredFacts,
  };
  let i = 0;
  while (i < MAX_MEASURED_FACTS) {
    full.measuredFacts.push({
      key: "pad-" + String(i),
      value: "x",
      evidence: "measured",
      sourceLabel: "pad",
    });
    i += 1;
  }
  const over = setKillTriggered(full, "invented-volumes", true);
  assert.equal(over.ok, false);
  if (!over.ok) {
    assert.match(over.reason, /full/);
  }
  const clearOk = setKillTriggered(full, "invented-volumes", false);
  assert.equal(clearOk.ok, true);
  assert.ok(MAX_WELL_FACTS <= MAX_MEASURED_FACTS);
});

test("setKillTriggered feeds checkKillConditions and evaluate", () => {
  const packet = exampleHumanOpenCandidate();
  packet.gate = "STOP";
  packet.proposedBy = "agent_propose";
  packet.residue = [];
  const set = setKillTriggered(packet, "invented-volumes", true);
  assert.equal(set.ok, true);
  if (!set.ok) return;
  const check = checkKillConditions(BAKKEN_PACK, set.packet);
  assert.equal(check.ok, true);
  if (check.ok) {
    assert.equal(check.hit, true);
    if (check.hit) assert.equal(check.killId, "invented-volumes");
  }
  const gated = applyKillGate(BAKKEN_PACK, set.packet);
  assert.equal(gated.gate, "STOP");
  const scored = evaluatePacket(set.packet);
  assert.equal(scored.ok, true);
  if (scored.ok) {
    assert.equal(scored.verdict, "FAIL");
  }
  const valid = validateIssuePacket(set.packet);
  assert.equal(valid.ok, true);
});

test("listKillConditionsForUi bounded", () => {
  const listed = listKillConditionsForUi(BAKKEN_PACK.killConditions);
  assert.ok(listed.length >= 1);
  assert.ok(listed.length <= MAX_KILL_CONDITIONS);
  assert.equal(listed[0].id.length > 0, true);
});

test("clear when not present is ok (idempotent)", () => {
  const packet = exampleHumanOpenCandidate();
  const before = packet.measuredFacts.length;
  const result = setKillTriggered(packet, "unverified-org-claim", false);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.packet.measuredFacts.length, before);
});
