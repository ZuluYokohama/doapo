/**
 * Outcome cohort summary UI — counts from current well search results (capped).
 * Power of 10: bounded render lists, no recursion.
 */
import { useState } from "react";
import {
  MAX_COHORT_WELLS,
  listPackIds,
  resolvePack,
  summarizeOutcomeCohort,
  type CohortClassCount,
  type DomainPack,
} from "@/lib/packet";
import type { WellRow } from "@/lib/outcomes";

export function OutcomeCohortStrip({
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
  const [byClass, setByClass] = useState<CohortClassCount[] | null>(null);
  const [total, setTotal] = useState(0);
  const [unmatched, setUnmatched] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const ids = packIds ?? listPackIds();
  const activePack = pack;

  function onSummarize() {
    setError(null);
    if (activePack === null) {
      setError("pack required");
      setByClass(null);
      return;
    }
    if (wells.length < 1) {
      setError("no wells to summarize");
      setByClass(null);
      return;
    }
    const result = summarizeOutcomeCohort({
      wells,
      pack: activePack,
      maxWells: MAX_COHORT_WELLS,
    });
    if (!result.ok) {
      setError(result.reason);
      setByClass(null);
      return;
    }
    setByClass(result.byClass);
    setTotal(result.total);
    setUnmatched(result.unmatched);
    setSkipped(result.skipped);
  }

  const showPackSelect =
    onPackId !== undefined && packId !== undefined && ids.length > 0;
  const rows =
    byClass !== null
      ? byClass.filter((row) => row.count > 0)
      : [];

  return (
    <section className="mb-4 rounded-md border border-line bg-surface p-4">
      <h2 className="text-xs tracking-widest text-accent uppercase">
        Cohort summary
      </h2>
      <p className="mt-2 text-sm text-muted">
        Map up to {MAX_COHORT_WELLS} current search wells to pack outcomeClassId
        via well→packet (no invented volumes). Counts per class + unmatched.
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
          onClick={onSummarize}
          disabled={wells.length < 1 || activePack === null}
          className="min-h-11 rounded-md border border-line bg-raised px-3 py-2 text-sm text-fg disabled:opacity-50"
        >
          Summarize{" "}
          {wells.length < MAX_COHORT_WELLS ? wells.length : MAX_COHORT_WELLS}{" "}
          well{wells.length === 1 ? "" : "s"}
        </button>
        <span className="font-mono text-xs text-muted">
          {wells.length} in view · cap {MAX_COHORT_WELLS}
        </span>
      </div>

      {error ? (
        <p className="mt-3 text-sm text-accent" role="alert">
          fail-closed — {error}
        </p>
      ) : null}

      {byClass !== null && error === null ? (
        <div className="mt-3">
          <p className="font-mono text-xs text-muted">
            total {total} · unmatched {unmatched} · skipped {skipped}
          </p>
          {rows.length === 0 && unmatched === 0 && skipped === 0 ? (
            <p className="mt-2 font-mono text-sm text-fg">no cohort rows</p>
          ) : rows.length === 0 ? (
            <p className="mt-2 font-mono text-sm text-fg">
              no matched outcome classes
            </p>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[16rem] border-y border-line text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs tracking-wide text-muted uppercase">
                    <th className="py-2 pr-3 font-medium">Class</th>
                    <th className="py-2 pr-3 font-medium">Label</th>
                    <th className="py-2 font-medium">Count</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td className="py-2 pr-3 font-mono text-xs text-fg">
                        {row.id}
                      </td>
                      <td className="py-2 pr-3 text-fg">{row.label}</td>
                      <td className="py-2 font-mono text-accent">{row.count}</td>
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
export function resolveCohortPack(packId: string): DomainPack | null {
  const looked = resolvePack(packId, null);
  if (!looked.ok) return null;
  return looked.pack;
}
