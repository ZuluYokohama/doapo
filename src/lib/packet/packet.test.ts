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
import { MAX_ADVISOR_ANSWERS, PACKET_SCHEMA_VERSION, type IssuePacket } from "./types.ts";
import { validateDomainPack, validateIssuePacket } from "./validate.ts";
import {
  MAX_EVAL_REASONS,
  evaluatePacket,
  openCandidate,
  proposePacket,
} from "./roles.ts";
import {
  KILL_TRIGGER_VALUE,
  applyKillGate,
  buildKillHaystack,
  checkKillConditions,
} from "./kill-check.ts";
import {
  allowedAnswerRoles,
  findAdvisorAnswer,
  listAdvisorChecksForUi,
  setAdvisorAnswer,
} from "./advisor-answer.ts";

test("bakken pack validates", () => {
  const result = validateDomainPack(BAKKEN_PACK);
  assert.equal(result.ok, true);
  assert.equal(BAKKEN_PACK.id, "bakken");
  assert.equal(BAKKEN_PACK.schemaVersion, PACKET_SCHEMA_VERSION);
  assert.ok(BAKKEN_PACK.outcomeClasses.length >= 1);
  assert.ok(BAKKEN_PACK.killConditions.length >= 1);
});

test("bakken pack states public-docs-not-sop residue", () => {
  let found = false;
  let i = 0;
  while (i < BAKKEN_PACK.residueDefaults.length) {
    if (BAKKEN_PACK.residueDefaults[i].id === "public-docs-not-sop") {
      found = true;
      break;
    }
    i += 1;
  }
  assert.equal(found, true);
});

test("bakken pack states gate-authority residue", () => {
  let found = false;
  let i = 0;
  while (i < BAKKEN_PACK.residueDefaults.length) {
    if (BAKKEN_PACK.residueDefaults[i].id === "gate-authority") {
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
  assert.equal(DUC_QUEUE_PACK.version, "1.1.1");
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
  const needed = ["no-monthly-volumes", "public-docs-not-sop", "gate-authority"];
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
        id: "gate-authority",
        statement: "Gate authority defined by this pack schema.",
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
  UI_LEDGER_CAP,
  appendOpenSeal,
  appendSeal,
  computeSealDigest,
  countSealsForSubject,
  createLedger,
  listRecentSeals,
  listSeals,
  listSealsForSubject,
  sealFromPacket,
  tipDigest,
  verifySealChain,
  type SealAppendInput,
} from "./ledger.ts";
import {
  LEDGER_STORE_VERSION,
  parseStoredLedger,
} from "./ledger-store.ts";

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


test("listSealsForSubject filters and caps; empty subject fail-closed", () => {
  let ledger = createLedger();
  const subjects = ["alpha", "beta", "alpha", "gamma", "alpha"];
  let i = 0;
  while (i < subjects.length) {
    const tip = tipDigest(ledger);
    const r = appendSeal(
      ledger,
      makeSealInput({
        id: "s-" + String(i),
        prevDigest: tip === null ? "" : tip,
        packetSubjectId: subjects[i],
        note: "n-" + subjects[i],
      }),
    );
    assert.equal(r.ok, true);
    if (!r.ok) return;
    ledger = r.ledger;
    i += 1;
  }
  const alpha = listSealsForSubject(ledger, "alpha");
  assert.equal(alpha.length, 3);
  assert.equal(alpha[0].packetSubjectId, "alpha");
  assert.equal(alpha[1].packetSubjectId, "alpha");
  assert.equal(alpha[2].packetSubjectId, "alpha");
  assert.equal(countSealsForSubject(ledger, "alpha"), 3);
  assert.equal(countSealsForSubject(ledger, "beta"), 1);
  assert.equal(listSealsForSubject(ledger, "").length, 0);
  assert.equal(countSealsForSubject(ledger, ""), 0);
  assert.equal(listSealsForSubject(ledger, "missing").length, 0);
  const capped = listSealsForSubject(ledger, "alpha", 2);
  assert.equal(capped.length, 2);
  assert.equal(capped[0].id, "s-2");
  assert.equal(capped[1].id, "s-4");
  assert.ok(capped.length <= UI_LEDGER_CAP);
  const chain = verifySealChain(ledger);
  assert.equal(chain.ok, true);
  let j = 0;
  while (j < alpha.length) {
    const row = alpha[j];
    const recomputed = computeSealDigest({
      id: row.id,
      atIso: row.atIso,
      kind: row.kind,
      packetSubjectId: row.packetSubjectId,
      packId: row.packId,
      gate: row.gate,
      proposedBy: row.proposedBy,
      prevDigest: row.prevDigest,
      note: row.note,
    });
    assert.equal(recomputed, row.digest);
    j += 1;
  }
});

test("verifySealChain rejects tampered digest", () => {
  const g = appendSeal(
    createLedger(),
    makeSealInput({ id: "seal-0", prevDigest: "" }),
  );
  assert.equal(g.ok, true);
  if (!g.ok) return;
  assert.equal(verifySealChain(g.ledger).ok, true);
  const broken = {
    seals: [
      {
        ...g.ledger.seals[0],
        digest: "0".repeat(64),
      },
    ],
  };
  const bad = verifySealChain(broken);
  assert.equal(bad.ok, false);
  if (!bad.ok) {
    assert.match(bad.reason, /digest mismatch/);
  }
});

test("parseStoredLedger fail-closed on corrupt / broken chain", () => {
  const empty = parseStoredLedger("");
  assert.equal(empty.ledger.seals.length, 0);
  assert.ok(empty.reason !== null);

  const g = appendSeal(
    createLedger(),
    makeSealInput({ id: "seal-0", prevDigest: "", packetSubjectId: "subj-a" }),
  );
  assert.equal(g.ok, true);
  if (!g.ok) return;
  const tip = tipDigest(g.ledger);
  const next = appendSeal(
    g.ledger,
    makeSealInput({
      id: "seal-1",
      prevDigest: tip as string,
      packetSubjectId: "subj-a",
    }),
  );
  assert.equal(next.ok, true);
  if (!next.ok) return;

  const goodRaw = JSON.stringify({
    version: LEDGER_STORE_VERSION,
    seals: next.ledger.seals,
  });
  const good = parseStoredLedger(goodRaw);
  assert.equal(good.reason, null);
  assert.equal(good.ledger.seals.length, 2);

  const brokenRaw = JSON.stringify({
    version: LEDGER_STORE_VERSION,
    seals: [
      next.ledger.seals[0],
      { ...next.ledger.seals[1], prevDigest: "deadbeef".repeat(8) },
    ],
  });
  const broken = parseStoredLedger(brokenRaw);
  assert.equal(broken.ledger.seals.length, 0);
  assert.ok(broken.reason !== null);
  assert.match(String(broken.reason), /chain|prevDigest|digest/i);

  const badVersion = parseStoredLedger(
    JSON.stringify({ version: 999, seals: [] }),
  );
  assert.equal(badVersion.ledger.seals.length, 0);
  assert.match(String(badVersion.reason), /version/);
});


import {
  DEFAULT_EXPORT_NOTES,
  EVIDENCE_SCHEMA_VERSION,
  EXPORT_SEAL_CAP,
  evidenceFilename,
  exportPacketEvidence,
} from "./evidence-export.ts";

test("exportPacketEvidence happy path with subject seals", () => {
  const packet = exampleHumanOpenCandidate();
  assert.equal(validateIssuePacket(packet).ok, true);
  let ledger = createLedger();
  const first = appendSeal(
    ledger,
    makeSealInput({
      id: "exp-0",
      prevDigest: "",
      packetSubjectId: packet.subjectId,
      note: "propose",
    }),
  );
  assert.equal(first.ok, true);
  if (!first.ok) return;
  ledger = first.ledger;
  const tip = tipDigest(ledger);
  const second = appendSeal(
    ledger,
    makeSealInput({
      id: "exp-1",
      prevDigest: tip as string,
      packetSubjectId: "other-subject",
      note: "other",
    }),
  );
  assert.equal(second.ok, true);
  if (!second.ok) return;
  ledger = second.ledger;
  const tip2 = tipDigest(ledger);
  const third = appendSeal(
    ledger,
    makeSealInput({
      id: "exp-2",
      prevDigest: tip2 as string,
      packetSubjectId: packet.subjectId,
      note: "open",
      kind: "open",
      gate: "OPEN_CANDIDATE",
      proposedBy: "human_open",
    }),
  );
  assert.equal(third.ok, true);
  if (!third.ok) return;
  ledger = third.ledger;

  const result = exportPacketEvidence({ packet, ledger });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.bundle.schemaVersion, EVIDENCE_SCHEMA_VERSION);
  assert.equal(result.bundle.subjectId, packet.subjectId);
  assert.equal(result.bundle.packId, packet.packId);
  assert.equal(result.bundle.seals.length, 2);
  assert.equal(result.bundle.seals[0].id, "exp-0");
  assert.equal(result.bundle.seals[1].id, "exp-2");
  assert.equal(result.bundle.chainOk, true);
  assert.equal(result.bundle.tipDigest, tipDigest(ledger));
  assert.equal(result.bundle.bundleDigest.length, 64);
  assert.match(result.bundle.notes, /demo export|not durable/i);
  assert.ok(result.json.includes(packet.subjectId));
  assert.ok(EXPORT_SEAL_CAP <= MAX_SEALS);
  assert.ok(EXPORT_SEAL_CAP > UI_LEDGER_CAP);
});

test("exportPacketEvidence empty subject seals still ok", () => {
  const packet = exampleHumanOpenCandidate();
  const ledger = createLedger();
  const result = exportPacketEvidence({
    packet,
    ledger,
    notes: DEFAULT_EXPORT_NOTES,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.bundle.seals.length, 0);
  assert.equal(result.bundle.chainOk, true);
  assert.equal(result.bundle.tipDigest, null);
});

test("exportPacketEvidence validate failure → ok:false", () => {
  const bad = exampleAgentSelfOpenStop();
  assert.equal(validateIssuePacket(bad).ok, false);
  const result = exportPacketEvidence({
    packet: bad,
    ledger: createLedger(),
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.reason, /anti-promotion/);
  }
});

test("exportPacketEvidence unknown pack fail-closed", () => {
  const packet = exampleHumanOpenCandidate();
  const orphan: IssuePacket = {
    ...packet,
    packId: "no-such-pack",
  };
  const result = exportPacketEvidence({
    packet: orphan,
    ledger: createLedger(),
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.reason, /unknown pack/i);
  }
});

test("exportPacketEvidence chainOk false on tampered ledger", () => {
  const packet = exampleHumanOpenCandidate();
  const g = appendSeal(
    createLedger(),
    makeSealInput({
      id: "tamper-0",
      prevDigest: "",
      packetSubjectId: packet.subjectId,
    }),
  );
  assert.equal(g.ok, true);
  if (!g.ok) return;
  const broken = {
    seals: [{ ...g.ledger.seals[0], digest: "0".repeat(64) }],
  };
  assert.equal(verifySealChain(broken).ok, false);
  const result = exportPacketEvidence({ packet, ledger: broken });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.bundle.chainOk, false);
  assert.equal(result.bundle.seals.length, 1);
});

test("evidenceFilename sanitizes and truncates", () => {
  assert.equal(evidenceFilename("fixture-human-open"), "packet-evidence-fixture-human-open.json");
  assert.equal(evidenceFilename("a/b:c"), "packet-evidence-a_b_c.json");
  assert.equal(evidenceFilename(""), "packet-evidence-unknown.json");
  const long = "x".repeat(80);
  const name = evidenceFilename(long);
  assert.ok(name.startsWith("packet-evidence-"));
  assert.ok(name.endsWith(".json"));
  assert.ok(name.length < 80);
});

test("checkKillConditions miss when no triggered fact", () => {
  const packet = exampleHumanOpenCandidate();
  packet.gate = "STOP";
  packet.proposedBy = "agent_propose";
  const result = checkKillConditions(BAKKEN_PACK, packet);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.hit, false);
  }
});

test("checkKillConditions hit on kill.id=triggered", () => {
  const packet = exampleHumanOpenCandidate();
  packet.gate = "STOP";
  packet.proposedBy = "agent_propose";
  packet.residue = [];
  packet.measuredFacts = [
    {
      key: "invented-volumes",
      value: KILL_TRIGGER_VALUE,
      evidence: "measured",
      sourceLabel: "field observation",
    },
  ];
  const result = checkKillConditions(BAKKEN_PACK, packet);
  assert.equal(result.ok, true);
  if (result.ok && result.hit) {
    assert.equal(result.killId, "invented-volumes");
    assert.match(result.statement, /STOP/);
  } else {
    assert.fail("expected kill hit");
  }
  const hay = buildKillHaystack(packet.measuredFacts);
  assert.match(hay, /invented-volumes=triggered/);
});

test("checkKillConditions hit on kill:id prefix", () => {
  const packet = exampleHumanOpenCandidate();
  packet.gate = "STOP";
  packet.proposedBy = "agent_propose";
  packet.residue = [];
  packet.measuredFacts = [
    {
      key: "kill:agent-self-open",
      value: "TRIGGERED",
      evidence: "measured",
      sourceLabel: "runtime",
    },
  ];
  const result = checkKillConditions(BAKKEN_PACK, packet);
  assert.equal(result.ok, true);
  if (result.ok && result.hit) {
    assert.equal(result.killId, "agent-self-open");
  } else {
    assert.fail("expected kill hit on prefixed key");
  }
});

test("checkKillConditions ignores non-triggered values", () => {
  const packet = exampleHumanOpenCandidate();
  packet.gate = "STOP";
  packet.proposedBy = "agent_propose";
  packet.measuredFacts = [
    {
      key: "invented-volumes",
      value: "false",
      evidence: "measured",
      sourceLabel: "field",
    },
  ];
  const result = checkKillConditions(BAKKEN_PACK, packet);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.hit, false);
  }
});

test("applyKillGate forces STOP and residue on hit", () => {
  const packet = exampleHumanOpenCandidate();
  packet.gate = "OPEN_CANDIDATE";
  packet.proposedBy = "human_open";
  packet.residue = [];
  packet.notes = "";
  packet.measuredFacts = [
    {
      key: "unverified-org-claim",
      value: "triggered",
      evidence: "measured",
      sourceLabel: "field",
    },
  ];
  const gated = applyKillGate(BAKKEN_PACK, packet);
  assert.equal(gated.gate, "STOP");
  assert.match(gated.notes, /kill:unverified-org-claim/);
  assert.ok(gated.residue.length >= 1);
  assert.equal(packet.gate, "OPEN_CANDIDATE");
});

test("applyKillGate no-op when no hit", () => {
  const packet = exampleHumanOpenCandidate();
  packet.gate = "STOP";
  packet.proposedBy = "agent_propose";
  packet.notes = "clean";
  const gated = applyKillGate(BAKKEN_PACK, packet);
  assert.equal(gated.gate, "STOP");
  assert.equal(gated.notes, "clean");
  assert.equal(gated.residue.length, packet.residue.length);
});

test("evaluatePacket FAIL when kill triggered despite empty residue", () => {
  const proposed = proposePacket({
    packId: BAKKEN_PACK.id,
    packVersion: BAKKEN_PACK.version,
    subjectId: "eval-kill",
    subjectLabel: "Eval Kill",
    measuredFacts: [
      {
        key: "invented-volumes",
        value: "triggered",
        evidence: "measured",
        sourceLabel: "field",
      },
    ],
    outcomeClassId: null,
    designIntent: null,
    fieldObservation: null,
    advisorAnswers: [],
    residue: [],
    notes: "",
    gate: "STOP",
  });
  assert.equal(proposed.ok, true);
  if (!proposed.ok) return;
  const scored = evaluatePacket(proposed.packet);
  assert.equal(scored.ok, true);
  if (!scored.ok) return;
  assert.equal(scored.verdict, "FAIL");
  assert.equal(scored.packet.gate, "STOP");
  assert.ok(scored.reasons.some((r) => r.includes("kill:invented-volumes")));
  assert.match(scored.packet.notes, /kill:invented-volumes/);
});

test("evaluatePacket PASS when no kill and empty residue", () => {
  const proposed = proposePacket({
    packId: BAKKEN_PACK.id,
    packVersion: BAKKEN_PACK.version,
    subjectId: "eval-pass",
    subjectLabel: "Eval Pass",
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
    fieldObservation: "Active",
    advisorAnswers: [],
    residue: [],
    notes: "",
    gate: "STOP",
  });
  assert.equal(proposed.ok, true);
  if (!proposed.ok) return;
  const scored = evaluatePacket(proposed.packet);
  assert.equal(scored.ok, true);
  if (!scored.ok) return;
  assert.equal(scored.verdict, "PASS");
  assert.notEqual(scored.packet.gate, "OPEN_CANDIDATE");
});

test("checkKillConditions fail-closed on empty kill list", () => {
  const pack = {
    ...BAKKEN_PACK,
    killConditions: [],
  };
  const packet = exampleHumanOpenCandidate();
  const result = checkKillConditions(pack, packet);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.reason, /empty/);
  }
});

test("allowedAnswerRoles always includes evaluator and human_open", () => {
  const field = BAKKEN_PACK.advisorChecks.find((c) => c.id === "field-evidence");
  assert.ok(field);
  if (!field) return;
  const roles = allowedAnswerRoles(field);
  assert.ok(roles.includes("evaluator"));
  assert.ok(roles.includes("human_open"));
  assert.ok(roles.includes("agent_propose"));
  const openCheck = BAKKEN_PACK.advisorChecks.find(
    (c) => c.id === "authority-boundary",
  );
  assert.ok(openCheck);
  if (!openCheck) return;
  const openRoles = allowedAnswerRoles(openCheck);
  assert.ok(openRoles.includes("evaluator"));
  assert.ok(openRoles.includes("human_open"));
  assert.equal(openRoles.includes("agent_propose"), false);
});

test("setAdvisorAnswer fail-closed on empty answer", () => {
  const packet = exampleHumanOpenCandidate();
  packet.gate = "STOP";
  packet.proposedBy = "agent_propose";
  const check = BAKKEN_PACK.advisorChecks[0];
  const result = setAdvisorAnswer(
    packet,
    {
      checkId: check.id,
      answer: "",
      evidence: "unknown",
      answeredAs: "evaluator",
    },
    check,
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.reason, /empty/);
  }
  assert.equal(packet.advisorAnswers.length, 0);
});

test("setAdvisorAnswer inserts and replaces same checkId", () => {
  const packet = exampleHumanOpenCandidate();
  packet.gate = "STOP";
  packet.proposedBy = "agent_propose";
  packet.advisorAnswers = [];
  const check = BAKKEN_PACK.advisorChecks.find((c) => c.id === "field-evidence");
  assert.ok(check);
  if (!check) return;
  const first = setAdvisorAnswer(
    packet,
    {
      checkId: check.id,
      answer: "API and status present; volumes absent",
      evidence: "derived",
      answeredAs: "agent_propose",
    },
    check,
  );
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.packet.advisorAnswers.length, 1);
  assert.equal(first.packet.advisorAnswers[0].answeredAs, "agent_propose");
  const second = setAdvisorAnswer(
    first.packet,
    {
      checkId: check.id,
      answer: "replaced answer text",
      evidence: "unknown",
      answeredAs: "evaluator",
    },
    check,
  );
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.equal(second.packet.advisorAnswers.length, 1);
  assert.equal(second.packet.advisorAnswers[0].answer, "replaced answer text");
  assert.equal(second.packet.advisorAnswers[0].answeredAs, "evaluator");
  assert.equal(packet.advisorAnswers.length, 0);
});

test("setAdvisorAnswer rejects agent_propose on human_open check", () => {
  const packet = exampleHumanOpenCandidate();
  packet.gate = "STOP";
  packet.proposedBy = "agent_propose";
  const check = BAKKEN_PACK.advisorChecks.find(
    (c) => c.id === "authority-boundary",
  );
  assert.ok(check);
  if (!check) return;
  const result = setAdvisorAnswer(
    packet,
    {
      checkId: check.id,
      answer: "agent tries to answer OPEN check",
      evidence: "unknown",
      answeredAs: "agent_propose",
    },
    check,
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.reason, /not allowed/);
  }
});

test("setAdvisorAnswer rejects ops_execute", () => {
  const packet = exampleHumanOpenCandidate();
  const check = BAKKEN_PACK.advisorChecks[0];
  const result = setAdvisorAnswer(packet, {
    checkId: check.id,
    answer: "ops should not answer",
    evidence: "unknown",
    answeredAs: "ops_execute",
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.reason, /ops_execute/);
  }
});

test("setAdvisorAnswer caps at MAX_ADVISOR_ANSWERS", () => {
  const packet = exampleHumanOpenCandidate();
  packet.gate = "STOP";
  packet.proposedBy = "agent_propose";
  packet.advisorAnswers = [];
  let i = 0;
  while (i < MAX_ADVISOR_ANSWERS) {
    packet.advisorAnswers.push({
      checkId: "pad-" + String(i),
      answer: "pad",
      evidence: "unknown",
      answeredAs: "evaluator",
    });
    i += 1;
  }
  const check = BAKKEN_PACK.advisorChecks[0];
  const result = setAdvisorAnswer(
    packet,
    {
      checkId: check.id,
      answer: "one more",
      evidence: "unknown",
      answeredAs: "evaluator",
    },
    check,
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.reason, /full/);
  }
});

test("listAdvisorChecksForUi and findAdvisorAnswer bounded", () => {
  const listed = listAdvisorChecksForUi(BAKKEN_PACK.advisorChecks);
  assert.ok(listed.length >= 1);
  assert.ok(listed.length <= BAKKEN_PACK.advisorChecks.length);
  const packet = exampleHumanOpenCandidate();
  packet.advisorAnswers = [
    {
      checkId: listed[0].id,
      answer: "yes",
      evidence: "derived",
      answeredAs: "evaluator",
    },
  ];
  const found = findAdvisorAnswer(packet.advisorAnswers, listed[0].id);
  assert.ok(found);
  if (found) {
    assert.equal(found.answer, "yes");
  }
  assert.equal(findAdvisorAnswer(packet.advisorAnswers, ""), null);
});

test("evaluatePacket still works after setAdvisorAnswer", () => {
  const packet = exampleHumanOpenCandidate();
  packet.gate = "STOP";
  packet.proposedBy = "agent_propose";
  packet.residue = [];
  const check = BAKKEN_PACK.advisorChecks.find((c) => c.id === "field-evidence");
  assert.ok(check);
  if (!check) return;
  const set = setAdvisorAnswer(
    packet,
    {
      checkId: check.id,
      answer: "measured fields present; volumes absent",
      evidence: "derived",
      answeredAs: "evaluator",
    },
    check,
  );
  assert.equal(set.ok, true);
  if (!set.ok) return;
  const scored = evaluatePacket(set.packet);
  assert.equal(scored.ok, true);
  if (!scored.ok) return;
  assert.equal(scored.verdict, "PASS");
  assert.notEqual(scored.packet.gate, "OPEN_CANDIDATE");
  assert.equal(scored.packet.advisorAnswers.length, 1);
});
