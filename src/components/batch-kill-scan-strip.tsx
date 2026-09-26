/**
 * Batch kill scan UI — scan current well search results (capped).
 * Power of 10: bounded render lists, no recursion.
 */
import { useState } from "react";
import {
  MAX_KILL_SCAN_WELLS,
  listKillScanHits,
  listPackIds,
  resolvePack,
  scanWellsForKills,
  type DomainPack,
  type KillScanRow,
} from "@/lib/packet";
import type { WellRow } from "@/lib/outcomes";

export function BatchKillScanStrip({
  wells,
  pack,
  packIds,
  packId,
  onPackId,
}: {
  wells: WellRow[];
  pack: DomainPack | null;
  packIds?: string[];
  packId?: string;
  onPackId?: (id: string) => void;
}) {
  const [rows, setRows] = useState<KillScanRow[] | null>(null);
  const [scanned, setScanned] = useState(0);
  const [hitCount, setHitCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const ids = packIds ?? listPackIds();
  const activePack = pack;

  function onScan() {
    setError(null);
    if (activePack === null) {
      setError("pack required");
      setRows(null);
      return;
    }
    if (wells.length < 1) {
      setError("no wells to scan");
      setRows(null);
      return;
    }
    const result = scanWellsForKills({
      wells,
      pack: activePack,
      maxWells: MAX_KILL_SCAN_WELLS,
    });
    if (!result.ok) {
      setError(result.reason);
      setRows(null);
      return;
    }
    setRows(result.rows);
    setScanned(result.scanned);
    setHitCount(result.hitCount);
  }

  const hits = rows !== null ? listKillScanHits(rows) : [];
  const showPackSelect =
    onPackId !== undefined && packId !== undefined && ids.length > 0;

  return (
    <section className="mb-4 rounded-md border border-line bg-surface p-4">
      <h2 className="text-xs tracking-widest text-accent uppercase">
        Batch kill scan
      </h2>
      <p className="mt-2 text-sm text-muted">
        Scan up to {MAX_KILL_SCAN_WELLS} current search wells via well→packet→kill
        (no invented volumes). Reports measured kill hits only.
      </p>

      {showPackSelect ? (
        <label className="mt-3 block text-xs tracking-wide text-muted uppercase">
          Domain pack
          <select
            value={packId}
            onChange={(event) => onPackId(event.target.value)}
            className="mt-1 h-11 w-full rounded-md border border-line bg-bg px-3 text-sm text-fg sm:max-w-xs"
          >
            {ids.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onScan}
          disabled={wells.length < 1 || activePack === null}
          className="min-h-11 rounded-md border border-line bg-raised px-3 py-2 text-sm text-fg disabled:opacity-50"
        >
          Scan {wells.length < MAX_KILL_SCAN_WELLS ? wells.length : MAX_KILL_SCAN_WELLS}{" "}
          well{wells.length === 1 ? "" : "s"}
        </button>
        <span className="font-mono text-xs text-muted">
          {wells.length} in view · cap {MAX_KILL_SCAN_WELLS}
        </span>
      </div>

      {error ? (
        <p className="mt-3 text-sm text-accent" role="alert">
          fail-closed — {error}
        </p>
      ) : null}

      {rows !== null && error === null ? (
        <div className="mt-3">
          <p className="font-mono text-xs text-muted">
            scanned {scanned} · hits {hitCount}
          </p>
          {hits.length === 0 ? (
            <p className="mt-2 font-mono text-sm text-fg">no kill hits</p>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[20rem] border-y border-line text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs tracking-wide text-muted uppercase">
                    <th className="py-2 pr-3 font-medium">Subject</th>
                    <th className="py-2 pr-3 font-medium">Well</th>
                    <th className="py-2 pr-3 font-medium">Kill</th>
                    <th className="py-2 font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {hits.map((row) => (
                    <tr key={row.subjectId + ":" + (row.killId ?? "")}>
                      <td className="py-2 pr-3 font-mono text-xs text-fg">
                        {row.subjectId}
                      </td>
                      <td className="py-2 pr-3 text-fg">{row.wellLabel}</td>
                      <td className="py-2 pr-3 font-mono text-accent">
                        {row.killId ?? "—"}
                      </td>
                      <td className="py-2 text-muted">{row.reason ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

/** Resolve pack for wells-page strip (static registry only). */
export function resolveScanPack(packId: string): DomainPack | null {
  const looked = resolvePack(packId, null);
  if (!looked.ok) return null;
  return looked.pack;
}
