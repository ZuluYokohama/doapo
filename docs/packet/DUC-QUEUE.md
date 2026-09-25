# Bakken DUC queue pack brief

Pack id: `bakken-duc` · version: see `DUC_QUEUE_PACK.version` in `src/lib/packet/packs/duc-queue.ts`.

## Substrate (same NDIC, different lens)

Uses the **same** North Dakota Industrial Commission (NDIC) public GIS well index as pack [`bakken`](BAKKEN.md). This pack does **not** invent a second data source.

- Public resources: [dmr.nd.gov/oilgas](https://www.dmr.nd.gov/oilgas/)
- **Resolution lens:** DUC / NC / completion-readiness outcome classes only (subset of `OUTCOMES`)
- **Not on this open service:** monthly oil / gas / water volumes. Do not invent them from GIS alone.

## Outcome classes (focused subset)

Mapped only from real `OUTCOMES` status codes — no invented codes:

| Id | Label | Example statuses |
|----|-------|------------------|
| `drilling` | Drilling | DRL |
| `sealed` | Confidential | Confidential |
| `duc` | Drilled, not completed | NC |
| `shut` | Inactive or temp. abandoned | IA, TA, TAO, TASC, TATD |

Primary queue signal: **NC → `duc`**. Adjacent classes sit upstream / beside completion readiness (still drilling, confidential withhold, temp-abandon completion).

## Advisor checks

| Id | Layer | Authority |
|----|-------|-----------|
| `design-vs-nc` | design | evaluator |
| `envelope-language` | control_envelope | evaluator (UNKNOWN if not measured) |
| `field-evidence` | field_data | agent_propose |
| `authority-boundary` | authorized_action | human_open |
| `contracting-capacity` | authorized_action | human_open |

## Residue

| Id | Point |
|----|-------|
| `no-monthly-volumes` | Volumes not on open GIS substrate |
| `public-docs-not-sop` | Public product / marketing pages are not field SOPs or setpoints |
| `keys-we-hold` | Gate authority defined by pack schema |
| `shared-ndic-different-lens` | Same NDIC substrate as `bakken`; different resolution lens |

## Public sources

Same NDIC / DMR public oil & gas resources as Bakken (measured substrate).

## Kills

`unverified-org-claim`, `invented-volumes`, `agent-self-open`, `external-doc-as-sop`.
