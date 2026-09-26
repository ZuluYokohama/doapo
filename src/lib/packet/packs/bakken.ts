import { OUTCOMES } from "../../outcomes.ts";
import { PACKET_SCHEMA_VERSION, type DomainPack } from "../types.ts";

/**
 * Bakken / Williston domain pack for DOAPO.
 * Substrate: public NDIC well index. Fail-closed validate; human-only OPEN.
 */
export const BAKKEN_PACK: DomainPack = {
  schemaVersion: PACKET_SCHEMA_VERSION,
  id: "bakken",
  version: "1.3.0",
  title: "Bakken / Williston — Dakota oil & production outcomes",
  substrate:
    "North Dakota Industrial Commission (NDIC) public GIS well index: permit, spud, and well-status outcomes.",
  outcomeClasses: OUTCOMES.map((row) => ({
    id: row.id,
    label: row.label,
    short: row.short,
    statusCodes: [...row.statuses],
  })),
  advisorChecks: [
    {
      id: "design-vs-status",
      prompt:
        "What design or commercial intent is claimed for this well, and which NDIC status actually supports it?",
      layer: "design",
      answerAuthority: "evaluator",
    },
    {
      id: "envelope-language",
      prompt:
        "Which public control-envelope terms apply (pressure test to max design, treating-line relief, remote frac valve, nearby-well notice)? Cite ND rule or mark UNKNOWN.",
      layer: "control_envelope",
      answerAuthority: "evaluator",
    },
    {
      id: "field-evidence",
      prompt:
        "What measured NDIC fields are present (API, status, spud, operator, county)? What is explicitly absent (monthly oil/gas/water on this open service)?",
      layer: "field_data",
      answerAuthority: "agent_propose",
    },
    {
      id: "authority-boundary",
      prompt:
        "Who may propose, who evaluates, and who alone may OPEN or authorize field action? Confirm agent cannot self-OPEN.",
      layer: "authorized_action",
      answerAuthority: "human_open",
    },
    {
      id: "contracting-capacity",
      prompt:
        "For an independent contractor in a technical-sales / completions-liaison capacity: which advisor fluency is required vs engineering sign-off vs pumping authority? Keep the three distinct.",
      layer: "authorized_action",
      answerAuthority: "human_open",
    },
  ],
  residueDefaults: [
    {
      id: "no-monthly-volumes",
      statement:
        "Monthly oil, gas, and water volumes are not on the NDIC open GIS service used by DOAPO.",
      evidence: "measured",
    },
    {
      id: "public-docs-not-sop",
      statement:
        "Public product or marketing pages are not controlling field SOPs or setpoints.",
      evidence: "measured",
    },
    {
      id: "gate-authority",
      statement:
        "Gate authority: evidence class, residue, kill conditions, and human-only OPEN are defined by this pack schema.",
      evidence: "derived",
    },
    // Conditional: included by derive-from-well only when status is Confidential / sealed.
    {
      id: "confidential-lag",
      statement:
        "Confidential wells may withhold completion and production detail for a statutory period.",
      evidence: "measured",
    },
  ],
  killConditions: [
    {
      id: "unverified-org-claim",
      statement:
        "STOP if the packet claims an organizational relationship that is not supported by measured facts.",
    },
    {
      id: "invented-volumes",
      statement:
        "STOP if monthly production volumes are asserted from the open GIS substrate alone.",
    },
    {
      id: "agent-self-open",
      statement: "STOP if agent_propose stamps OPEN_CANDIDATE.",
    },
    {
      id: "external-doc-as-sop",
      statement:
        "STOP if an external public page is treated as binding SOP or setpoints.",
    },
  ],
  publicSources: [
    {
      label: "NDIC / DMR public oil & gas resources",
      url: "https://www.dmr.nd.gov/oilgas/",
      evidence: "measured",
    },
  ],
};
