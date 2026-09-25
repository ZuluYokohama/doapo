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

## Residue

| Id | Point |
|----|-------|
| `no-monthly-volumes` | Volumes not on open GIS substrate |
| `public-docs-not-sop` | Public product / marketing pages are not field SOPs or setpoints |
| `gate-authority` | Gate authority (evidence class, residue, kills, human-only OPEN) defined by pack schema |
| `confidential-lag` | Statutory withhold on confidential wells |

## Public sources

- NDIC / DMR public oil & gas resources (measured substrate)

## Kills

`unverified-org-claim`, `invented-volumes`, `agent-self-open`, `external-doc-as-sop`.
