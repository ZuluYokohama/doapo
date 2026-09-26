/**
 * Operator / DUC prioritization UI — ranks current search wells (capped).
 * Measured fields only. No export/import strip (freeze). No invented volumes.
 * Power of 10: bounded render lists, no recursion.
 */
import { useState } from "react";
import {
  DUC_AGE_DAYS_THRESHOLD,
  MAX_PRIORITIZE_OPERATORS,
  MAX_PRIORITIZE_WELLS,
  prioritizeOperators,
  prioritizeWells,
  type PrioritizeMode,
  type PrioritizeOperatorRow,
  type PrioritizeWellRow,
} from "@/lib/packet";
import type { WellRow } from "@/lib/outcomes";

export function PrioritizeStrip({ wells }: { wells: WellRow[] }) {
  const [mode, setMode] = useState<PrioritizeMode>("wells");
  const [wellRows, setWellRows] = useState<PrioritizeWellRow[] | null>(null);
  const [opRows, setOpRows] = useState<PrioritizeOperatorRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [error, setError] = useState<string | null>(null);

  function onRank() {
    setError(null);
    if (wells.length < 1) {
      setError("no wells to rank");
      setWellRows(null);
      setOpRows(null);
      return;
    }
    if (mode === "wells") {
      const result = prioritizeWells({
        wells,
        maxWells: MAX_PRIORITIZE_WELLS,
      });
      if (!result.ok) {
        setError(result.reason);
        setWellRows(null);
        setOpRows(null);
        return;
      }
      setWellRows(result.rows);
      setOpRows(null);
      setTotal(result.total);
      setSkipped(result.skipped);
      return;
    }
    const result = prioritizeOperators({
      wells,
      maxWells: MAX_PRIORITIZE_WELLS,
    });
    if (!result.ok) {
      setError(result.reason);
      setWellRows(null);
      setOpRows(null);
      return;
    }
    setOpRows(result.rows);
    setWellRows(null);
    setTotal(result.total);
    setSkipped(result.skipped);
  }

  function onMode(next: PrioritizeMode) {
    setMode(next);
    setWellRows(null);
    setOpRows(null);
    setError(null);
  }

  const canAct = wells.length >= 1;
  const ranked = wellRows !== null || opRows !== null;

  return (
    <section className="mb-4 rounded-md border border-line bg-surface p-4">
      <h2 className="text-xs tracking-widest text-accent uppercase">
        Operator / DUC prioritization
      </h2>
      <p className="mt-2 text-sm text-muted">
        Rank up to {MAX_PRIORITIZE_WELLS} current search wells by measured
        status and days-since-spud (DUC age threshold {DUC_AGE_DAYS_THRESHOLD}{" "}
        days). Operator rollup caps at {MAX_PRIORITIZE_OPERATORS} rows. No
        invented volumes. Analysis table only — not an export/import freeze
        strip.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onMode("wells")}
          className={
            "min-h-11 rounded-md border px-3 py-2 text-sm " +
            (mode === "wells"
              ? "border-accent bg-accent text-ink"
              : "border-line bg-raised text-fg")
          }
        >
          Wells
        </button>
        <button
          type="button"
          onClick={() => onMode("operators")}
          className={
            "min-h-11 rounded-md border px-3 py-2 text-sm " +
            (mode === "operators"
              ? "border-accent bg-accent text-ink"
              : "border-line bg-raised text-fg")
          }
        >
          Operators
        </button>
        <button
          type="button"
          onClick={onRank}
          disabled={!canAct}
          className="min-h-11 rounded-md border border-line bg-raised px-3 py-2 text-sm text-fg disabled:opacity-50"
        >
          Rank{" "}
          {wells.length < MAX_PRIORITIZE_WELLS
            ? wells.length
            : MAX_PRIORITIZE_WELLS}{" "}
          well{wells.length === 1 ? "" : "s"}
        </button>
        <span className="font-mono text-xs text-muted">
          {wells.length} in view · cap {MAX_PRIORITIZE_WELLS}
        </span>
      </div>

      {error ? (
        <p className="mt-3 text-sm text-accent" role="alert">
          fail-closed — {error}
        </p>
      ) : null}

      {ranked && error === null ? (
        <div className="mt-3">
          <p className="font-mono text-xs text-muted">
            total {total} · skipped {skipped} · mode {mode}
          </p>
          {wellRows !== null ? <WellRankTable rows={wellRows} /> : null}
          {opRows !== null ? <OperatorRankTable rows={opRows} /> : null}
        </div>
      ) : null}
    </section>
  );
}

function WellRankTable({ rows }: { rows: PrioritizeWellRow[] }) {
  if (rows.length === 0) {
    return <p className="mt-2 font-mono text-sm text-fg">no ranked wells</p>;
  }
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full min-w-[28rem] border-y border-line text-left text-sm">
        <thead>
          <tr className="border-b border-line text-xs tracking-wide text-muted uppercase">
            <th className="py-2 pr-3 font-medium">Priority</th>
            <th className="py-2 pr-3 font-medium">Well</th>
            <th className="py-2 pr-3 font-medium">Operator</th>
            <th className="py-2 pr-3 font-medium">County</th>
            <th className="py-2 pr-3 font-medium">Status</th>
            <th className="py-2 pr-3 font-medium">Days</th>
            <th className="py-2 font-medium">Flag</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={row.subjectId}>
              <td className="py-2 pr-3 font-mono text-accent">{row.priority}</td>
              <td className="py-2 pr-3 text-fg">{row.wellLabel}</td>
              <td className="py-2 pr-3 text-fg">{row.operator}</td>
              <td className="py-2 pr-3 font-mono text-xs text-fg">
                {row.county}
              </td>
              <td className="py-2 pr-3 font-mono text-xs text-fg">
                {row.status}
              </td>
              <td className="py-2 pr-3 font-mono text-xs text-fg">
                {row.daysSinceSpud === null ? "—" : row.daysSinceSpud}
              </td>
              <td className="py-2 font-mono text-xs text-muted">
                {row.staleDuc
                  ? "stale-duc"
                  : row.outcomeId === "duc"
                    ? "duc"
                    : row.outcomeId ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OperatorRankTable({ rows }: { rows: PrioritizeOperatorRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="mt-2 font-mono text-sm text-fg">no ranked operators</p>
    );
  }
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full min-w-[28rem] border-y border-line text-left text-sm">
        <thead>
          <tr className="border-b border-line text-xs tracking-wide text-muted uppercase">
            <th className="py-2 pr-3 font-medium">Priority</th>
            <th className="py-2 pr-3 font-medium">Operator</th>
            <th className="py-2 pr-3 font-medium">Wells</th>
            <th className="py-2 pr-3 font-medium">DUC</th>
            <th className="py-2 pr-3 font-medium">Stale</th>
            <th className="py-2 pr-3 font-medium">Sealed</th>
            <th className="py-2 pr-3 font-medium">Max days</th>
            <th className="py-2 font-medium">County</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={row.operator}>
              <td className="py-2 pr-3 font-mono text-accent">{row.priority}</td>
              <td className="py-2 pr-3 text-fg">{row.operator}</td>
              <td className="py-2 pr-3 font-mono text-xs text-fg">
                {row.wellCount}
              </td>
              <td className="py-2 pr-3 font-mono text-xs text-fg">
                {row.ducCount}
              </td>
              <td className="py-2 pr-3 font-mono text-xs text-fg">
                {row.staleDucCount}
              </td>
              <td className="py-2 pr-3 font-mono text-xs text-fg">
                {row.sealedCount}
              </td>
              <td className="py-2 pr-3 font-mono text-xs text-fg">
                {row.maxDaysSinceSpud === null ? "—" : row.maxDaysSinceSpud}
              </td>
              <td className="py-2 font-mono text-xs text-muted">
                {row.countySample}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
