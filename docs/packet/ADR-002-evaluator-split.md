# ADR-002: Evaluator split from proposer

- **Status:** Accepted
- **Date:** 2026-09-25

## Context

Validate already fail-closes `agent_propose` + `OPEN_CANDIDATE`, but runtime callers could still blur propose, score, and OPEN into one path. The named gate “Evaluator split from proposer” requires separate helpers so agents propose, evaluators score, and only humans OPEN.

## Decision

Add fail-closed runtime helpers under `src/lib/packet/roles.ts`:

- `proposePacket` — forces `proposedBy: agent_propose`; rejects requested `OPEN_CANDIDATE`; default gate `STOP`; validates before ok
- `evaluatePacket` — scores PASS / FAIL / RESIDUE from validate + residue heuristics; never returns `gate: OPEN_CANDIDATE`; immutable clone
- `openCandidate(packet, openedBy)` — succeeds only when `openedBy === human_open`; stamps `OPEN_CANDIDATE` + `proposedBy: human_open`; validates

Export from `index.ts`. Keep Power of 10 bounds (capped reasons, no recursion, shallow clones).

## Consequences

- Agent and evaluator paths cannot produce `OPEN_CANDIDATE`
- UI can demo propose → evaluate → open without persistence
- Schema / validate remain authoritative; roles are a thin runtime wall on top
