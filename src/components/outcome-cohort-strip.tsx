/**
 * Outcome cohort summary UI — counts from current well search results (capped).
 * Power of 10: bounded render lists, no recursion.
 * Export JSON downloads a fail-closed freeze artifact (schema + digest).
 * Import paste/file verifies schemaVersion + bundleDigest into inspector view.
 */
import { useState, type ChangeEvent, type FormEvent } from "react";
import {
  MAX_COHORT_JSON_CHARS,
  MAX_COHORT_WELLS,
  cohortFilename,
  exportOutcomeCohort,
  importOutcomeCohort,
  listPackIds,
  resolvePack,
  summarizeOutcomeCohort,
  type CohortClassCount,
  type DomainPack,
} from "@/lib/packet";
import type { WellRow } from "@/lib/outcomes";

function downloadJsonFile(json: string, filename: string): void {
  console.assert(json.length > 0, "download json present");
  console.assert(filename.length > 0, "download name present");
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

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
  const [exportNote, setExportNote] = useState<string | null>(null);
  const [importPaste, setImportPaste] = useState("");
  const [importDigest, setImportDigest] = useState<string | null>(null);

  const ids = packIds ?? listPackIds();
  const activePack = pack;

  function onSummarize() {
    setError(null);
    setExportNote(null);
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

  function onExportJson() {
    setError(null);
    setExportNote(null);
    if (activePack === null) {
      setError("pack required");
      return;
    }
    if (wells.length < 1) {
      setError("no wells to export");
      return;
    }
    const result = exportOutcomeCohort({
      wells,
      pack: activePack,
      maxWells: MAX_COHORT_WELLS,
    });
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    downloadJsonFile(result.json, cohortFilename(activePack.id));
    setByClass(result.bundle.byClass);
    setTotal(result.bundle.total);
    setUnmatched(result.bundle.unmatched);
    setSkipped(result.bundle.skipped);
    setExportNote(
      "exported · digest " + result.bundle.bundleDigest.slice(0, 12) + "…",
    );
    setImportDigest(null);
  }

  function applyImportedBundle(
    bundle: {
      byClass: CohortClassCount[];
      total: number;
      unmatched: number;
      skipped: number;
      bundleDigest: string;
      packId: string;
    },
  ): void {
    console.assert(bundle.bundleDigest.length === 64, "import digest length");
    console.assert(Array.isArray(bundle.byClass), "import byClass array");
    setByClass(bundle.byClass);
    setTotal(bundle.total);
    setUnmatched(bundle.unmatched);
    setSkipped(bundle.skipped);
    setImportDigest(bundle.bundleDigest);
    setExportNote(
      "imported · " +
        bundle.packId +
        " · digest " +
        bundle.bundleDigest.slice(0, 12) +
        "…",
    );
  }

  function onImportText(raw: string): void {
    setError(null);
    setExportNote(null);
    setImportDigest(null);
    const result = importOutcomeCohort(raw);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    applyImportedBundle(result.bundle);
  }

  function onImportFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const input = event.target;
    const files = input.files;
    if (!files || files.length < 1) return;
    const file = files[0];
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === "string" ? reader.result : "";
      onImportText(value);
      input.value = "";
    };
    reader.onerror = () => {
      setError("file read failed");
      input.value = "";
    };
    reader.readAsText(file);
  }

  function onImportPasteSubmit(event: FormEvent): void {
    event.preventDefault();
    onImportText(importPaste);
  }

  const showPackSelect =
    onPackId !== undefined && packId !== undefined && ids.length > 0;
  const rows =
    byClass !== null
      ? byClass.filter((row) => row.count > 0)
      : [];
  const canAct = wells.length >= 1 && activePack !== null;

  return (
    <section className="mb-4 rounded-md border border-line bg-surface p-4">
      <h2 className="text-xs tracking-widest text-accent uppercase">
        Cohort summary
      </h2>
      <p className="mt-2 text-sm text-muted">
        Map up to {MAX_COHORT_WELLS} current search wells to pack outcomeClassId
        via well→packet (no invented volumes). Counts per class + unmatched.
        Export downloads a fail-closed JSON freeze (schemaVersion + digest).
        Import paste/file verifies digest into this inspector view (cap{" "}
        {MAX_COHORT_JSON_CHARS} chars).
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
          disabled={!canAct}
          className="min-h-11 rounded-md border border-line bg-raised px-3 py-2 text-sm text-fg disabled:opacity-50"
        >
          Summarize{" "}
          {wells.length < MAX_COHORT_WELLS ? wells.length : MAX_COHORT_WELLS}{" "}
          well{wells.length === 1 ? "" : "s"}
        </button>
        <button
          type="button"
          onClick={onExportJson}
          disabled={!canAct}
          className="min-h-11 rounded-md border border-line bg-raised px-3 py-2 text-sm text-fg disabled:opacity-50"
        >
          Export JSON
        </button>
        <span className="font-mono text-xs text-muted">
          {wells.length} in view · cap {MAX_COHORT_WELLS}
        </span>
      </div>

      <form onSubmit={onImportPasteSubmit} className="mt-3 space-y-2">
        <label className="block text-xs tracking-wide text-muted uppercase">
          Paste cohort JSON
          <textarea
            value={importPaste}
            onChange={(event) => setImportPaste(event.target.value)}
            rows={3}
            spellCheck={false}
            className="mt-1 w-full rounded-md border border-line bg-bg px-3 py-2 font-mono text-xs text-fg"
            placeholder='{"schemaVersion":"doapo-outcome-cohort/1",…}'
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            className="min-h-11 rounded-md border border-line bg-raised px-3 py-2 text-sm text-fg"
          >
            Import JSON
          </button>
          <label className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-line bg-raised px-3 py-2 text-sm text-fg">
            Load file
            <input
              type="file"
              accept="application/json,.json,text/plain"
              onChange={onImportFileChange}
              className="sr-only"
            />
          </label>
          {importDigest ? (
            <span className="font-mono text-xs text-muted self-center">
              digest {importDigest.slice(0, 12)}…
            </span>
          ) : null}
        </div>
      </form>

      {error ? (
        <p className="mt-3 text-sm text-accent" role="alert">
          fail-closed — {error}
        </p>
      ) : null}

      {exportNote && error === null ? (
        <p className="mt-2 font-mono text-xs text-muted">{exportNote}</p>
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
