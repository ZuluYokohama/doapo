# DOAPO

**Dakota Oil & Production Outcomes** — measured well status from the North Dakota Industrial Commission (NDIC) public GIS, plus a multi-domain **issue-resolution packet** schema for fail-closed proposals.

DOAPO reads public permit / spud / well-status data. It does **not** invent monthly volumes, claim unverified organizational relationships, or treat external public pages as field SOP.

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
- **Kill-condition runtime:** measured fact `kill.id` / `kill:<id>=triggered` forces STOP via `evaluatePacket`
- **Advisor answer UI:** `/packet` fills `advisorChecks` into the working packet before open
- **Durable ledger:** opt-in localStorage persistence (prefer when present; still not durable authority)
- **Pack import JSON:** paste/file load on `/packet`; validate + session overlay (static registry unchanged)
- **Multi-subject export zip:** `/packet` bundles evidence JSON for ≤16 subjects into one STORE zip + fail-closed manifest
- **Evidence bundle import:** paste/file load on `/packet`; verify digest + pack + packet; loads working state
- **Residue editor UI:** edit / add / remove residue on `/packet` before open (bounded, fail-closed)
- **Batch well kill scan:** scan ≤64 search wells via well→packet→kill; hit table on `/packet` live + wells
- **Cross-pack kill audit:** one validated packet vs every registered pack (+ overlay); hit table on `/packet`
- **Outcome cohort summary:** capped well→packet→outcomeClassId counts; cohort table on `/packet` live + wells
- **Kill fact authoring:** toggle pack killConditions → measured `kill:<id>=triggered` on `/packet` working packet
- **Cohort export JSON:** download fail-closed cohort summary (schemaVersion + digest) from wells + `/packet` live strips
- **Cohort export import:** paste/file load on cohort strips; verify schemaVersion + digest into inspector view

Schema overview landed in [PR #1](https://github.com/ZuluYokohama/doapo/pull/1) (`feat/multi-domain-packet-bakken`).

## Hard walls

| Wall | Rule |
|------|------|
| No invented volumes | Monthly oil/gas/water are **not** on the NDIC open GIS substrate DOAPO uses. Do not assert them from that service alone. |
| No external doc as SOP | Public product or marketing pages are **not** controlling SOPs or setpoints. |
| No unverified org claims | Do not claim organizational relationships that measured facts do not support. |
| Fail-closed OPEN | Agents may **propose** evidence. Only `human_open` may stamp `OPEN_CANDIDATE`. MaxOp: residue explicit. |

## MaxOp discipline

Agents propose evidence. Humans **OPEN**. Gates fail closed. Residue is stated, not implied. New packet code follows NASA/JPL Power of 10 discipline (bounded loops, no recursion, assertions, short functions).

## License

Independent project. Not affiliated with any operator, service company, or regulator beyond citing public NDIC / DMR data as measured substrate.
