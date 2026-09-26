/**
 * Bakken DUC-queue issue-packet fixtures: one STOP (agent self-OPEN) and one valid human OPEN.
 * Power of 10: flat builders, no recursion, ≤60 lines per function.
 */
import { DUC_QUEUE_PACK } from "../packs/duc-queue.ts";
import { PACKET_SCHEMA_VERSION, type IssuePacket } from "../types.ts";

function basePacket(): IssuePacket {
  return {
    schemaVersion: PACKET_SCHEMA_VERSION,
    packId: DUC_QUEUE_PACK.id,
    packVersion: DUC_QUEUE_PACK.version,
    subjectId: "fixture-duc-well",
    subjectLabel: "Fixture DUC Well",
    measuredFacts: [
      {
        key: "status",
        value: "NC",
        evidence: "measured",
        sourceLabel: "NDIC GIS",
      },
    ],
    outcomeClassId: "duc",
    designIntent: null,
    fieldObservation: "NC on public index — drilled, not completed",
    advisorAnswers: [],
    residue: [
      {
        id: "no-monthly-volumes",
        statement:
          "Monthly oil, gas, and water volumes are not on the NDIC open GIS service used by DOAPO.",
        evidence: "measured",
      },
      {
        id: "shared-ndic-different-lens",
        statement:
          "This pack shares the NDIC public GIS substrate with pack bakken; lens is DUC / NC only.",
        evidence: "measured",
      },
    ],
    proposedBy: "agent_propose",
    gate: "STOP",
    notes: "",
  };
}

/** Agent attempts OPEN_CANDIDATE — must fail validate (anti-promotion). */
export function exampleDucAgentSelfOpenStop(): IssuePacket {
  const packet = basePacket();
  packet.subjectId = "fixture-duc-agent-self-open";
  packet.subjectLabel = "DUC Agent Self-OPEN Example";
  packet.proposedBy = "agent_propose";
  packet.gate = "OPEN_CANDIDATE";
  packet.notes = "STOP example: agent_propose cannot stamp OPEN_CANDIDATE";
  return packet;
}

/** Human OPEN_CANDIDATE — valid under anti-promotion rules. */
export function exampleDucHumanOpenCandidate(): IssuePacket {
  const packet = basePacket();
  packet.subjectId = "fixture-duc-human-open";
  packet.subjectLabel = "DUC Human OPEN Example";
  packet.designIntent = "Complete NC well and bring online";
  packet.fieldObservation = "NC on public index — queue candidate";
  packet.proposedBy = "human_open";
  packet.gate = "OPEN_CANDIDATE";
  packet.notes = "Candidate only — human OPEN on DUC queue pack";
  packet.residue = [
    {
      id: "no-monthly-volumes",
      statement:
        "Monthly oil, gas, and water volumes are not on the NDIC open GIS service used by DOAPO.",
      evidence: "measured",
    },
    {
      id: "gate-authority",
      statement:
        "Gate authority: evidence class, residue, kill conditions, and human-only OPEN are defined by this pack schema.",
      evidence: "derived",
    },
    {
      id: "shared-ndic-different-lens",
      statement:
        "This pack shares the NDIC public GIS substrate with pack bakken; lens is DUC / NC only.",
      evidence: "measured",
    },
  ];
  return packet;
}
