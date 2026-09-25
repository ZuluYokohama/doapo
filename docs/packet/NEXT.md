# Named next gates

Each item is **STOP until OPEN** (human `OPEN_CANDIDATE`). Do not treat this list as committed scope.

| Gate | Intent | Status |
|------|--------|--------|
| UI packet inspector | Read-only view of pack + packet + gate + residue | **OPEN** (landed) |
| Second domain pack | Another measured substrate pack registered beside Bakken | **OPEN** (landed — `bakken-duc` DUC queue) |
| Append-only seal ledger | Ledger evidence class backed by append-only seals | **OPEN** (landed) |
| Evaluator split from proposer | Separate evaluator path from `agent_propose` in runtime | **OPEN** (landed) |
| Live well binding | Wire a live NDIC `WellRow` into `/packet` via `from-well.ts` (fixtures \| live mode; no invented volumes) | **OPEN** (this PR) |

## Live well binding — OPEN (this PR)

- `src/lib/packet/from-well.ts`: `wellToMeasuredFacts` + `buildPacketFromWell`
- Maps only real `WellRow` fields; evidence `measured`; residue copied from `pack.residueDefaults`
- `outcomeClassId` via `outcomeOf(status)` only when that class exists on the chosen pack
- `/packet` mode toggle **Fixtures | Live well**; optional `?mode=live&api=…&pack=…`
- Fail-closed empty / search / build errors; runtime propose→evaluate→open may seed from the live packet
