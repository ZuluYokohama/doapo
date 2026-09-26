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
import { MAX_ADVISOR_ANSWERS, MAX_RESIDUE_ITEMS, PACKET_SCHEMA_VERSION, type IssuePacket } from "./types.ts";
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
import {
  addResidueItem,
  findResidueItem,
  listResidueForUi,
  removeResidueItem,
  residueEvidenceOptions,
  setResidueItem,
} from "./residue-edit.ts";

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
  assert.equal(DUC_QUEUE_PACK.version, "1.2.0");
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


test("setResidueItem fail-closed on empty statement", () => {
  const packet = exampleHumanOpenCandidate();
  assert.ok(packet.residue.length >= 1);
  const id = packet.residue[0].id;
  const result = setResidueItem(packet, {
    id,
    statement: "",
    evidence: "unknown",
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.reason, /empty/);
  }
  assert.equal(packet.residue[0].statement.length > 0, true);
});

test("setResidueItem replaces statement and evidence", () => {
  const packet = exampleHumanOpenCandidate();
  const before = packet.residue.length;
  assert.ok(before >= 1);
  const id = packet.residue[0].id;
  const result = setResidueItem(packet, {
    id,
    statement: "Updated residue statement for UI edit",
    evidence: "derived",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.packet.residue.length, before);
  assert.equal(result.packet.residue[0].statement, "Updated residue statement for UI edit");
  assert.equal(result.packet.residue[0].evidence, "derived");
  assert.notEqual(packet.residue[0].statement, result.packet.residue[0].statement);
});

test("setResidueItem rejects unknown id and bad evidence", () => {
  const packet = exampleHumanOpenCandidate();
  const missing = setResidueItem(packet, {
    id: "not-a-real-residue-id",
    statement: "something",
    evidence: "measured",
  });
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.match(missing.reason, /not found/);
  }
  const badEv = setResidueItem(packet, {
    id: packet.residue[0].id,
    statement: "ok text",
    evidence: "not-an-evidence" as unknown as "measured",
  });
  assert.equal(badEv.ok, false);
  if (!badEv.ok) {
    assert.match(badEv.reason, /evidence/);
  }
});

test("addResidueItem appends and rejects duplicate / full", () => {
  const packet = exampleHumanOpenCandidate();
  packet.residue = packet.residue.slice();
  const added = addResidueItem(packet, {
    id: "ui-added-residue",
    statement: "Explicit residue from editor",
    evidence: "unknown",
  });
  assert.equal(added.ok, true);
  if (!added.ok) return;
  assert.equal(added.packet.residue.length, packet.residue.length + 1);
  const dup = addResidueItem(added.packet, {
    id: "ui-added-residue",
    statement: "dup",
    evidence: "unknown",
  });
  assert.equal(dup.ok, false);
  if (!dup.ok) {
    assert.match(dup.reason, /duplicate/);
  }
  const full: typeof packet = {
    ...added.packet,
    residue: [],
  };
  let i = 0;
  while (i < MAX_RESIDUE_ITEMS) {
    full.residue.push({
      id: "pad-" + String(i),
      statement: "pad",
      evidence: "unknown",
    });
    i += 1;
  }
  const over = addResidueItem(full, {
    id: "one-more",
    statement: "overflow",
    evidence: "unknown",
  });
  assert.equal(over.ok, false);
  if (!over.ok) {
    assert.match(over.reason, /full/);
  }
});

test("removeResidueItem drops by id and fail-closes missing", () => {
  const packet = exampleHumanOpenCandidate();
  assert.ok(packet.residue.length >= 1);
  const id = packet.residue[0].id;
  const before = packet.residue.length;
  const removed = removeResidueItem(packet, id);
  assert.equal(removed.ok, true);
  if (!removed.ok) return;
  assert.equal(removed.packet.residue.length, before - 1);
  assert.equal(findResidueItem(removed.packet.residue, id), null);
  assert.equal(packet.residue.length, before);
  const miss = removeResidueItem(packet, "no-such-id");
  assert.equal(miss.ok, false);
  if (!miss.ok) {
    assert.match(miss.reason, /not found/);
  }
  const emptyId = removeResidueItem(packet, "");
  assert.equal(emptyId.ok, false);
});

test("listResidueForUi and residueEvidenceOptions bounded", () => {
  const packet = exampleHumanOpenCandidate();
  const listed = listResidueForUi(packet.residue);
  assert.ok(listed.length >= 1);
  assert.ok(listed.length <= MAX_RESIDUE_ITEMS);
  const opts = residueEvidenceOptions();
  assert.equal(opts.length, 5);
  assert.ok(opts.includes("measured"));
  assert.ok(opts.includes("unknown"));
});

test("evaluatePacket and validate after residue edit", () => {
  const packet = exampleHumanOpenCandidate();
  packet.gate = "STOP";
  packet.proposedBy = "agent_propose";
  const cleared = removeResidueItem(packet, packet.residue[0].id);
  assert.equal(cleared.ok, true);
  if (!cleared.ok) return;
  let working = cleared.packet;
  let i = 0;
  while (i < working.residue.length) {
    const drop = removeResidueItem(working, working.residue[0].id);
    assert.equal(drop.ok, true);
    if (!drop.ok) return;
    working = drop.packet;
    i += 1;
  }
  assert.equal(working.residue.length, 0);
  const added = addResidueItem(working, {
    id: "editor-residue",
    statement: "Residue stated via editor before open",
    evidence: "derived",
  });
  assert.equal(added.ok, true);
  if (!added.ok) return;
  const v = validateIssuePacket(added.packet);
  assert.equal(v.ok, true);
  const scored = evaluatePacket(added.packet);
  assert.equal(scored.ok, true);
  if (!scored.ok) return;
  assert.equal(scored.verdict, "RESIDUE");
  assert.equal(scored.packet.residue.length, 1);
});


import {
  LEDGER_DURABLE_KEY,
  LEDGER_DURABLE_OPT_IN_KEY,
  appendAndPersist,
  clearDurableLedger,
  durableLedgerPresent,
  isDurableOptIn,
  loadDurableLedger,
  loadPreferredLedger,
  persistSessionToDurable,
  saveDurableLedger,
} from "./ledger-durable.ts";

type StorageShim = {
  store: Map<string, string>;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
  key(index: number): string | null;
  length: number;
};

function installLocalStorage(): StorageShim {
  const store = new Map<string, string>();
  const shim: StorageShim = {
    store,
    get length() {
      return store.size;
    },
    getItem(key: string) {
      return store.has(key) ? (store.get(key) as string) : null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    key(index: number) {
      const keys = Array.from(store.keys());
      return index >= 0 && index < keys.length ? keys[index] : null;
    },
  };
  const g = globalThis as Record<string, unknown>;
  g.window = { localStorage: shim };
  g.localStorage = shim;
  return shim;
}

function uninstallLocalStorage(): void {
  const g = globalThis as Record<string, unknown>;
  g.window = undefined;
  g.localStorage = undefined;
}

test("durable ledger save/load round-trip and opt-in", () => {
  const shim = installLocalStorage();
  try {
    clearDurableLedger();
    assert.equal(durableLedgerPresent(), false);
    assert.equal(isDurableOptIn(), false);

    const g = appendSeal(
      createLedger(),
      makeSealInput({ id: "dur-0", prevDigest: "" }),
    );
    assert.equal(g.ok, true);
    if (!g.ok) return;
    const saved = saveDurableLedger(g.ledger);
    assert.equal(saved.ok, true);
    assert.equal(durableLedgerPresent(), true);
    assert.equal(isDurableOptIn(), true);
    assert.ok(shim.getItem(LEDGER_DURABLE_KEY) !== null);
    assert.equal(shim.getItem(LEDGER_DURABLE_OPT_IN_KEY), "1");

    const loaded = loadDurableLedger();
    assert.equal(loaded.reason, null);
    assert.equal(loaded.ledger.seals.length, 1);
    assert.equal(loaded.ledger.seals[0].digest, g.ledger.seals[0].digest);
  } finally {
    uninstallLocalStorage();
  }
});

test("durable ledger corrupt payload fail-closed to empty", () => {
  const shim = installLocalStorage();
  try {
    shim.setItem(
      LEDGER_DURABLE_KEY,
      JSON.stringify({
        version: LEDGER_STORE_VERSION,
        seals: [
          {
            id: "x",
            atIso: "2026-09-25T00:00:00.000Z",
            kind: "propose",
            packetSubjectId: "s",
            packId: "bakken",
            gate: "STOP",
            proposedBy: "agent_propose",
            digest: "0".repeat(64),
            prevDigest: "",
            note: "bad",
          },
        ],
      }),
    );
    const loaded = loadDurableLedger();
    assert.equal(loaded.ledger.seals.length, 0);
    assert.ok(loaded.reason !== null);
    assert.match(String(loaded.reason), /digest|chain/i);
  } finally {
    uninstallLocalStorage();
  }
});

test("appendAndPersist appends and writes durable", () => {
  installLocalStorage();
  try {
    clearDurableLedger();
    const first = appendAndPersist(
      createLedger(),
      makeSealInput({ id: "ap-0", prevDigest: "" }),
    );
    assert.equal(first.ok, true);
    if (!first.ok) return;
    const tip = tipDigest(first.ledger);
    const second = appendAndPersist(
      first.ledger,
      makeSealInput({ id: "ap-1", prevDigest: tip as string }),
    );
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.ledger.seals.length, 2);
    const loaded = loadDurableLedger();
    assert.equal(loaded.reason, null);
    assert.equal(loaded.ledger.seals.length, 2);
  } finally {
    uninstallLocalStorage();
  }
});

test("loadPreferredLedger prefers durable when present", () => {
  installLocalStorage();
  try {
    clearDurableLedger();
    const sessionOnly = {
      ledger: createLedger(),
      reason: null as string | null,
    };
    const prefEmpty = loadPreferredLedger(sessionOnly);
    assert.equal(prefEmpty.source, "session");

    const built = appendSeal(
      createLedger(),
      makeSealInput({ id: "pref-0", prevDigest: "" }),
    );
    assert.equal(built.ok, true);
    if (!built.ok) return;
    const copied = persistSessionToDurable(built.ledger);
    assert.equal(copied.ok, true);

    const sessionWithOther = {
      ledger: createLedger(),
      reason: null as string | null,
    };
    const pref = loadPreferredLedger(sessionWithOther);
    assert.equal(pref.source, "durable");
    assert.equal(pref.ledger.seals.length, 1);

    clearDurableLedger();
    const afterClear = loadPreferredLedger(sessionWithOther);
    assert.equal(afterClear.source, "session");
  } finally {
    uninstallLocalStorage();
  }
});

test("appendAndPersist rejects broken prevDigest without writing", () => {
  installLocalStorage();
  try {
    clearDurableLedger();
    const ok = appendAndPersist(
      createLedger(),
      makeSealInput({ id: "rej-0", prevDigest: "" }),
    );
    assert.equal(ok.ok, true);
    if (!ok.ok) return;
    const bad = appendAndPersist(
      ok.ledger,
      makeSealInput({ id: "rej-1", prevDigest: "deadbeef".repeat(8) }),
    );
    assert.equal(bad.ok, false);
    const loaded = loadDurableLedger();
    assert.equal(loaded.ledger.seals.length, 1);
  } finally {
    uninstallLocalStorage();
  }
});

import {
  MAX_PACK_JSON_CHARS,
  importPackFromJson,
  resolvePack,
} from "./pack-import.ts";

test("importPackFromJson accepts bakken JSON round-trip", () => {
  const json = JSON.stringify(BAKKEN_PACK);
  assert.ok(json.length < MAX_PACK_JSON_CHARS);
  const result = importPackFromJson(json);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.pack.id, BAKKEN_PACK.id);
  assert.equal(result.pack.schemaVersion, PACKET_SCHEMA_VERSION);
  assert.equal(result.pack.outcomeClasses.length, BAKKEN_PACK.outcomeClasses.length);
  assert.equal(validateDomainPack(result.pack).ok, true);
});

test("importPackFromJson fail-closed on empty / oversize / bad JSON", () => {
  const empty = importPackFromJson("");
  assert.equal(empty.ok, false);
  if (!empty.ok) assert.match(empty.reason, /empty/);

  const bad = importPackFromJson("{not-json");
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.match(bad.reason, /parse/i);

  const over = importPackFromJson("x".repeat(MAX_PACK_JSON_CHARS + 1));
  assert.equal(over.ok, false);
  if (!over.ok) assert.match(over.reason, /size cap/);

  const notObj = importPackFromJson("[]");
  assert.equal(notObj.ok, false);
  if (!notObj.ok) assert.match(notObj.reason, /object/);
});

test("importPackFromJson fail-closed on schema mismatch", () => {
  const broken = {
    ...BAKKEN_PACK,
    schemaVersion: "0.0.0",
  };
  const result = importPackFromJson(JSON.stringify(broken));
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /schemaVersion/);
});

test("importPackFromJson fail-closed when killConditions missing", () => {
  const { killConditions: _k, ...rest } = BAKKEN_PACK;
  const result = importPackFromJson(JSON.stringify(rest));
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /killConditions/);
});

test("resolvePack prefers session overlay without mutating registry", () => {
  const json = JSON.stringify({
    ...DUC_QUEUE_PACK,
    id: "session-overlay-pack",
    title: "Session overlay pack",
  });
  const imported = importPackFromJson(json);
  assert.equal(imported.ok, true);
  if (!imported.ok) return;

  const hit = resolvePack("session-overlay-pack", imported.pack);
  assert.equal(hit.ok, true);
  if (hit.ok) assert.equal(hit.pack.title, "Session overlay pack");

  const miss = resolvePack("session-overlay-pack", null);
  assert.equal(miss.ok, false);

  assert.equal(getPack("session-overlay-pack"), null);
  assert.equal(listPackIds().includes("session-overlay-pack"), false);

  const bakken = resolvePack("bakken", imported.pack);
  assert.equal(bakken.ok, true);
  if (bakken.ok) assert.equal(bakken.pack.id, "bakken");
});

import {
  MAX_EXPORT_SUBJECTS,
  MULTI_EVIDENCE_SCHEMA_VERSION,
  DEFAULT_MULTI_ZIP_FILENAME,
  MANIFEST_FILENAME,
  exportMultiSubjectEvidenceZip,
  buildStoreZip,
} from "./evidence-zip.ts";

test("exportMultiSubjectEvidenceZip happy path with two subjects", () => {
  const bakken = exampleHumanOpenCandidate();
  const duc = exampleDucHumanOpenCandidate();
  assert.equal(validateIssuePacket(bakken).ok, true);
  assert.equal(validateIssuePacket(duc).ok, true);
  assert.notEqual(bakken.subjectId, duc.subjectId);

  let ledger = createLedger();
  const first = appendSeal(
    ledger,
    makeSealInput({
      id: "multi-0",
      prevDigest: "",
      packetSubjectId: bakken.subjectId,
      note: "bakken",
    }),
  );
  assert.equal(first.ok, true);
  if (!first.ok) return;
  ledger = first.ledger;
  const tip = tipDigest(ledger);
  const second = appendSeal(
    ledger,
    makeSealInput({
      id: "multi-1",
      prevDigest: tip as string,
      packetSubjectId: duc.subjectId,
      note: "duc",
    }),
  );
  assert.equal(second.ok, true);
  if (!second.ok) return;
  ledger = second.ledger;

  const result = exportMultiSubjectEvidenceZip({
    packets: [bakken, duc],
    ledger,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.filename, DEFAULT_MULTI_ZIP_FILENAME);
  assert.equal(result.manifest.schemaVersion, MULTI_EVIDENCE_SCHEMA_VERSION);
  assert.equal(result.manifest.subjectCount, 2);
  assert.equal(result.manifest.entries.length, 2);
  assert.equal(result.manifest.entries[0].subjectId, bakken.subjectId);
  assert.equal(result.manifest.entries[1].subjectId, duc.subjectId);
  assert.equal(result.manifest.ledgerChainOk, true);
  assert.equal(result.manifest.manifestDigest.length, 64);
  assert.ok(result.zipBytes.length > 100);
  assert.ok(MAX_EXPORT_SUBJECTS <= 16);
  assert.equal(MAX_EXPORT_SUBJECTS, 16);

  const asText = new TextDecoder().decode(result.zipBytes);
  assert.ok(asText.includes(MANIFEST_FILENAME));
  assert.ok(asText.includes(evidenceFilename(bakken.subjectId)));
  assert.ok(asText.includes(evidenceFilename(duc.subjectId)));
});

test("exportMultiSubjectEvidenceZip fail-closed empty / over-cap / duplicate", () => {
  const ledger = createLedger();
  const empty = exportMultiSubjectEvidenceZip({ packets: [], ledger });
  assert.equal(empty.ok, false);
  if (!empty.ok) assert.match(empty.reason, /empty/);

  const bakken = exampleHumanOpenCandidate();
  const packets: IssuePacket[] = [];
  let i = 0;
  while (i < MAX_EXPORT_SUBJECTS + 1) {
    packets.push({
      ...bakken,
      subjectId: "subj-" + String(i),
    });
    i += 1;
  }
  const over = exportMultiSubjectEvidenceZip({ packets, ledger });
  assert.equal(over.ok, false);
  if (!over.ok) assert.match(over.reason, /MAX_EXPORT_SUBJECTS/);

  const dup = exportMultiSubjectEvidenceZip({
    packets: [bakken, { ...bakken }],
    ledger,
  });
  assert.equal(dup.ok, false);
  if (!dup.ok) assert.match(dup.reason, /duplicate/);
});

test("exportMultiSubjectEvidenceZip fail-closed when any subject invalid", () => {
  const good = exampleHumanOpenCandidate();
  const bad = exampleAgentSelfOpenStop();
  assert.equal(validateIssuePacket(bad).ok, false);
  const result = exportMultiSubjectEvidenceZip({
    packets: [good, bad],
    ledger: createLedger(),
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.reason, /anti-promotion|subject/);
  }
});

test("buildStoreZip round-trip local signature", () => {
  const data = new TextEncoder().encode('{"ok":true}');
  const zip = buildStoreZip([{ name: "a.json", data }]);
  assert.equal(zip[0], 0x50);
  assert.equal(zip[1], 0x4b);
  assert.equal(zip[2], 0x03);
  assert.equal(zip[3], 0x04);
  const text = new TextDecoder().decode(zip);
  assert.ok(text.includes("a.json"));
  assert.ok(text.includes('{"ok":true}'));
});

import { createHash } from "node:crypto";
import {
  MAX_EVIDENCE_JSON_CHARS,
  importEvidenceBundle,
} from "./evidence-export.ts";

function recomputeBundleDigest(fields: {
  schemaVersion: string;
  exportedAtIso: string;
  packId: string;
  packVersion: string;
  subjectId: string;
  packet: unknown;
  seals: unknown;
  tipDigest: string | null;
  chainOk: boolean;
  notes: string;
}): string {
  const ordered = {
    schemaVersion: fields.schemaVersion,
    exportedAtIso: fields.exportedAtIso,
    packId: fields.packId,
    packVersion: fields.packVersion,
    subjectId: fields.subjectId,
    packet: fields.packet,
    seals: fields.seals,
    tipDigest: fields.tipDigest,
    chainOk: fields.chainOk,
    notes: fields.notes,
  };
  return createHash("sha256")
    .update(JSON.stringify(ordered), "utf8")
    .digest("hex");
}

test("importEvidenceBundle round-trip export → import", () => {
  const packet = exampleHumanOpenCandidate();
  let ledger = createLedger();
  const first = appendSeal(
    ledger,
    makeSealInput({
      id: "imp-0",
      prevDigest: "",
      packetSubjectId: packet.subjectId,
      note: "propose",
    }),
  );
  assert.equal(first.ok, true);
  if (!first.ok) return;
  ledger = first.ledger;
  const exported = exportPacketEvidence({ packet, ledger });
  assert.equal(exported.ok, true);
  if (!exported.ok) return;
  assert.ok(exported.json.length < MAX_EVIDENCE_JSON_CHARS);
  const imported = importEvidenceBundle(exported.json);
  assert.equal(imported.ok, true);
  if (!imported.ok) return;
  assert.equal(imported.packet.subjectId, packet.subjectId);
  assert.equal(imported.packet.packId, packet.packId);
  assert.equal(imported.bundle.bundleDigest, exported.bundle.bundleDigest);
  assert.equal(imported.bundle.seals.length, 1);
  assert.equal(imported.bundle.seals[0].digest, exported.bundle.seals[0].digest);
});

test("importEvidenceBundle fail-closed on empty / oversize / bad JSON", () => {
  const empty = importEvidenceBundle("");
  assert.equal(empty.ok, false);
  if (!empty.ok) assert.match(empty.reason, /empty/i);
  const bad = importEvidenceBundle("{not-json");
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.match(bad.reason, /parse/i);
  const over = importEvidenceBundle("x".repeat(MAX_EVIDENCE_JSON_CHARS + 1));
  assert.equal(over.ok, false);
  if (!over.ok) assert.match(over.reason, /size cap/i);
  const notObj = importEvidenceBundle("[]");
  assert.equal(notObj.ok, false);
  if (!notObj.ok) assert.match(notObj.reason, /object/i);
});

test("importEvidenceBundle fail-closed on schemaVersion mismatch", () => {
  const packet = exampleHumanOpenCandidate();
  const exported = exportPacketEvidence({
    packet,
    ledger: createLedger(),
  });
  assert.equal(exported.ok, true);
  if (!exported.ok) return;
  const broken = JSON.parse(exported.json) as Record<string, unknown>;
  broken.schemaVersion = "doapo-packet-evidence/0";
  const result = importEvidenceBundle(JSON.stringify(broken));
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /schemaVersion/i);
});

test("importEvidenceBundle fail-closed on bundleDigest mismatch", () => {
  const packet = exampleHumanOpenCandidate();
  const exported = exportPacketEvidence({
    packet,
    ledger: createLedger(),
  });
  assert.equal(exported.ok, true);
  if (!exported.ok) return;
  const broken = JSON.parse(exported.json) as Record<string, unknown>;
  broken.notes = "tampered notes";
  const result = importEvidenceBundle(JSON.stringify(broken));
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /bundleDigest/i);
});

test("importEvidenceBundle fail-closed on unknown pack (digest-aligned)", () => {
  const packet = exampleHumanOpenCandidate();
  const exported = exportPacketEvidence({
    packet,
    ledger: createLedger(),
  });
  assert.equal(exported.ok, true);
  if (!exported.ok) return;
  const broken = JSON.parse(exported.json) as {
    schemaVersion: string;
    exportedAtIso: string;
    packId: string;
    packVersion: string;
    subjectId: string;
    packet: IssuePacket;
    seals: unknown[];
    tipDigest: string | null;
    chainOk: boolean;
    notes: string;
    bundleDigest: string;
  };
  broken.packId = "no-such-pack";
  broken.packet = { ...broken.packet, packId: "no-such-pack" };
  broken.bundleDigest = recomputeBundleDigest(broken);
  const result = importEvidenceBundle(JSON.stringify(broken));
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /unknown pack/i);
});

test("importEvidenceBundle fail-closed on seal digest mismatch", () => {
  const packet = exampleHumanOpenCandidate();
  let ledger = createLedger();
  const first = appendSeal(
    ledger,
    makeSealInput({
      id: "seal-bad-0",
      prevDigest: "",
      packetSubjectId: packet.subjectId,
    }),
  );
  assert.equal(first.ok, true);
  if (!first.ok) return;
  ledger = first.ledger;
  const exported = exportPacketEvidence({ packet, ledger });
  assert.equal(exported.ok, true);
  if (!exported.ok) return;
  const broken = JSON.parse(exported.json) as {
    schemaVersion: string;
    exportedAtIso: string;
    packId: string;
    packVersion: string;
    subjectId: string;
    packet: IssuePacket;
    seals: Array<{ digest: string; [key: string]: unknown }>;
    tipDigest: string | null;
    chainOk: boolean;
    notes: string;
    bundleDigest: string;
  };
  assert.ok(broken.seals.length >= 1);
  broken.seals[0] = { ...broken.seals[0], digest: "a".repeat(64) };
  broken.bundleDigest = recomputeBundleDigest(broken);
  const result = importEvidenceBundle(JSON.stringify(broken));
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /seal digest/i);
});

test("importEvidenceBundle empty seals still ok", () => {
  const packet = exampleHumanOpenCandidate();
  const exported = exportPacketEvidence({
    packet,
    ledger: createLedger(),
  });
  assert.equal(exported.ok, true);
  if (!exported.ok) return;
  assert.equal(exported.bundle.seals.length, 0);
  const imported = importEvidenceBundle(exported.json);
  assert.equal(imported.ok, true);
  if (!imported.ok) return;
  assert.equal(imported.bundle.seals.length, 0);
  assert.equal(imported.packet.subjectId, packet.subjectId);
});

test("importEvidenceBundle prefers resolvePack overlay", () => {
  const base = exampleHumanOpenCandidate();
  const overlayPack = { ...BAKKEN_PACK, id: "session-overlay-pack", title: "Overlay" };
  // Export bakken, retarget pack ids + recompute digest, import with overlay.
  const exported = exportPacketEvidence({
    packet: base,
    ledger: createLedger(),
  });
  assert.equal(exported.ok, true);
  if (!exported.ok) return;
  const retarget = JSON.parse(exported.json) as {
    schemaVersion: string;
    exportedAtIso: string;
    packId: string;
    packVersion: string;
    subjectId: string;
    packet: IssuePacket;
    seals: unknown[];
    tipDigest: string | null;
    chainOk: boolean;
    notes: string;
    bundleDigest: string;
  };
  retarget.packId = overlayPack.id;
  retarget.packet = { ...retarget.packet, packId: overlayPack.id };
  retarget.bundleDigest = recomputeBundleDigest(retarget);
  const miss = importEvidenceBundle(JSON.stringify(retarget), null);
  assert.equal(miss.ok, false);
  const hit = importEvidenceBundle(JSON.stringify(retarget), overlayPack);
  assert.equal(hit.ok, true);
  if (!hit.ok) return;
  assert.equal(hit.packet.packId, "session-overlay-pack");
});
