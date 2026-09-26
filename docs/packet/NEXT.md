# Named next gates

Each item is **STOP until OPEN** (human `OPEN_CANDIDATE`). Do not treat this list as committed scope.

| Gate | Intent | Status |
|------|--------|--------|
| UI packet inspector | Read-only view of pack + packet + gate + residue | **OPEN** (landed) |
| Second domain pack | Another measured substrate pack registered beside Bakken | **OPEN** (landed — `bakken-duc` DUC queue) |
| Append-only seal ledger | Ledger evidence class backed by append-only seals | **OPEN** (landed) |
| Evaluator split from proposer | Separate evaluator path from `agent_propose` in runtime | **OPEN** (landed) |
| Live well binding | Wire a live NDIC `WellRow` into `/packet` via `from-well.ts` (fixtures | live mode; no invented volumes) | **OPEN** (landed) |
| Well packet history | Subject-scoped seal list + session ledger store for `/packet` and wells detail | **OPEN** (landed) |
| Auditable packet export | Downloadable evidence bundle: packet + subject seals + tip + chain verify | **OPEN** (this PR) |
| Kill-condition runtime check | Evaluate pack killConditions against packet measured facts / answers → forced STOP | STOP |
| Advisor answer UI | Human/evaluator fill advisorChecks on `/packet` before open | STOP |
| Durable ledger backend | Persist seals beyond sessionStorage (opt-in; still append-only) | STOP |

STOP rows are named next candidates only — not committed scope.

## Live well binding — OPEN (landed)

- `src/lib/packet/from-well.ts`: `wellToMeasuredFacts` + `buildPacketFromWell`
- Maps only real `WellRow` fields; evidence `measured`; residue copied from `pack.residueDefaults`
- `outcomeClassId` via `outcomeOf(status)` only when that class exists on the chosen pack
- `/packet` mode toggle **Fixtures | Live well**; optional `?mode=live&api=…&pack=…`
- Fail-closed empty / search / build errors; runtime propose→evaluate→open may seed from the live packet

## Well packet history — OPEN (landed)

- `listSealsForSubject` / `countSealsForSubject` on the append-only ledger (fail-closed empty subject)
- `ledger-store.ts`: versioned `sessionStorage` demo persistence; verify tip chain on load; corrupt → empty
- `/packet`: one session ledger; **Packet history** strip filtered by subject; runtime appends persist in-tab
- Wells detail: seal count + recent history via shared `wellSubjectId(well)` (same id as `buildPacketFromWell`)
- Not durable authority — demo only

## Auditable packet export — OPEN (this PR)

- `evidence-export.ts`: `exportPacketEvidence` builds a fail-closed JSON freeze artifact
- Bundle: validated packet + subject-scoped seals (cap `EXPORT_SEAL_CAP`) + tip + `chainOk` (full ledger) + `bundleDigest`
- `/packet`: **Export evidence** downloads `packet-evidence-<subjectId>.json` when a validated packet is in view
- Demo artifact from session ledger — not durable authority; humans still own OPEN
