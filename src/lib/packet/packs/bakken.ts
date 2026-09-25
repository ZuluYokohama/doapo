import { OUTCOMES } from "../../outcomes.ts";
import { PACKET_SCHEMA_VERSION, type DomainPack } from "../types.ts";

/**
 * Bakken / Williston domain pack for DOAPO.
 * Substrate: public NDIC well index.
 * Arena benchmarks are public competitors/leaders for role shape only —
 * DOAPO has no affiliation with NexTier, Patterson-UTI, or any named vendor.
 *
 * Arena proximity vs keys we hold (eos public posture as benchmark only):
 * - They: sensor-to-screen live truth, open architecture into operator workflows,
 *   pad/crew consistency, visibility+control, automation runway (closed product).
 * - We: field_data + measured residue; fail-closed validate; owned multi-domain
 *   packs; four-layer truth split; agent_propose cannot OPEN; kill conditions
 *   for fake affiliation / vendor SOP-as-law.
 * Vocabulary can look close. Gates, authority, and substrate honesty are ours.
 */
export const BAKKEN_PACK: DomainPack = {
  schemaVersion: PACKET_SCHEMA_VERSION,
  id: "bakken",
  version: "1.1.0",
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
      id: "no-vendor-sop",
      statement:
        "Public vendor pages are arena benchmarks only. They are not DOAPO employer affiliation and not controlling field SOPs.",
      evidence: "measured",
    },
    {
      id: "keys-we-hold",
      statement:
        "Arena leaders may sell live field visibility and open integration. DOAPO owns the gate: evidence class, residue, kill conditions, and human-only OPEN. Proximity of completions vocabulary is not shared control of the schema.",
      evidence: "derived",
    },
    {
      id: "confidential-lag",
      statement:
        "Confidential wells may withhold completion and production detail for a statutory period.",
      evidence: "measured",
    },
  ],
  killConditions: [
    {
      id: "fake-affiliation",
      statement:
        "STOP if any packet claims DOAPO or the operator is affiliated with a named completions vendor.",
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
      id: "vendor-sop-as-law",
      statement:
        "STOP if a public product page is promoted to binding SOP or pressure setpoints.",
    },
  ],
  arenaBenchmarks: [
    {
      label: "NDIC / DMR public oil & gas resources",
      url: "https://www.dmr.nd.gov/oilgas/",
      evidence: "measured",
    },
    {
      label: "Arena benchmark — NexTier public site (not affiliation)",
      url: "https://www.nextierofs.com/",
      evidence: "derived",
    },
    {
      label: "Arena benchmark — NexTier eos public page (live-data posture; not OSS)",
      url: "https://nextierofs.com/digital-solutions/eos/",
      evidence: "derived",
    },
    {
      label: "API public standards portal (envelope language)",
      url: "https://www.api.org/",
      evidence: "derived",
    },
  ],
};
