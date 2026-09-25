import assert from "node:assert/strict";
import { test } from "node:test";
import {
  exampleAgentSelfOpenStop,
  exampleHumanOpenCandidate,
} from "./fixtures/example-bakken-issue.ts";
import {
  exampleDucAgentSelfOpenStop,
  exampleDucHumanOpenCandidate,
} from "./fixtures/example-duc-queue-issue.ts";
import { BAKKEN_PACK } from "./packs/bakken.ts";
import { DUC_QUEUE_PACK } from "./packs/duc-queue.ts";
import { getPack, listPackIds, lookupPack, MAX_REGISTERED_PACKS } from "./packs/registry.ts";
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

test("registry listPackIds is bounded and includes bakken and bakken-duc", () => {
  const ids = listPackIds();
  assert.ok(ids.length >= 2);
  assert.ok(ids.length <= MAX_REGISTERED_PACKS);
  let foundBakken = false;
  let foundDuc = false;
  let i = 0;
  while (i < ids.length) {
    if (ids[i] === "bakken") foundBakken = true;
    if (ids[i] === "bakken-duc") foundDuc = true;
    i += 1;
  }
  assert.equal(foundBakken, true);
  assert.equal(foundDuc, true);
});


test("duc-queue pack validates", () => {
  const result = validateDomainPack(DUC_QUEUE_PACK);
  assert.equal(result.ok, true);
  assert.equal(DUC_QUEUE_PACK.id, "bakken-duc");
  assert.equal(DUC_QUEUE_PACK.schemaVersion, PACKET_SCHEMA_VERSION);
  assert.equal(DUC_QUEUE_PACK.version, "1.0.0");
  assert.ok(DUC_QUEUE_PACK.outcomeClasses.length >= 1);
  assert.ok(DUC_QUEUE_PACK.killConditions.length >= 1);
});

test("duc-queue pack emphasizes NC / duc outcome class", () => {
  let found = false;
  let i = 0;
  while (i < DUC_QUEUE_PACK.outcomeClasses.length) {
    const row = DUC_QUEUE_PACK.outcomeClasses[i];
    if (row.id === "duc") {
      found = true;
      let hasNc = false;
      let j = 0;
      while (j < row.statusCodes.length) {
        if (row.statusCodes[j] === "NC") {
          hasNc = true;
          break;
        }
        j += 1;
      }
      assert.equal(hasNc, true);
      break;
    }
    i += 1;
  }
  assert.equal(found, true);
});

test("duc-queue pack states shared-substrate residue", () => {
  let found = false;
  let i = 0;
  while (i < DUC_QUEUE_PACK.residueDefaults.length) {
    if (DUC_QUEUE_PACK.residueDefaults[i].id === "shared-ndic-different-lens") {
      found = true;
      break;
    }
    i += 1;
  }
  assert.equal(found, true);
});

test("duc-queue pack states required honesty residue", () => {
  const needed = ["no-monthly-volumes", "no-vendor-sop", "keys-we-hold"];
  let n = 0;
  while (n < needed.length) {
    let found = false;
    let i = 0;
    while (i < DUC_QUEUE_PACK.residueDefaults.length) {
      if (DUC_QUEUE_PACK.residueDefaults[i].id === needed[n]) {
        found = true;
        break;
      }
      i += 1;
    }
    assert.equal(found, true, "missing residue " + needed[n]);
    n += 1;
  }
});

test("registry getPack returns bakken-duc", () => {
  const pack = getPack("bakken-duc");
  assert.ok(pack !== null);
  if (pack !== null) {
    assert.equal(pack.id, DUC_QUEUE_PACK.id);
    assert.equal(pack.version, DUC_QUEUE_PACK.version);
  }
  const lookup = lookupPack("bakken-duc");
  assert.equal(lookup.ok, true);
  if (lookup.ok) {
    assert.equal(lookup.pack.id, "bakken-duc");
  }
});

test("fixture duc agent self-OPEN is STOP under validate", () => {
  const packet = exampleDucAgentSelfOpenStop();
  assert.equal(packet.proposedBy, "agent_propose");
  assert.equal(packet.gate, "OPEN_CANDIDATE");
  assert.equal(packet.packId, DUC_QUEUE_PACK.id);
  const result = validateIssuePacket(packet);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.reason, /anti-promotion/);
  }
});

test("fixture duc human OPEN_CANDIDATE validates", () => {
  const packet = exampleDucHumanOpenCandidate();
  assert.equal(packet.proposedBy, "human_open");
  assert.equal(packet.gate, "OPEN_CANDIDATE");
  assert.equal(packet.packId, DUC_QUEUE_PACK.id);
  assert.equal(packet.packVersion, DUC_QUEUE_PACK.version);
  assert.equal(packet.outcomeClassId, "duc");
  const result = validateIssuePacket(packet);
  assert.equal(result.ok, true);
});

test("registered pack count stays within MAX_REGISTERED_PACKS", () => {
  const ids = listPackIds();
  assert.ok(ids.length <= MAX_REGISTERED_PACKS);
  assert.ok(ids.length >= 2);
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

import {
  MAX_SEALS,
  appendOpenSeal,
  appendSeal,
  computeSealDigest,
  createLedger,
  listRecentSeals,
  listSeals,
  sealFromPacket,
  tipDigest,
  type SealAppendInput,
} from "./ledger.ts";

function makeSealInput(
  overrides: Partial<SealAppendInput> & Pick<SealAppendInput, "id" | "prevDigest">,
): SealAppendInput {
  return {
    id: overrides.id,
    atIso: overrides.atIso ?? "2026-09-25T12:00:00.000Z",
    kind: overrides.kind ?? "propose",
    packetSubjectId: overrides.packetSubjectId ?? "subj-1",
    packId: overrides.packId ?? "bakken",
    gate: overrides.gate ?? "STOP",
    proposedBy: overrides.proposedBy ?? "agent_propose",
    prevDigest: overrides.prevDigest,
    note: overrides.note ?? "test seal",
  };
}

test("ledger genesis append sets tip", () => {
  const ledger = createLedger();
  assert.equal(tipDigest(ledger), null);
  assert.equal(listSeals(ledger).length, 0);
  const result = appendSeal(
    ledger,
    makeSealInput({ id: "seal-0", prevDigest: "" }),
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.record.prevDigest, "");
    assert.ok(result.record.digest.length === 64);
    assert.equal(tipDigest(result.ledger), result.record.digest);
    assert.equal(listSeals(result.ledger).length, 1);
  }
});

test("ledger chain integrity: tip links next prevDigest", () => {
  const g = appendSeal(
    createLedger(),
    makeSealInput({ id: "seal-0", prevDigest: "" }),
  );
  assert.equal(g.ok, true);
  if (!g.ok) return;
  const tip = tipDigest(g.ledger);
  assert.ok(tip !== null);
  const next = appendSeal(
    g.ledger,
    makeSealInput({
      id: "seal-1",
      prevDigest: tip as string,
      kind: "evaluate",
      note: "eval pass",
    }),
  );
  assert.equal(next.ok, true);
  if (next.ok) {
    assert.equal(next.record.prevDigest, tip);
    assert.equal(listSeals(next.ledger).length, 2);
    assert.equal(tipDigest(next.ledger), next.record.digest);
  }
});

test("ledger rejects tampered prevDigest", () => {
  const g = appendSeal(
    createLedger(),
    makeSealInput({ id: "seal-0", prevDigest: "" }),
  );
  assert.equal(g.ok, true);
  if (!g.ok) return;
  const bad = appendSeal(
    g.ledger,
    makeSealInput({
      id: "seal-bad",
      prevDigest: "deadbeef".repeat(8),
    }),
  );
  assert.equal(bad.ok, false);
  if (!bad.ok) {
    assert.match(bad.reason, /prevDigest does not match tip/);
  }
  const badGenesis = appendSeal(
    createLedger(),
    makeSealInput({ id: "seal-x", prevDigest: "not-empty" }),
  );
  assert.equal(badGenesis.ok, false);
  if (!badGenesis.ok) {
    assert.match(badGenesis.reason, /genesis/);
  }
});

test("ledger rejects over-capacity", () => {
  let ledger = createLedger();
  let i = 0;
  while (i < MAX_SEALS) {
    const tip = tipDigest(ledger);
    const prev = tip === null ? "" : tip;
    const r = appendSeal(
      ledger,
      makeSealInput({
        id: "s-" + String(i),
        prevDigest: prev,
        note: "n-" + String(i),
      }),
    );
    assert.equal(r.ok, true);
    if (!r.ok) return;
    ledger = r.ledger;
    i += 1;
  }
  assert.equal(listSeals(ledger).length, MAX_SEALS);
  const tip = tipDigest(ledger);
  assert.ok(tip !== null);
  const overflow = appendSeal(
    ledger,
    makeSealInput({
      id: "overflow",
      prevDigest: tip as string,
    }),
  );
  assert.equal(overflow.ok, false);
  if (!overflow.ok) {
    assert.match(overflow.reason, /MAX_SEALS/);
  }
});

test("ledger digests change with content", () => {
  const a = computeSealDigest({
    id: "same-id",
    atIso: "2026-09-25T12:00:00.000Z",
    kind: "propose",
    packetSubjectId: "subj",
    packId: "bakken",
    gate: "STOP",
    proposedBy: "agent_propose",
    prevDigest: "",
    note: "note-a",
  });
  const b = computeSealDigest({
    id: "same-id",
    atIso: "2026-09-25T12:00:00.000Z",
    kind: "propose",
    packetSubjectId: "subj",
    packId: "bakken",
    gate: "STOP",
    proposedBy: "agent_propose",
    prevDigest: "",
    note: "note-b",
  });
  assert.notEqual(a, b);
  assert.equal(a.length, 64);
  assert.equal(b.length, 64);
});

test("sealFromPacket and appendOpenSeal after openCandidate", () => {
  const proposed = proposePacket({
    packId: BAKKEN_PACK.id,
    packVersion: BAKKEN_PACK.version,
    subjectId: "ledger-open",
    subjectLabel: "Ledger Open",
    measuredFacts: [],
    outcomeClassId: null,
    designIntent: null,
    fieldObservation: null,
    advisorAnswers: [],
    residue: [],
    notes: "for seal",
    gate: "STOP",
  });
  assert.equal(proposed.ok, true);
  if (!proposed.ok) return;

  let ledger = createLedger();
  const proposeInput = sealFromPacket(
    proposed.packet,
    "propose",
    "",
    "propose STOP",
  );
  const sealedPropose = appendSeal(ledger, proposeInput);
  assert.equal(sealedPropose.ok, true);
  if (!sealedPropose.ok) return;
  ledger = sealedPropose.ledger;

  const opened = openCandidate(proposed.packet, "human_open");
  assert.equal(opened.ok, true);
  if (!opened.ok) return;
  const sealedOpen = appendOpenSeal(ledger, opened);
  assert.equal(sealedOpen.ok, true);
  if (sealedOpen.ok) {
    assert.equal(sealedOpen.record.kind, "open");
    assert.equal(sealedOpen.record.gate, "OPEN_CANDIDATE");
    assert.equal(listSeals(sealedOpen.ledger).length, 2);
    const recent = listRecentSeals(sealedOpen.ledger, 8);
    assert.equal(recent.length, 2);
  }
});
