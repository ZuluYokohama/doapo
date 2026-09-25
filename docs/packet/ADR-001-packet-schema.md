# ADR-001: Own fail-closed multi-domain packet schema as platform core

- **Status:** Accepted
- **Date:** 2026-09-25

## Context

DOAPO needs a durable way to carry issue proposals across domains (starting with Bakken / NDIC) without mixing measured substrate, design intent, vendor marketing language, and authorization. Agents will propose; humans must remain the only party that can OPEN. Residue and kill conditions must be explicit so fail-closed validation can reject promotion and invented claims.

## Decision

Own a **fail-closed multi-domain packet schema** as platform core under `src/lib/packet/`:

- Typed `DomainPack` + `IssuePacket` with Power of 10 bounds (`MAX_*`)
- Four truth layers and authority roles with anti-promotion (`agent_propose` ≠ `OPEN_CANDIDATE`)
- Evidence classes and gate verdicts as first-class fields
- Domain packs registered statically; unknown ids return null + reason
- Arena vendor references allowed only as labeled non-affiliation benchmarks

## Consequences

- Schema / validate / packs / residue are first-party product, not borrowed SOP
- New domains add packs behind the same gates
- Proximity of completions vocabulary to arena marketing does not imply shared control or affiliation
