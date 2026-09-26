import assert from "node:assert/strict";
import { test } from "node:test";
import type { WellRow } from "../outcomes.ts";
import {
  ANALYSIS_SNAPSHOT_SCHEMA,
  ANALYSIS_SNAPSHOT_STORE_KEY,
  MAX_ANALYSIS_SNAPSHOTS,
  analysisSnapshotsPresent,
  buildSearchQueryLabel,
  citeSnapshotDigest,
  clearAnalysisSnapshots,
  freezeCohortSnapshot,
  freezePrioritizeSnapshot,
  loadAnalysisSnapshots,
  saveAnalysisSnapshot,
  verifyAnalysisSnapshot,
} from "./analysis-snapshot.ts";
import {
  DUC_AGE_DAYS_THRESHOLD,
  MS_PER_DAY,
} from "./derive-from-well.ts";
import { DUC_QUEUE_PACK } from "./packs/duc-queue.ts";

const NOW = Date.UTC(2026, 8, 26);

function sampleWell(overrides: Partial<WellRow> = {}): WellRow {
  return {
    fileNo: 12345,
    api: "33053012340000",
    operator: "Example Operator LLC",
    wellName: "EXAMPLE 1-2H",
    td: 10200,
    spud: Date.UTC(2024, 5, 15),
    field: "BAKKEN",
    legal: "SESE Sec 1 T150N R95W",
    lat: 47.12345,
    lon: -103.12345,
    wellType: "OG",
    status: "NC",
    county: "MCKENZIE",
    ...overrides,
  };
}

type StorageShim = {
  store: Map<string, string>;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
  key(index: number): string | null;
  length: number;
};

function installLocalStorage(): StorageShim {
  const store = new Map<string, string>();
  const shim: StorageShim = {
    store,
    get length() {
      return store.size;
    },
    getItem(key: string) {
      return store.has(key) ? (store.get(key) as string) : null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    key(index: number) {
      const keys = Array.from(store.keys());
      return index >= 0 && index < keys.length ? keys[index] : null;
    },
  };
  const g = globalThis as Record<string, unknown>;
  g.window = { localStorage: shim };
  g.localStorage = shim;
  return shim;
}

function uninstallLocalStorage(): void {
  const g = globalThis as Record<string, unknown>;
  g.window = undefined;
  g.localStorage = undefined;
}

test("freezePrioritizeSnapshot wells keyed by pack + pull + label", () => {
  const frozen = freezePrioritizeSnapshot({
    wells: [
      sampleWell({
        status: "NC",
        api: "33053000020000",
        fileNo: 2,
        wellName: "STALE",
        spud: NOW - (DUC_AGE_DAYS_THRESHOLD + 5) * MS_PER_DAY,
      }),
      sampleWell({
        status: "A",
        api: "33053000010000",
        fileNo: 1,
        wellName: "ACTIVE",
        spud: NOW - 100 * MS_PER_DAY,
      }),
    ],
    packId: DUC_QUEUE_PACK.id,
    packVersion: DUC_QUEUE_PACK.version,
    mode: "wells",
    searchQueryLabel: "q=bakken;county=MCKENZIE",
    pulledAtIso: "2026-09-26T21:00:00.000Z",
    nowMs: NOW,
  });
  assert.equal(frozen.ok, true);
  if (!frozen.ok) return;
  assert.equal(frozen.snapshot.schemaVersion, ANALYSIS_SNAPSHOT_SCHEMA);
  assert.equal(frozen.snapshot.kind, "prioritize-wells");
  assert.equal(frozen.snapshot.packId, DUC_QUEUE_PACK.id);
  assert.equal(frozen.snapshot.packVersion, DUC_QUEUE_PACK.version);
  assert.equal(frozen.snapshot.pulledAtIso, "2026-09-26T21:00:00.000Z");
  assert.equal(frozen.snapshot.searchQueryLabel, "q=bakken;county=MCKENZIE");
  assert.equal(frozen.snapshot.cohort, null);
  assert.ok(frozen.snapshot.prioritize !== null);
  assert.equal(frozen.snapshot.prioritize?.mode, "wells");
  assert.equal(frozen.snapshot.prioritize?.wellRows[0]?.wellLabel, "STALE");
  assert.equal(frozen.snapshot.snapshotDigest.length, 64);
  const cited = citeSnapshotDigest(frozen.snapshot.snapshotDigest);
  assert.equal(cited, "snapshotDigest:" + frozen.snapshot.snapshotDigest);
});

test("freezePrioritizeSnapshot operators + verify round-trip", () => {
  const frozen = freezePrioritizeSnapshot({
    wells: [
      sampleWell({ operator: "Alpha Ops", status: "NC", fileNo: 1, api: "33053000010000" }),
      sampleWell({ operator: "Beta Ops", status: "A", fileNo: 2, api: "33053000020000" }),
    ],
    packId: "bakken",
    packVersion: "1.3.0",
    mode: "operators",
    nowMs: NOW,
  });
  assert.equal(frozen.ok, true);
  if (!frozen.ok) return;
  assert.equal(frozen.snapshot.kind, "prioritize-operators");
  assert.ok(frozen.snapshot.prioritize !== null);
  assert.equal(frozen.snapshot.prioritize?.mode, "operators");
  assert.ok((frozen.snapshot.prioritize?.operatorRows.length ?? 0) >= 1);
  const verified = verifyAnalysisSnapshot(frozen.snapshot);
  assert.equal(verified.ok, true);
  if (!verified.ok) return;
  assert.equal(verified.snapshot.snapshotDigest, frozen.snapshot.snapshotDigest);
});

test("freezeCohortSnapshot digest mismatch fail-closed", () => {
  const frozen = freezeCohortSnapshot({
    wells: [sampleWell({ status: "NC" }), sampleWell({ status: "A", fileNo: 9, api: "33053000090000" })],
    pack: DUC_QUEUE_PACK,
    searchQueryLabel: "outcome=duc",
    pulledAtIso: "2026-09-26T22:00:00.000Z",
  });
  assert.equal(frozen.ok, true);
  if (!frozen.ok) return;
  assert.equal(frozen.snapshot.kind, "outcome-cohort");
  assert.ok(frozen.snapshot.cohort !== null);
  assert.ok((frozen.snapshot.cohort?.total ?? 0) >= 1);
  const tampered = {
    ...frozen.snapshot,
    snapshotDigest: "a".repeat(64),
  };
  const bad = verifyAnalysisSnapshot(tampered);
  assert.equal(bad.ok, false);
  if (bad.ok) return;
  assert.match(bad.reason, /mismatch/i);
});

test("freeze fails closed without pack id / wells", () => {
  const noPack = freezePrioritizeSnapshot({
    wells: [sampleWell()],
    packId: "",
    packVersion: "1.0.0",
    mode: "wells",
  });
  assert.equal(noPack.ok, false);
  const noWells = freezePrioritizeSnapshot({
    wells: null as unknown as WellRow[],
    packId: "bakken",
    packVersion: "1.0.0",
    mode: "wells",
  });
  assert.equal(noWells.ok, false);
  const noPackObj = freezeCohortSnapshot({
    wells: [sampleWell()],
    pack: null as unknown as typeof DUC_QUEUE_PACK,
  });
  assert.equal(noPackObj.ok, false);
});

test("durable snapshot save/load verify-on-load + cap", () => {
  const shim = installLocalStorage();
  try {
    clearAnalysisSnapshots();
    assert.equal(analysisSnapshotsPresent(), false);
    const empty = loadAnalysisSnapshots();
    assert.equal(empty.reason, null);
    assert.equal(empty.snapshots.length, 0);

    let n = 0;
    while (n < MAX_ANALYSIS_SNAPSHOTS + 2) {
      const frozen = freezePrioritizeSnapshot({
        wells: [
          sampleWell({
            fileNo: n + 1,
            api: "330530" + String(10000000 + n).slice(0, 8),
            wellName: "W" + String(n),
          }),
        ],
        packId: "bakken",
        packVersion: "1.3.0",
        mode: "wells",
        pulledAtIso: "2026-09-26T2" + String(n).padStart(1, "0") + ":00:00.000Z",
        searchQueryLabel: "n=" + String(n),
        nowMs: NOW,
      });
      assert.equal(frozen.ok, true);
      if (!frozen.ok) return;
      const saved = saveAnalysisSnapshot(frozen.snapshot);
      assert.equal(saved.ok, true);
      n += 1;
    }
    assert.equal(analysisSnapshotsPresent(), true);
    assert.ok(shim.getItem(ANALYSIS_SNAPSHOT_STORE_KEY) !== null);
    const loaded = loadAnalysisSnapshots();
    assert.equal(loaded.reason, null);
    assert.equal(loaded.snapshots.length, MAX_ANALYSIS_SNAPSHOTS);
    assert.equal(loaded.snapshots[0]?.searchQueryLabel, "n=" + String(MAX_ANALYSIS_SNAPSHOTS + 1));
  } finally {
    uninstallLocalStorage();
  }
});

test("durable snapshot corrupt payload fail-closed", () => {
  const shim = installLocalStorage();
  try {
    shim.setItem(
      ANALYSIS_SNAPSHOT_STORE_KEY,
      JSON.stringify({
        version: 1,
        snapshots: [
          {
            schemaVersion: ANALYSIS_SNAPSHOT_SCHEMA,
            pulledAtIso: "2026-09-26T00:00:00.000Z",
            packId: "bakken",
            packVersion: "1.3.0",
            searchQueryLabel: "",
            kind: "prioritize-wells",
            prioritize: {
              mode: "wells",
              total: 0,
              skipped: 0,
              wellRows: [],
              operatorRows: [],
            },
            cohort: null,
            snapshotDigest: "0".repeat(64),
          },
        ],
      }),
    );
    const loaded = loadAnalysisSnapshots();
    assert.equal(loaded.snapshots.length, 0);
    assert.ok(loaded.reason !== null);
    assert.match(String(loaded.reason), /digest|mismatch|verify/i);
  } finally {
    uninstallLocalStorage();
  }
});

test("buildSearchQueryLabel and citeSnapshotDigest bounds", () => {
  assert.equal(buildSearchQueryLabel({}), "");
  assert.equal(
    buildSearchQueryLabel({ q: "x", county: "MCKENZIE", oilGasOnly: true }),
    "q=x;county=MCKENZIE;oilGasOnly=1",
  );
  assert.equal(citeSnapshotDigest("short"), "snapshotDigest:invalid");
  assert.equal(citeSnapshotDigest("g".repeat(64)), "snapshotDigest:invalid");
});

test("saveAnalysisSnapshot rejects unverifiable digest", () => {
  installLocalStorage();
  try {
    clearAnalysisSnapshots();
    const frozen = freezeCohortSnapshot({
      wells: [sampleWell()],
      pack: DUC_QUEUE_PACK,
    });
    assert.equal(frozen.ok, true);
    if (!frozen.ok) return;
    const bad = {
      ...frozen.snapshot,
      packId: "tampered-pack-id-xxxxxxxx",
    };
    const saved = saveAnalysisSnapshot(bad);
    assert.equal(saved.ok, false);
  } finally {
    uninstallLocalStorage();
  }
});
