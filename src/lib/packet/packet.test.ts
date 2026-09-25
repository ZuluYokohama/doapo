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
