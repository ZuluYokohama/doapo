# DOAPO

**Dakota Oil & Production Outcomes** — measured well status from the North Dakota Industrial Commission (NDIC) public GIS, plus a multi-domain **issue-resolution packet** schema for fail-closed proposals.

DOAPO reads public permit / spud / well-status data. It does **not** invent monthly volumes, claim vendor affiliation, or treat arena product pages as field SOP.

## Quick start

```bash
npm install
./node_modules/.bin/tsx --test src/lib/packet/packet.test.ts
```

Or run the full test script:

```bash
npm test
```

## Packet platform

The multi-domain packet schema lives under `src/lib/packet/`.

- **Architecture certificate:** [docs/packet/README.md](docs/packet/README.md)
- **Authoring a domain pack:** [docs/packet/AUTHORING.md](docs/packet/AUTHORING.md)
- **Bakken pack brief:** [docs/packet/BAKKEN.md](docs/packet/BAKKEN.md)
- **ADR-001 (schema as platform core):** [docs/packet/ADR-001-packet-schema.md](docs/packet/ADR-001-packet-schema.md)
- **Named next gates:** [docs/packet/NEXT.md](docs/packet/NEXT.md)
- **UI packet inspector:** read-only `/packet` route (fixtures; no NDIC loader)

Schema overview landed in [PR #1](https://github.com/ZuluYokohama/doapo/pull/1) (`feat/multi-domain-packet-bakken`).

## Hard walls

| Wall | Rule |
|------|------|
| No invented volumes | Monthly oil/gas/water are **not** on the NDIC open GIS substrate DOAPO uses. Do not assert them from that service alone. |
| No vendor SOP as law | Public completions / digital pages are **arena benchmarks only**, not controlling SOPs or setpoints. |
| No fake affiliation | DOAPO is **not** affiliated with NexTier, Patterson-UTI, or any named completions vendor. Naming them in docs or packs is benchmark posture only. |
| Fail-closed OPEN | Agents may **propose** evidence. Only `human_open` may stamp `OPEN_CANDIDATE`. MaxOp: residue explicit. |

## MaxOp discipline

Agents propose evidence. Humans **OPEN**. Gates fail closed. Residue is stated, not implied. New packet code follows NASA/JPL Power of 10 discipline (bounded loops, no recursion, assertions, short functions).

## License / affiliation

Independent project. Arena vendor names appear solely as public competitive benchmarks.
