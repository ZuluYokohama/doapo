/**
 * Bakken DUC queue pack — completion-readiness lens on the same NDIC GIS substrate.
 * Power of 10: flat constants, no recursion, bounded outcome subset from OUTCOMES only.
 *
 * Shares measured NDIC well-index substrate with pack `bakken`, but resolves through
 * DUC / NC / completion-pending classes only — not the full production lifecycle.
 * Substrate NDIC; fail-closed; human-only OPEN.
 */
import { OUTCOMES, type OutcomeId } from "../../outcomes.ts";
import { PACKET_SCHEMA_VERSION, type DomainPack, type OutcomeClass } from "../types.ts";

/** Focused queue lens: drilled-uncompleted and adjacent completion-readiness classes. */
const DUC_QUEUE_OUTCOME_IDS: readonly OutcomeId[] = [
  "drilling",
  "sealed",
  "duc",
  "shut",
] as const;

function outcomeClassesForQueue(): OutcomeClass[] {
  const rows: OutcomeClass[] = [];
  let i = 0;
  while (i < OUTCOMES.length) {
    const row = OUTCOMES[i];
    let j = 0;
    let wanted = false;
    while (j < DUC_QUEUE_OUTCOME_IDS.length) {
      if (DUC_QUEUE_OUTCOME_IDS[j] === row.id) {
        wanted = true;
        break;
      }
      j += 1;
    }
    if (wanted) {
      rows.push({
        id: row.id,
        label: row.label,
        short: row.short,
        statusCodes: [...row.statuses],
      });
    }
    i += 1;
  }
  console.assert(rows.length >= 1, "duc-queue has ≥1 outcome class");
  console.assert(rows.length <= DUC_QUEUE_OUTCOME_IDS.length, "subset bound");
  return rows;
}

export const DUC_QUEUE_PACK: DomainPack = {
  schemaVersion: PACKET_SCHEMA_VERSION,
  id: "bakken-duc",
  version: "1.2.0",
  title: "Bakken DUC queue — NDIC measured statuses only",
  substrate:
    "Same NDIC public GIS well index as pack bakken; resolution lens is DUC / NC / completion-readiness statuses only (no invented codes).",
  outcomeClasses: outcomeClassesForQueue(),
  advisorChecks: [
    {
      id: "design-vs-nc",
      prompt:
        "What design or commercial completion intent is claimed, and does NDIC status NC (or related measured class) actually support a DUC / completion-ready reading?",
      layer: "design",
      answerAuthority: "evaluator",
    },
    {
      id: "envelope-language",
      prompt:
        "Which public control-envelope terms apply (pressure test to max design, treating-line relief, remote frac valve, nearby-well notice)? Cite ND rule or mark UNKNOWN if not measured on this substrate.",
      layer: "control_envelope",
      answerAuthority: "evaluator",
    },
    {
      id: "field-evidence",
      prompt:
        "What measured NDIC fields are present (API, status NC/related, spud, operator, county)? What is explicitly absent (monthly oil/gas/water; completion schedule on this open service)?",
      layer: "field_data",
      answerAuthority: "agent_propose",
    },
    {
      id: "authority-boundary",
      prompt:
        "Who may propose, who evaluates, and who alone may OPEN or authorize completion-related field action? Confirm agent cannot self-OPEN.",
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
    {
      id: "shared-ndic-different-lens",
      statement:
        "This pack shares the NDIC public GIS substrate with pack bakken. It does not invent a second data source. The difference is resolution lens: DUC / NC / completion-readiness classes, not full Bakken lifecycle outcomes.",
      evidence: "measured",
    },
    // Conditional: included by derive-from-well when NC + days-since-spud ≥ threshold.
    {
      id: "duc-age",
      statement:
        "NDIC status NC with measured days-since-spud at or past the pack DUC age threshold — timing residue only; no inventable volumes.",
      evidence: "derived",
    },
    // Conditional template: confidential / sealed status lag (same rule as bakken).
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
    {
      id: "stale-duc",
      statement:
        "STOP if measured NC days-since-spud meets or exceeds the pack stale-DUC threshold without human completion authority.",
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
