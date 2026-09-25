/**
 * Bakken issue-packet fixtures: one STOP (agent self-OPEN) and one valid human OPEN.
 * Power of 10: flat builders, no recursion, ≤60 lines per function.
 */
import { BAKKEN_PACK } from "../packs/bakken.ts";
import { PACKET_SCHEMA_VERSION, type IssuePacket } from "../types.ts";

function basePacket(): IssuePacket {
  return {
    schemaVersion: PACKET_SCHEMA_VERSION,
    packId: BAKKEN_PACK.id,
    packVersion: BAKKEN_PACK.version,
    subjectId: "fixture-well",
    subjectLabel: "Fixture Well",
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
    residue: [
      {
        id: "no-monthly-volumes",
        statement:
          "Monthly oil, gas, and water volumes are not on the NDIC open GIS service used by DOAPO.",
        evidence: "measured",
      },
    ],
    proposedBy: "agent_propose",
    gate: "STOP",
    notes: "",
  };
}

/** Agent attempts OPEN_CANDIDATE — must fail validate (anti-promotion). */
export function exampleAgentSelfOpenStop(): IssuePacket {
  const packet = basePacket();
  packet.subjectId = "fixture-agent-self-open";
  packet.subjectLabel = "Agent Self-OPEN Example";
  packet.proposedBy = "agent_propose";
  packet.gate = "OPEN_CANDIDATE";
  packet.notes = "STOP example: agent_propose cannot stamp OPEN_CANDIDATE";
  return packet;
}

/** Human OPEN_CANDIDATE — valid under anti-promotion rules. */
export function exampleHumanOpenCandidate(): IssuePacket {
  const packet = basePacket();
  packet.subjectId = "fixture-human-open";
  packet.subjectLabel = "Human OPEN Example";
  packet.outcomeClassId = "duc";
  packet.measuredFacts = [
    {
      key: "status",
      value: "NC",
      evidence: "measured",
      sourceLabel: "NDIC GIS",
    },
  ];
  packet.designIntent = "Complete and bring online";
  packet.fieldObservation = "NC on public index";
  packet.proposedBy = "human_open";
  packet.gate = "OPEN_CANDIDATE";
  packet.notes = "Candidate only — human OPEN";
  packet.residue = [
    {
      id: "no-monthly-volumes",
      statement:
        "Monthly oil, gas, and water volumes are not on the NDIC open GIS service used by DOAPO.",
      evidence: "measured",
    },
    {
      id: "keys-we-hold",
      statement:
        "DOAPO owns the gate: evidence class, residue, kill conditions, and human-only OPEN.",
      evidence: "derived",
    },
  ];
  return packet;
}
