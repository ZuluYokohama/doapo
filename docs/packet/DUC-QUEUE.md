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
| `no-vendor-sop` | Vendor pages = arena benchmarks only |
| `keys-we-hold` | DOAPO owns gate, evidence class, residue, kills, human-only OPEN |
| `shared-ndic-different-lens` | Same NDIC substrate as `bakken`; different resolution lens |

## Arena benchmarks (non-affiliation)

Same public competitive benchmarks as Bakken. DOAPO has **no affiliation** with NexTier or any named completions vendor.

## Kills

`fake-affiliation`, `invented-volumes`, `agent-self-open`, `vendor-sop-as-law`.
