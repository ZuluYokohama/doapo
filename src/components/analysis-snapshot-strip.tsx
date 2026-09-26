/**
 * Durable analysis snapshot list — localStorage verify-on-load viewer.
 * Not an export/import paste treadmill. Shows digest for evidence citation.
 * Power of 10: bounded render lists, no recursion.
 */
import { useCallback, useEffect, useState } from "react";
import {
  MAX_ANALYSIS_SNAPSHOTS,
  analysisSnapshotsPresent,
  citeSnapshotDigest,
  clearAnalysisSnapshots,
  loadAnalysisSnapshots,
  type AnalysisSnapshot,
} from "@/lib/packet";

export function AnalysisSnapshotStrip({
  refreshKey = 0,
}: {
  /** Bump after Persist so the list reloads. */
  refreshKey?: number;
}) {
  const [rows, setRows] = useState<AnalysisSnapshot[]>([]);
  const [reason, setReason] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [present, setPresent] = useState(false);

  const reload = useCallback(() => {
    const loaded = loadAnalysisSnapshots();
    setRows(loaded.snapshots);
    setReason(loaded.reason);
    setPresent(analysisSnapshotsPresent());
  }, []);

  useEffect(() => {
    reload();
  }, [reload, refreshKey]);

  function onClear() {
    clearAnalysisSnapshots();
    setExpanded(null);
    reload();
  }

  return (
    <section className="mb-4 rounded-md border border-line bg-surface p-4">
      <h2 className="text-xs tracking-widest text-accent uppercase">
        Durable analysis snapshots
      </h2>
      <p className="mt-2 text-sm text-muted">
        Fail-closed freeze of prioritize / cohort keyed by pull time + pack
        id/version (+ optional search label). Cap {MAX_ANALYSIS_SNAPSHOTS}.
        Verify-on-load via snapshotDigest. localStorage demo — not durable
        authority. Evidence may cite snapshotDigest. Not an export/import
        strip.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={reload}
          className="min-h-11 rounded-md border border-line bg-raised px-3 py-2 text-sm text-fg"
        >
          Reload
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={!present && rows.length === 0}
          className="min-h-11 rounded-md border border-line bg-raised px-3 py-2 text-sm text-fg disabled:opacity-50"
        >
          Clear snapshots
        </button>
        <span className="font-mono text-xs text-muted">
          {rows.length} stored · present {present ? "yes" : "no"}
        </span>
      </div>

      {reason ? (
        <p className="mt-3 text-sm text-accent" role="alert">
          fail-closed — {reason}
        </p>
      ) : null}

      {rows.length === 0 && reason === null ? (
        <p className="mt-3 font-mono text-sm text-muted">
          no durable analysis snapshots
        </p>
      ) : null}

      {rows.length > 0 ? (
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {rows.map((row) => {
            const open = expanded === row.snapshotDigest;
            return (
              <li key={row.snapshotDigest} className="py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-xs text-fg">
                      {row.kind} · {row.packId}@{row.packVersion}
                    </p>
                    <p className="mt-1 font-mono text-xs text-muted">
                      pulled {row.pulledAtIso}
                      {row.searchQueryLabel.length > 0
                        ? " · " + row.searchQueryLabel
                        : ""}
                    </p>
                    <p className="mt-1 break-all font-mono text-xs text-accent">
                      {citeSnapshotDigest(row.snapshotDigest)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded(open ? null : row.snapshotDigest)
                    }
                    className="min-h-11 rounded-md border border-line bg-raised px-3 py-2 text-sm text-fg"
                  >
                    {open ? "Hide" : "Show"}
                  </button>
                </div>
                {open ? <SnapshotDetail snapshot={row} /> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

function SnapshotDetail({ snapshot }: { snapshot: AnalysisSnapshot }) {
  if (snapshot.kind === "outcome-cohort" && snapshot.cohort) {
    const c = snapshot.cohort;
    return (
      <div className="mt-2 font-mono text-xs text-muted">
        <p>
          total {c.total} · unmatched {c.unmatched} · skipped {c.skipped}
        </p>
        <ul className="mt-1">
          {c.byClass.map((row) => (
            <li key={row.id}>
              {row.id}: {row.count} ({row.label})
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (snapshot.prioritize) {
    const p = snapshot.prioritize;
    const n =
      p.mode === "wells" ? p.wellRows.length : p.operatorRows.length;
    return (
      <div className="mt-2 font-mono text-xs text-muted">
        <p>
          mode {p.mode} · total {p.total} · skipped {p.skipped} · rows {n}
        </p>
        {p.mode === "wells" ? (
          <ul className="mt-1">
            {p.wellRows.slice(0, 8).map((row) => (
              <li key={row.subjectId}>
                {row.priority} · {row.wellLabel} · {row.status}
                {row.staleDuc ? " · stale-duc" : ""}
              </li>
            ))}
          </ul>
        ) : (
          <ul className="mt-1">
            {p.operatorRows.slice(0, 8).map((row) => (
              <li key={row.operator}>
                {row.priority} · {row.operator} · wells {row.wellCount} ·
                stale {row.staleDucCount}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  return (
    <p className="mt-2 font-mono text-xs text-muted">empty payload</p>
  );
}
