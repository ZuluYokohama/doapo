# ADR-003: Append-only seal ledger

- **Status:** Accepted
- **Date:** 2026-09-25

## Context

Evidence class `ledger` needs a concrete backing store so audit seals are not free-form claims. The named gate “Append-only seal ledger” requires fail-closed, Power-of-10 seals that agents and UI can append after propose / evaluate / open without rewriting history.

## Decision

Add `src/lib/packet/ledger.ts`:

- `SealRecord` — id, atIso, kind (`propose` | `evaluate` | `open` | `abstain` | `stop`), packetSubjectId, packId, gate, proposedBy, digest, prevDigest, note
- `SealLedger` — in-memory list bounded by `MAX_SEALS` (256)
- `createLedger` / `appendSeal` / `listSeals` / `tipDigest` — append-only; genesis uses empty `prevDigest`; digests are SHA-256 over canonical fields via `node:crypto`
- `sealFromPacket` — build append input from an `IssuePacket` after role paths
- `appendOpenSeal` — thin UI/demo hook; `openCandidate` stays pure (no auto-seal)

No rewrite, delete, or insert-middle APIs.

## Consequences

- Tip-chain mismatches and over-capacity fail closed
- UI can demo seals in component state without persistence
- Roles remain authority walls; ledger is evidence, not authorization

## Related

- `evidence-export.ts` — auditable packet evidence bundle over this ledger (demo freeze artifact).
