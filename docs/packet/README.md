# Packet platform — architecture certificate

## Purpose

Multi-domain **issue-resolution packets** let DOAPO carry a typed proposal for a subject (e.g. a Bakken well) without collapsing design intent, measured field data, control language, and authorized action into one claim.

A **domain pack** defines outcome classes, advisor checks, default residue, kill conditions, and public sources. An **issue packet** binds a subject to a pack with measured facts, answers, residue, authority role, and a gate verdict.

## Four truth layers

| Layer | Role |
|-------|------|
| `design` | Claimed commercial / engineering intent |
| `control_envelope` | Named pressure / relief / notice language (cite rule or mark UNKNOWN) |
| `field_data` | Measured substrate fields present or explicitly absent |
| `authorized_action` | Who may propose, evaluate, OPEN, or execute |

Layers must not promote into each other. Field data does not become design intent. External public pages do not become control envelopes.

## Authority roles + anti-promotion

| Role | May |
|------|-----|
| `agent_propose` | Propose facts, answers, STOP / RESIDUE / ABSTAIN |
| `evaluator` | Score advisor checks within pack rules |
| `human_open` | Stamp `OPEN_CANDIDATE` |
| `ops_execute` | Field / ops execution after human OPEN (out of band of validate) |

**Anti-promotion:** `agent_propose` **cannot** stamp `OPEN_CANDIDATE`. Validation fails closed with reason `anti-promotion: agent_propose cannot stamp OPEN_CANDIDATE`.

### Runtime paths (propose / evaluate / open)

| Path | Helper | May produce `OPEN_CANDIDATE`? |
|------|--------|------------------------------|
| Propose | `proposePacket` | **No** — forces `agent_propose`; rejects OPEN requests; default `STOP` |
| Evaluate | `evaluatePacket` | **No** — returns PASS / FAIL / RESIDUE; strips OPEN from returned gate |
| Open | `openCandidate` | **Only** when `openedBy === human_open` |

See `roles.ts` and [ADR-002-evaluator-split.md](ADR-002-evaluator-split.md).

## Evidence classes

| Class | Meaning |
|-------|---------|
| `measured` | Directly observed on substrate or ledger |
| `derived` | Computed / inferred from measured inputs |
| `aspirational` | Intent or target, not yet measured |
| `ledger` | Append-only seal / audit record |
| `unknown` | Explicitly not known; do not invent |

### Append-only seal ledger

`ledger.ts` backs the `ledger` evidence class with bounded, fail-closed seals (`MAX_SEALS` = 256). Digests chain via `prevDigest` (empty string at genesis). No rewrite, delete, or middle insert. Roles stay pure; UI/demo may call `appendSeal` / `appendOpenSeal` after propose → evaluate → open.

**Subject-scoped history:** `listSealsForSubject` / `countSealsForSubject` filter by `packetSubjectId` (UI-capped). **Session store** (`ledger-store.ts`) persists one demo ledger in `sessionStorage` (versioned JSON, chain verified on load; corrupt → empty). Demo only — not durable authority. See [ADR-003-seal-ledger.md](ADR-003-seal-ledger.md).

## Gate verdicts

| Verdict | Meaning |
|---------|---------|
| `OPEN_CANDIDATE` | Human-authorized candidate only (not auto-execute) |
| `STOP` | Kill condition or hard wall hit |
| `RESIDUE` | Proceed only with residue made explicit |
| `ABSTAIN` | Insufficient authority or evidence |

## Gate authority (pack schema)

**DOAPO owns:**

- Multi-domain packet schema and bounds
- Fail-closed validate (anti-promotion, sizes, evidence)
- Explicit residue and kill conditions
- Human-only OPEN
- Append-only seal ledger (in-memory demo / evidence backing)

Public sources listed on a pack are substrate / standards pointers only. They are not controlling SOPs.

## File map (`src/lib/packet/`)

| Path | Role |
|------|------|
| `types.ts` | Schema version, `MAX_*` bounds, packet / pack types |
| `validate.ts` | Fail-closed `validateDomainPack` / `validateIssuePacket` |
| `index.ts` | Public exports |
| `packs/bakken.ts` | Bakken / Williston domain pack |
| `packs/duc-queue.ts` | Bakken DUC queue pack (`bakken-duc`) |
| `packs/registry.ts` | Static pack map; `getPack` / `listPackIds` |
| `fixtures/example-bakken-issue.ts` | Bakken STOP + valid OPEN examples |
| `fixtures/example-duc-queue-issue.ts` | DUC queue STOP + valid OPEN examples |
| `roles.ts` | Runtime propose / evaluate / open paths |
| `ledger.ts` | Append-only seal ledger (`SealRecord`, `appendSeal`, tip chain, subject list) |
| `ledger-store.ts` | Browser demo `sessionStorage` ledger (versioned; fail-closed verify) |
| `from-well.ts` | Live NDIC `WellRow` → measured facts + issue packet; `wellSubjectId` |
| `packet.test.ts` | Node test suite |
| `from-well.test.ts` | Live well mapping tests (no volumes; status→outcome; bounds) |


## Live well binding

`from-well.ts` binds a live NDIC `WellRow` into an issue packet: measured facts only (no invented oil/gas/water volumes), `outcomeClassId` from `outcomeOf(status)` when that class is on the pack, residue copied from `pack.residueDefaults`. The `/packet` UI toggles **Fixtures | Live well** and may deep-link with `?mode=live&api=…`. See [NEXT.md](NEXT.md).

## How to run tests

```bash
./node_modules/.bin/tsx --test src/lib/packet/packet.test.ts src/lib/packet/from-well.test.ts
```

See also [AUTHORING.md](AUTHORING.md), [BAKKEN.md](BAKKEN.md), [DUC-QUEUE.md](DUC-QUEUE.md), [ADR-001-packet-schema.md](ADR-001-packet-schema.md), [ADR-002-evaluator-split.md](ADR-002-evaluator-split.md), [ADR-003-seal-ledger.md](ADR-003-seal-ledger.md), [NEXT.md](NEXT.md).
