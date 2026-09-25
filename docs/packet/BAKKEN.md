# Bakken pack brief

Pack id: `bakken` · version: see `BAKKEN_PACK.version` in `src/lib/packet/packs/bakken.ts`.

## Substrate (NDIC)

North Dakota Industrial Commission (NDIC) public GIS well index: permit, spud, and well-status outcomes.

- Public resources: [dmr.nd.gov/oilgas](https://www.dmr.nd.gov/oilgas/)
- **Not on this open service:** monthly oil / gas / water volumes. Do not invent them from GIS alone.
- Confidential wells may withhold completion and production detail for a statutory period.

## Outcome classes (from `OUTCOMES`)

Mapped from NDIC status codes via `src/lib/outcomes.ts`:

| Id | Label | Example statuses |
|----|-------|------------------|
| `prespud` | Permitted, not spud | LOC, LOCR, PNS |
| `drilling` | Drilling | DRL |
| `sealed` | Confidential | Confidential |
| `duc` | Drilled, not completed | NC |
| `producing` | Active | A |
| `shut` | Inactive or temp. abandoned | IA, TA, TAO, TASC, TATD |
| `dry` | Dry hole | DRY |
| `plugged` | Plugged or abandoned | PA, PANF, AB |
| `cancelled` | Expired or cancelled permit | EXP, PNC |

## Advisor checks

| Id | Layer | Authority |
|----|-------|-----------|
| `design-vs-status` | design | evaluator |
| `envelope-language` | control_envelope | evaluator |
| `field-evidence` | field_data | agent_propose |
| `authority-boundary` | authorized_action | human_open |
| `contracting-capacity` | authorized_action | human_open |

## Residue (including keys-we-hold)

| Id | Point |
|----|-------|
| `no-monthly-volumes` | Volumes not on open GIS substrate |
| `no-vendor-sop` | Vendor pages = arena benchmarks only |
| `keys-we-hold` | DOAPO owns gate, evidence class, residue, kills, human-only OPEN — not vendor product control |
| `confidential-lag` | Statutory withhold on confidential wells |

## Arena benchmarks (non-affiliation)

Listed in the pack as **public competitive benchmarks only**. DOAPO has **no affiliation** with NexTier, Patterson-UTI, or any named completions vendor.

- NDIC / DMR public oil & gas resources
- NexTier public site (not affiliation)
- NexTier eos public page (live-data posture; closed product — not OSS)
- API public standards portal (envelope language)

## Kills

`fake-affiliation`, `invented-volumes`, `agent-self-open`, `vendor-sop-as-law`.
