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
| Auditable packet export | Downloadable evidence bundle: packet + subject seals + tip + chain verify | **OPEN** (landed) |
| Kill-condition runtime check | Evaluate pack killConditions against packet measured facts / answers → forced STOP | **OPEN** (landed) |
| Advisor answer UI | Human/evaluator fill advisorChecks on `/packet` before open | **OPEN** (landed) |
| Durable ledger backend | Persist seals beyond sessionStorage (opt-in; still append-only) | **OPEN** (landed) |
| Pack import JSON | Import a domain pack from bounded JSON (validate + session overlay; static registry unchanged) | **OPEN** (landed) |
| Multi-subject export zip | Bundle evidence JSON for several subjects into one download archive | **OPEN** (landed) |
| Evidence bundle import | Parse + verify exported JSON (digest/chain) into working packet | **OPEN** (landed) |
| Residue editor UI | Edit residue items on /packet before open | **OPEN** (landed) |
| Batch well kill scan | Scan N wells for kill facts / status rules | **OPEN** (landed) |
| Cross-pack kill audit | One packet audited against every registered pack (+ overlay); hit table | **OPEN** (landed) |
| Outcome cohort summary | Aggregate outcomeClassId counts for a capped search page | **OPEN** (landed) |
| Kill fact authoring UI | Set measured `kill:id=triggered` facts on `/packet` before audit/open | **OPEN** (landed) |
| Cohort export JSON | Download fail-closed cohort summary artifact from current search | **OPEN** (landed) |
| Cohort export import | Parse + verify cohort JSON digest into inspector view | **OPEN** (landed) |
| Kill scan export JSON | Download fail-closed batch kill-scan artifact (schema + digest) | **OPEN** (landed) |
| Kill scan export import | Parse + verify kill-scan JSON digest into inspector view | **OPEN** (this PR) |
| Cross-pack kill audit export JSON | Download fail-closed cross-pack audit artifact (schema + digest) | **STOP** |

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

## Auditable packet export — OPEN (landed)

- `evidence-export.ts`: `exportPacketEvidence` builds a fail-closed JSON freeze artifact
- Bundle: validated packet + subject-scoped seals (cap `EXPORT_SEAL_CAP`) + tip + `chainOk` (full ledger) + `bundleDigest`
- `/packet`: **Export evidence** downloads `packet-evidence-<subjectId>.json` when a validated packet is in view
- Demo artifact from session ledger — not durable authority; humans still own OPEN

## Kill-condition runtime check — OPEN (landed)

- `kill-check.ts`: `checkKillConditions` + `applyKillGate` (fail-closed)
- Match rule: measured fact key equals `kill.id` or `kill:<id>` with value `triggered` (case-insensitive)
- `evaluatePacket` applies kill gate last — triggered kill forces gate STOP and verdict FAIL (cannot PASS past a kill)
- `/packet`: **Kill check** strip shows hit / miss / fail-closed when packet validates
- Authors set the measured fact when a kill is observed; no fuzzy statement matching

## Advisor answer UI — OPEN (landed)

- `advisor-answer.ts`: `setAdvisorAnswer` + `allowedAnswerRoles` (fail-closed)
- Replaces same `checkId`; caps `MAX_ADVISOR_ANSWERS`; empty answer rejected
- Roles: always evaluator / human_open; `agent_propose` only when check `answerAuthority` is `agent_propose`
- `/packet`: **Advisor answers** strip lists pack checks (bounded); apply updates working packet used by validate / evaluate / open / export
- `evaluatePacket` + kill gate unchanged; answers marked with selected `answeredAs`

## Durable ledger backend — OPEN (landed)

- `ledger-durable.ts`: localStorage store (separate key from session); same verify-on-load as session; corrupt → empty
- APIs: `loadDurableLedger` / `saveDurableLedger` / `clearDurableLedger` / `appendAndPersist` / `loadPreferredLedger`
- Cap `MAX_SEALS`; never rewrite or delete middle seals; `ledger.ts` stays pure in-memory
- `/packet`: prefer durable when present (opt-in Persist ledger copies session→durable); session remains ephemeral demo
- Not durable authority — local opt-in only; humans still own OPEN

## Pack import JSON — OPEN (landed)

- `pack-import.ts`: `importPackFromJson` + `resolvePack` (fail-closed)
- Cap `MAX_PACK_JSON_CHARS`; guarded `JSON.parse`; `validateDomainPack` required
- Static registry is **not** mutated — imported pack is session/UI overlay only
- `/packet`: paste or file load; select imported id for live well build / kill / advisor

## Multi-subject export zip — OPEN (landed)

- `evidence-zip.ts`: `exportMultiSubjectEvidenceZip` + STORE-only `buildStoreZip`
- Cap `MAX_EXPORT_SUBJECTS` (≤16); `exportPacketEvidence` per subject; fail-closed on empty / over-cap / duplicate / any subject failure
- Zip includes `manifest.json` (subject digests, tip, `ledgerChainOk`, `manifestDigest`) + per-subject evidence JSON
- `/packet`: **Multi-subject export zip** strip (fixture + current subject checkboxes)
- Demo artifact — not durable authority; humans still own OPEN

## Evidence bundle import — OPEN (landed)

- `evidence-export.ts`: `importEvidenceBundle` parses + verifies a freeze artifact
- Cap `MAX_EVIDENCE_JSON_CHARS`; schemaVersion check; recompute `bundleDigest` (mismatch → fail)
- Pack resolve via `resolvePack` / registry; `validateIssuePacket` required
- Optional: per-seal digest verify when `bundle.seals` present (subject-filtered; not full chain)
- `/packet`: paste or file **Import evidence** → load packet into working state
- Demo artifact — not durable authority; humans still own OPEN

## Residue editor UI — OPEN (landed)

- `residue-edit.ts`: `setResidueItem` / `addResidueItem` / `removeResidueItem` (fail-closed)
- Cap `MAX_RESIDUE_ITEMS`; empty statement rejected; evidence enum checked; text bounds
- `set` replaces by id; `add` appends (duplicate id / full → fail); `remove` drops by id
- `/packet`: **Residue editor** strip lists items (bounded); apply / add / remove update working packet used by validate / evaluate / open / export
- `evaluatePacket` + kill gate unchanged; residue still drives RESIDUE verdict when non-empty

## Batch well kill scan — OPEN (landed)

- `kill-scan.ts`: `scanWellsForKills` + `listKillScanHits` (fail-closed)
- Cap `MAX_KILL_SCAN_WELLS` (64); only `buildPacketFromWell` → `checkKillConditions` (no invented volumes)
- Result rows: `{ subjectId, wellLabel, hit, killId?, reason? }`; build/check failures record `reason`
- `/packet` live mode + wells register: **Batch kill scan** button over current search results; hit table

## Cross-pack kill audit — OPEN (landed)

- `kill-audit.ts`: `auditKillsAcrossPacks` + `auditPacketKills` + `listPacksForAudit` (fail-closed)
- Cap `MAX_AUDIT_PACKS` (= `MAX_REGISTERED_PACKS`); empty packs list → fail-closed
- Same measured facts packet; `checkKillConditions(pack, packet)` per pack (facts are pack-agnostic kill ids)
- Optional session overlay: prefer matching id / append if new (`mergePacksForAudit`)
- Result rows: `{ packId, packVersion, hit, killId?, reason? }`
- `/packet`: **Cross-pack kill audit** strip when packet validates; full pack table + hit count

## Outcome cohort summary — OPEN (landed)

- `outcome-cohort.ts`: `summarizeOutcomeCohort` (fail-closed)
- Cap `MAX_COHORT_WELLS` (64, aligned with kill scan); invalid cap / missing pack/wells → fail
- Path: `buildPacketFromWell` → `outcomeClassId` (outcomeOf + pack membership); no invented volumes
- Result: `{ ok, total, byClass: { id, label, count }[], unmatched, skipped }`
- `/packet` live + wells register: **Cohort summary** table from current search results

## Kill fact authoring UI — OPEN (landed)

- `kill-fact-edit.ts`: `setKillTriggered` / `isKillTriggered` / `killFactKey` / `listKillConditionsForUi` (fail-closed)
- Preferred measured key `kill:<id>` with value `KILL_TRIGGER_VALUE` (`triggered`); clear removes matching bare/`kill:` facts
- Cap `MAX_MEASURED_FACTS` (packet); aware of `MAX_WELL_FACTS` (from-well builder only)
- `/packet`: **Kill fact authoring** strip lists pack `killConditions` with Triggered toggle → working packet
- Feeds kill check / evaluate / cross-pack audit

## Cohort export JSON — OPEN (landed)

- `cohort-export.ts`: `exportOutcomeCohort` + `cohortFilename` (fail-closed)
- Delegates counts to `summarizeOutcomeCohort`; bundle: schemaVersion, packId/packVersion, total, byClass, unmatched, skipped, notes, bundleDigest
- Download name `outcome-cohort-<packId>.json` (sanitized, truncated)
- Cohort strips (wells + `/packet` live): **Export JSON** button beside Summarize
- Demo artifact — not durable authority; humans still own OPEN

## Cohort export import — OPEN (landed)

- `cohort-export.ts`: `importOutcomeCohort` (fail-closed)
- Cap `MAX_COHORT_JSON_CHARS`; guarded `JSON.parse`; schemaVersion check; recompute `bundleDigest` (mismatch → fail)
- Shape: packId/packVersion, total/unmatched/skipped non-neg ints, byClass ≤ `MAX_OUTCOME_CLASSES`
- Cohort strips (wells + `/packet` live): paste or file **Import JSON** → inspector table
- Demo artifact — not durable authority; humans still own OPEN

## Kill scan export JSON — OPEN (landed)

- `kill-scan-export.ts`: `exportKillScan` + `killScanFilename` (fail-closed)
- Delegates scan to `scanWellsForKills`; bundle: schemaVersion, packId/packVersion, scanned, hitCount, rows, notes, bundleDigest
- Download name `kill-scan-<packId>.json` (sanitized, truncated)
- Kill scan strips (wells + `/packet` live): **Export JSON** button beside Scan
- Demo artifact — not durable authority; humans still own OPEN

## Kill scan export import — OPEN (this PR)

- `kill-scan-export.ts`: `importKillScan` (fail-closed)
- Cap `MAX_KILL_SCAN_JSON_CHARS`; guarded `JSON.parse`; schemaVersion check; recompute `bundleDigest` (mismatch → fail)
- Shape: packId/packVersion, scanned/hitCount non-neg ints ≤ `MAX_KILL_SCAN_WELLS`, rows ≤ cap
- Kill scan strips (wells + `/packet` live): paste or file **Import JSON** → inspector table
- Demo artifact — not durable authority; humans still own OPEN

