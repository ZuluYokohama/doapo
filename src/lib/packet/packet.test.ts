import assert from "node:assert/strict";
import { test } from "node:test";
import {
  exampleAgentSelfOpenStop,
  exampleHumanOpenCandidate,
} from "./fixtures/example-bakken-issue.ts";
import { BAKKEN_PACK } from "./packs/bakken.ts";
import { getPack, listPackIds, lookupPack } from "./packs/registry.ts";
import { PACKET_SCHEMA_VERSION, type IssuePacket } from "./types.ts";
import { validateDomainPack, validateIssuePacket } from "./validate.ts";
import {
  MAX_EVAL_REASONS,
  evaluatePacket,
  openCandidate,
  proposePacket,
} from "./roles.ts";

test("bakken pack validates", () => {
  const result = validateDomainPack(BAKKEN_PACK);
  assert.equal(result.ok, true);
  assert.equal(BAKKEN_PACK.id, "bakken");
  assert.equal(BAKKEN_PACK.schemaVersion, PACKET_SCHEMA_VERSION);
  assert.ok(BAKKEN_PACK.outcomeClasses.length >= 1);
  assert.ok(BAKKEN_PACK.killConditions.length >= 1);
});

test("bakken pack states non-affiliation residue", () => {
  let found = false;
  let i = 0;
  while (i < BAKKEN_PACK.residueDefaults.length) {
    if (BAKKEN_PACK.residueDefaults[i].id === "no-vendor-sop") {
      found = true;
      break;
    }
    i += 1;
  }
  assert.equal(found, true);
});

test("bakken pack states keys-we-hold residue", () => {
  let found = false;
  let i = 0;
  while (i < BAKKEN_PACK.residueDefaults.length) {
    if (BAKKEN_PACK.residueDefaults[i].id === "keys-we-hold") {
      found = true;
      break;
    }
    i += 1;
  }
  assert.equal(found, true);
});

test("agent cannot stamp OPEN_CANDIDATE", () => {
  const packet: IssuePacket = {
    schemaVersion: PACKET_SCHEMA_VERSION,
    packId: "bakken",
    packVersion: "1.0.0",
    subjectId: "file-1",
    subjectLabel: "Example Well",
    measuredFacts: [
      {
        key: "status",
        value: "A",
        evidence: "measured",
        sourceLabel: "NDIC GIS",
      },
    ],
    outcomeClassId: "producing",
    designIntent: null,
    fieldObservation: "Active on public index",
    advisorAnswers: [],
    residue: [],
    proposedBy: "agent_propose",
    gate: "OPEN_CANDIDATE",
    notes: "",
  };
  const result = validateIssuePacket(packet);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.reason, /anti-promotion/);
  }
});

test("human_open may propose OPEN_CANDIDATE", () => {
  const packet: IssuePacket = {
    schemaVersion: PACKET_SCHEMA_VERSION,
    packId: "bakken",
    packVersion: "1.0.0",
    subjectId: "file-2",
    subjectLabel: "Example Well 2",
    measuredFacts: [],
    outcomeClassId: "duc",
    designIntent: "Complete and bring online",
    fieldObservation: "NC on public index",
    advisorAnswers: [],
    residue: [
      {
        id: "no-monthly-volumes",
        statement: "Volumes not on open service",
        evidence: "measured",
      },
    ],
    proposedBy: "human_open",
    gate: "OPEN_CANDIDATE",
    notes: "Candidate only",
  };
  const result = validateIssuePacket(packet);
  assert.equal(result.ok, true);
});

test("registry getPack returns bakken", () => {
  const pack = getPack("bakken");
  assert.ok(pack !== null);
  if (pack !== null) {
    assert.equal(pack.id, BAKKEN_PACK.id);
    assert.equal(pack.version, BAKKEN_PACK.version);
  }
});

test("registry getPack unknown id is fail-closed", () => {
  const pack = getPack("not-a-real-pack");
  assert.equal(pack, null);
  const lookup = lookupPack("not-a-real-pack");
  assert.equal(lookup.ok, false);
  if (!lookup.ok) {
    assert.match(lookup.reason, /unknown pack id/);
  }
});

test("registry listPackIds is bounded and includes bakken", () => {
  const ids = listPackIds();
  assert.ok(ids.length >= 1);
  assert.ok(ids.length <= 16);
  let found = false;
  let i = 0;
  while (i < ids.length) {
    if (ids[i] === "bakken") {
      found = true;
      break;
    }
    i += 1;
  }
  assert.equal(found, true);
});

test("fixture agent self-OPEN is STOP under validate", () => {
  const packet = exampleAgentSelfOpenStop();
  assert.equal(packet.proposedBy, "agent_propose");
  assert.equal(packet.gate, "OPEN_CANDIDATE");
  assert.equal(packet.packId, BAKKEN_PACK.id);
  const result = validateIssuePacket(packet);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.reason, /anti-promotion/);
  }
});

test("fixture human OPEN_CANDIDATE validates", () => {
  const packet = exampleHumanOpenCandidate();
  assert.equal(packet.proposedBy, "human_open");
  assert.equal(packet.gate, "OPEN_CANDIDATE");
  assert.equal(packet.packId, BAKKEN_PACK.id);
  assert.equal(packet.packVersion, BAKKEN_PACK.version);
  const result = validateIssuePacket(packet);
  assert.equal(result.ok, true);
});

test("proposePacket rejects OPEN_CANDIDATE request", () => {
  const result = proposePacket({
    packId: "bakken",
    packVersion: "1.0.0",
    subjectId: "propose-open",
    subjectLabel: "Propose OPEN Reject",
    measuredFacts: [],
    outcomeClassId: null,
    designIntent: null,
    fieldObservation: null,
    advisorAnswers: [],
    residue: [],
    notes: "",
    gate: "OPEN_CANDIDATE",
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.reason, /anti-promotion/);
  }
});

test("proposePacket STOP is ok and validates", () => {
  const result = proposePacket({
    packId: "bakken",
    packVersion: "1.0.0",
    subjectId: "propose-stop",
    subjectLabel: "Propose STOP",
    measuredFacts: [
      {
        key: "status",
        value: "A",
        evidence: "measured",
        sourceLabel: "NDIC GIS",
      },
    ],
    outcomeClassId: "producing",
    designIntent: null,
    fieldObservation: "Active on public index",
    advisorAnswers: [],
    residue: [],
    notes: "agent STOP",
    gate: "STOP",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.packet.proposedBy, "agent_propose");
    assert.equal(result.packet.gate, "STOP");
    assert.equal(validateIssuePacket(result.packet).ok, true);
  }
});

test("evaluatePacket never returns gate OPEN_CANDIDATE", () => {
  const human = exampleHumanOpenCandidate();
  assert.equal(human.gate, "OPEN_CANDIDATE");
  const result = evaluatePacket(human);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.notEqual(result.packet.gate, "OPEN_CANDIDATE");
    assert.ok(
      result.verdict === "PASS" ||
        result.verdict === "FAIL" ||
        result.verdict === "RESIDUE",
    );
    assert.ok(result.reasons.length <= MAX_EVAL_REASONS);
  }

  const agentStop = proposePacket({
    packId: BAKKEN_PACK.id,
    packVersion: BAKKEN_PACK.version,
    subjectId: "eval-stop",
    subjectLabel: "Eval STOP",
    measuredFacts: [],
    outcomeClassId: null,
    designIntent: null,
    fieldObservation: null,
    advisorAnswers: [],
    residue: [
      {
        id: "keys-we-hold",
        statement: "DOAPO owns the gate.",
        evidence: "derived",
      },
    ],
    notes: "",
    gate: "STOP",
  });
  assert.equal(agentStop.ok, true);
  if (agentStop.ok) {
    const scored = evaluatePacket(agentStop.packet);
    assert.equal(scored.ok, true);
    if (scored.ok) {
      assert.notEqual(scored.packet.gate, "OPEN_CANDIDATE");
      assert.equal(scored.verdict, "RESIDUE");
    }
  }
});

test("openCandidate from agent_propose or evaluator fails", () => {
  const base = exampleHumanOpenCandidate();
  base.gate = "STOP";
  base.proposedBy = "agent_propose";
  const fromAgent = openCandidate(base, "agent_propose");
  assert.equal(fromAgent.ok, false);
  if (!fromAgent.ok) {
    assert.match(fromAgent.reason, /human_open/);
  }
  const fromEval = openCandidate(base, "evaluator");
  assert.equal(fromEval.ok, false);
  if (!fromEval.ok) {
    assert.match(fromEval.reason, /human_open/);
  }
});

test("openCandidate from human_open yields OPEN_CANDIDATE", () => {
  const proposed = proposePacket({
    packId: BAKKEN_PACK.id,
    packVersion: BAKKEN_PACK.version,
    subjectId: "open-human",
    subjectLabel: "Open Human Path",
    measuredFacts: [
      {
        key: "status",
        value: "NC",
        evidence: "measured",
        sourceLabel: "NDIC GIS",
      },
    ],
    outcomeClassId: "duc",
    designIntent: "Complete and bring online",
    fieldObservation: "NC on public index",
    advisorAnswers: [],
    residue: [
      {
        id: "no-monthly-volumes",
        statement: "Volumes not on open service",
        evidence: "measured",
      },
    ],
    notes: "ready for human OPEN",
    gate: "RESIDUE",
  });
  assert.equal(proposed.ok, true);
  if (!proposed.ok) return;
  const opened = openCandidate(proposed.packet, "human_open");
  assert.equal(opened.ok, true);
  if (opened.ok) {
    assert.equal(opened.packet.gate, "OPEN_CANDIDATE");
    assert.equal(opened.packet.proposedBy, "human_open");
    assert.equal(validateIssuePacket(opened.packet).ok, true);
  }
});
