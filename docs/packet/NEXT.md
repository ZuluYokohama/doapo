# Named next gates

Each item is **STOP until OPEN** (human `OPEN_CANDIDATE`). Do not treat this list as committed scope.

| Gate | Intent | Status |
|------|--------|--------|
| UI packet inspector | Read-only view of pack + packet + gate + residue | **OPEN** (landed) |
| Second domain pack | Another measured substrate pack registered beside Bakken | STOP until OPEN |
| Append-only seal ledger | Ledger evidence class backed by append-only seals | **OPEN** (landed in this PR) |
| Evaluator split from proposer | Separate evaluator path from `agent_propose` in runtime | **OPEN** (landed) |
