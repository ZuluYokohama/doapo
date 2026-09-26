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

**Subject-scoped history:** `listSealsForSubject` / `countSealsForSubject` filter by `packetSubjectId` (UI-capped; export may use `EXPORT_SEAL_CAP`). **Session store** (`ledger-store.ts`) persists one demo ledger in `sessionStorage` (versioned JSON, chain verified on load; corrupt → empty). **Evidence export** freezes packet + subject seals into a downloadable JSON bundle. Demo only — not durable authority. See [ADR-003-seal-ledger.md](ADR-003-seal-ledger.md).

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
| `derive-from-well.ts` | Measured DUC/status derivation → residue + kill hints (status / spud age) |
| `evidence-export.ts` | Fail-closed auditable evidence bundle (`exportPacketEvidence` / `importEvidenceBundle`) |
| `evidence-zip.ts` | Multi-subject STORE zip (`exportMultiSubjectEvidenceZip`, `MAX_EXPORT_SUBJECTS`) |
| `kill-check.ts` | Runtime killConditions check + `applyKillGate` (forced STOP) |
| `kill-scan.ts` | Batch `scanWellsForKills` (≤`MAX_KILL_SCAN_WELLS`) via well→packet→kill |
| `kill-scan-export.ts` | `exportKillScan` / `importKillScan` freeze artifact (schemaVersion + bundleDigest) |
| `kill-audit.ts` | Cross-pack `auditKillsAcrossPacks` (≤`MAX_AUDIT_PACKS`) packet vs packs + overlay |
| `kill-audit-export.ts` | `exportKillAudit` / `importKillAudit` freeze artifact (schemaVersion + bundleDigest) |
| `advisor-answer.ts` | `setAdvisorAnswer` / `allowedAnswerRoles` (fill checks before open) |
| `residue-edit.ts` | `setResidueItem` / `addResidueItem` / `removeResidueItem` (edit before open) |
| `pack-import.ts` | `importPackFromJson` / `resolvePack` (bounded JSON; session overlay) |
| `ledger-durable.ts` | Opt-in localStorage durable ledger (prefer when present) |
| `packet.test.ts` | Node test suite |
| `from-well.test.ts` | Live well mapping tests (no volumes; status→outcome; bounds) |
| `derive-from-well.test.ts` | Derivation rules (confidential-lag, duc-age, stale-duc; no volumes) |
| `kill-scan.test.ts` | Batch kill scan + export/importKillScan digest / bounds / fail-closed |
| `kill-audit.test.ts` | Cross-pack kill audit + export/importKillAudit digest / bounds / fail-closed |


## Live well binding

`from-well.ts` binds a live NDIC `WellRow` into an issue packet: measured facts only (no invented oil/gas/water volumes), `outcomeClassId` from `outcomeOf(status)` when that class is on the pack, always-on residue from `pack.residueDefaults`, plus **measured derivation** from `derive-from-well.ts` (conditional residue / kill hints from status and spud age). The `/packet` UI toggles **Fixtures | Live well** and may deep-link with `?mode=live&api=…`. See [NEXT.md](NEXT.md).

## Measured DUC/status derivation

`deriveFromWell` emits `days-since-spud` when spud is present; adds `confidential-lag` residue for Confidential / sealed; adds `duc-age` residue when NC days ≥ `DUC_AGE_DAYS_THRESHOLD` (365); and, when the pack declares kill `stale-duc` (`bakken-duc`), sets `kill:stale-duc=triggered`. Fail-closed; no invented volumes. Live `/packet` build inherits this path; kill-fact authoring remains for overrides. **Freeze:** do not add another export/import STOP gate — prefer info→value derivation.

## Evidence export / import

`evidence-export.ts` builds a downloadable freeze artifact: validated packet, subject-scoped seals, ledger tip, full-ledger `chainOk`, and `bundleDigest`. `/packet` offers **Export evidence** when a validated packet is in view. `importEvidenceBundle` parses the same JSON (bounded), recomputes `bundleDigest`, resolves the pack, validates the packet, and optionally verifies seal digests — loading the packet into `/packet` working state. Demo artifact — **not durable authority**; humans still own OPEN. See [NEXT.md](NEXT.md) and [ADR-003-seal-ledger.md](ADR-003-seal-ledger.md).

## Kill-condition runtime

`kill-check.ts` evaluates pack `killConditions` against packet measured facts. A kill hits when a fact key equals `kill.id` or `kill:<id>` with value `triggered`. `evaluatePacket` applies `applyKillGate` last so a triggered kill forces STOP / FAIL. See [NEXT.md](NEXT.md).

## Batch well kill scan

`kill-scan.ts` scans a bounded list of NDIC wells (`MAX_KILL_SCAN_WELLS` = 64) through `buildPacketFromWell` then `checkKillConditions`. No invented volumes. `kill-scan-export.ts` freezes the scan into a downloadable JSON artifact (`schemaVersion` + `bundleDigest`) and `importKillScan` verifies the same fail-closed. `/packet` live mode and the wells register offer **Batch kill scan** + **Export JSON** + paste/file **Import JSON** over current search results and a hit table. See [NEXT.md](NEXT.md).

## Cross-pack kill audit

`kill-audit.ts` audits one validated packet against every registered pack (+ optional session overlay), capped at `MAX_AUDIT_PACKS`. `kill-audit-export.ts` freezes the hit table into a downloadable JSON artifact (`schemaVersion` + `bundleDigest`); `importKillAudit` verifies the same fail-closed. `/packet` offers **Cross-pack kill audit** + **Export JSON**. See [NEXT.md](NEXT.md).

## Advisor answer UI

`advisor-answer.ts` lets human/evaluator fill pack `advisorChecks` on a working packet before open. `/packet` lists checks (bounded), constrains roles, fail-closes empty answers, and feeds validate / evaluate / open / export. See [NEXT.md](NEXT.md).

## Residue editor UI

`residue-edit.ts` lets humans edit packet `residue` before open: set / add / remove with `MAX_RESIDUE_ITEMS`, text bounds, and evidence enum checks. `/packet` lists items (bounded), fail-closes empty statement / over-cap / bad evidence, and feeds validate / evaluate / open / export. See [NEXT.md](NEXT.md).

## Pack import JSON

`pack-import.ts` parses and fail-closed validates a `DomainPack` from bounded JSON (`MAX_PACK_JSON_CHARS`). The static registry is not mutated; `/packet` keeps an imported pack in session state and resolves it via `resolvePack` for live build / kill / advisor. See [NEXT.md](NEXT.md).

## Multi-subject export zip

`evidence-zip.ts` bundles several subjects' evidence JSON into one STORE-only zip (`MAX_EXPORT_SUBJECTS` ≤ 16) with a fail-closed `manifest.json`. Each subject is exported via `exportPacketEvidence`; any failure aborts the whole archive. `/packet` offers checkbox selection and zip download. See [NEXT.md](NEXT.md).

## How to run tests

```bash
./node_modules/.bin/tsx --test src/lib/packet/packet.test.ts src/lib/packet/from-well.test.ts src/lib/packet/derive-from-well.test.ts src/lib/packet/kill-scan.test.ts src/lib/packet/kill-audit.test.ts
```

See also [AUTHORING.md](AUTHORING.md), [BAKKEN.md](BAKKEN.md), [DUC-QUEUE.md](DUC-QUEUE.md), [ADR-001-packet-schema.md](ADR-001-packet-schema.md), [ADR-002-evaluator-split.md](ADR-002-evaluator-split.md), [ADR-003-seal-ledger.md](ADR-003-seal-ledger.md), [NEXT.md](NEXT.md).
