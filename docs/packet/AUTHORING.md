# Authoring a domain pack

Checklist for adding a new pack under `src/lib/packet/packs/`. Follow NASA/JPL Power of 10: flat control flow, bounded sizes, no recursion, functions ≤60 lines, assertions at boundaries.

## Power of 10 bounds (`MAX_*` from `types.ts`)

| Bound | Constant | Limit |
|-------|----------|-------|
| Outcome classes | `MAX_OUTCOME_CLASSES` | 32 (≥1 required) |
| Advisor checks | `MAX_ADVISOR_CHECKS` | 64 |
| Residue items | `MAX_RESIDUE_ITEMS` | 64 |
| Kill conditions | `MAX_KILL_CONDITIONS` | 32 (≥1 required) |
| Measured facts (packet) | `MAX_MEASURED_FACTS` | 128 |
| Advisor answers (packet) | `MAX_ADVISOR_ANSWERS` | 64 |
| Public sources | `MAX_SOURCE_REFS` | 16 |
| Id strings | `MAX_ID_LEN` | 64 |
| Short text | `MAX_TEXT_LEN` | 512 |
| Long text | `MAX_LONG_TEXT_LEN` | 2048 |

Stay inside these limits. Prefer `while` with a fixed upper bound over unbounded recursion.

## Pack checklist

1. **Create** `src/lib/packet/packs/<id>.ts` exporting a `DomainPack` with `schemaVersion: PACKET_SCHEMA_VERSION`.
2. **Set** `id`, `version`, `title`, and a one-sentence **substrate** (what measured source this pack reads).
3. **Define** `outcomeClasses` (≥1) mapped from domain status codes — do not invent statuses the substrate does not publish.
4. **Define** `advisorChecks` with correct `TruthLayerId` and `answerAuthority` (OPEN answers stay `human_open`).
5. **Required residue** (see below).
6. **Required kills** (see below).
7. **Public sources** (optional): substrate / standards URLs that serve the pack (prefer measured public GIS / regulator pages).
8. **Register** in `packs/registry.ts` and re-export from `index.ts` if the pack is public API.
9. **Validate** with `validateDomainPack` in `packet.test.ts`.
10. **Fixture** at least one STOP and one valid human OPEN packet.

## Required residue

Every pack must make honesty explicit:

| Residue | Requirement |
|---------|-------------|
| Substrate honesty | State what the measured substrate does **not** provide (e.g. no monthly volumes on open GIS). |
| Public docs not SOP | State that public product or marketing pages are not controlling field SOPs or setpoints. |
| Gate authority | State that evidence class, residue, kill conditions, and human-only OPEN are defined by the pack schema. |

Bakken reference ids: `no-monthly-volumes`, `public-docs-not-sop`, `gate-authority`.

## Required kills

| Kill | Statement intent |
|------|------------------|
| `agent-self-open` | STOP if `agent_propose` stamps `OPEN_CANDIDATE` |
| Invented claims | STOP if facts are asserted that the substrate cannot support |
| `external-doc-as-sop` | STOP if an external public page is treated as binding SOP / setpoints |
| `unverified-org-claim` | STOP if the packet claims an organizational relationship unsupported by measured facts |

## Register in packs + index

```ts
// packs/registry.ts — add to PACK_BY_ID
import { MY_PACK } from "./my-domain.ts";

// index.ts — export if part of public surface
export { MY_PACK } from "./packs/my-domain.ts";
export { getPack, listPackIds } from "./packs/registry.ts";
```

Unknown pack ids must fail closed: `getPack` returns `null` plus a reason string, never a guessed pack.

## Reference packs

- [BAKKEN.md](BAKKEN.md) — full Bakken / Williston lifecycle lens on NDIC GIS
- [DUC-QUEUE.md](DUC-QUEUE.md) — same NDIC substrate; DUC / NC completion-readiness lens (`bakken-duc`)
