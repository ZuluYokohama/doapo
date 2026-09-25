import assert from "node:assert/strict";
import { test } from "node:test";
import {
  exampleAgentSelfOpenStop,
  exampleHumanOpenCandidate,
} from "../lib/packet/fixtures/example-bakken-issue.ts";
import { BAKKEN_PACK } from "../lib/packet/packs/bakken.ts";
import { buildInspectorModel } from "./packet-inspector-model.ts";

test("buildInspectorModel maps bakken human OPEN fixture", () => {
  const packet = exampleHumanOpenCandidate();
  const model = buildInspectorModel(BAKKEN_PACK, packet);
  assert.equal(model.packId, "bakken");
  assert.equal(model.packVersion, BAKKEN_PACK.version);
  assert.equal(model.gate, "OPEN_CANDIDATE");
  assert.equal(model.proposedBy, "human_open");
  assert.equal(model.subjectId, "fixture-human-open");
  assert.ok(model.facts.length >= 1);
  assert.ok(model.residue.length >= 1);
  assert.ok(model.killConditions.length >= 1);
  assert.ok(model.arenaBenchmarks.length >= 1);
  assert.equal(model.factsTruncated, false);
  assert.equal(model.residueTruncated, false);
  assert.equal(model.designIntent, "Complete and bring online");
});

test("buildInspectorModel maps agent self-OPEN fixture fields", () => {
  const packet = exampleAgentSelfOpenStop();
  const model = buildInspectorModel(BAKKEN_PACK, packet);
  assert.equal(model.gate, "OPEN_CANDIDATE");
  assert.equal(model.proposedBy, "agent_propose");
  assert.equal(model.subjectId, "fixture-agent-self-open");
  assert.match(model.notes, /STOP example/);
  assert.ok(model.killConditions.length === BAKKEN_PACK.killConditions.length);
});
