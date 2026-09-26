/**
 * Cross-pack kill audit UI — one packet vs registered packs (+ overlay).
 * Power of 10: bounded render lists, no recursion.
 */
import { useState } from "react";
import {
  MAX_AUDIT_PACKS,
  auditKillsAcrossPacks,
  listKillAuditHits,
  listPacksForAudit,
  type DomainPack,
  type IssuePacket,
  type KillAuditRow,
} from "@/lib/packet";

export function CrossPackKillAuditStrip({
  packet,
  validationOk,
  overlayPack,
}: {
  packet: IssuePacket | null;
  validationOk: boolean;
  overlayPack: DomainPack | null;
}) {
  const [rows, setRows] = useState<KillAuditRow[] | null>(null);
  const [audited, setAudited] = useState(0);
  const [hitCount, setHitCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  if (!packet || !validationOk) {
    return null;
  }
  const current = packet;

  function onAudit() {
    setError(null);
    console.assert(current !== null, "audit packet present");
    const packs = listPacksForAudit(overlayPack);
    const result = auditKillsAcrossPacks({
      packet: current,
      packs,
      overlay: overlayPack,
      maxPacks: MAX_AUDIT_PACKS,
    });
    if (!result.ok) {
      setError(result.reason);
      setRows(null);
      return;
    }
    setRows(result.rows);
    setAudited(result.audited);
    setHitCount(result.hitCount);
  }

  const hits = rows !== null ? listKillAuditHits(rows) : [];
  const showAll = rows !== null && error === null;

  return (
    <section className="mb-4 rounded-md border border-line bg-surface p-4">
      <h2 className="text-xs tracking-widest text-accent uppercase">
        Cross-pack kill audit
      </h2>
      <p className="mt-2 text-sm text-muted">
        Run checkKillConditions for this packet against every registered pack
        (cap {MAX_AUDIT_PACKS}
        {overlayPack ? "; session overlay included" : ""}). Same measured facts;
        pack kill id namespaces may differ.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onAudit}
          className="min-h-11 rounded-md border border-line bg-raised px-3 py-2 text-sm text-fg"
        >
          Audit packs
        </button>
        <span className="font-mono text-xs text-muted">
          subject {current.subjectId} · pack {current.packId}
        </span>
      </div>

      {error ? (
        <p className="mt-3 text-sm text-accent" role="alert">
          fail-closed — {error}
        </p>
      ) : null}

      {showAll ? (
        <div className="mt-3">
          <p className="font-mono text-xs text-muted">
            audited {audited} · hits {hitCount}
          </p>
          {rows.length === 0 ? (
            <p className="mt-2 font-mono text-sm text-fg">no packs</p>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[20rem] border-y border-line text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs tracking-wide text-muted uppercase">
                    <th className="py-2 pr-3 font-medium">Pack</th>
                    <th className="py-2 pr-3 font-medium">Version</th>
                    <th className="py-2 pr-3 font-medium">Hit</th>
                    <th className="py-2 pr-3 font-medium">Kill</th>
                    <th className="py-2 font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((row) => (
                    <tr key={row.packId}>
                      <td className="py-2 pr-3 font-mono text-xs text-fg">
                        {row.packId}
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs text-muted">
                        {row.packVersion}
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs">
                        {row.hit ? (
                          <span className="text-accent">HIT</span>
                        ) : (
                          <span className="text-muted">miss</span>
                        )}
                      </td>
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
          {hits.length > 0 ? (
            <p className="mt-2 font-mono text-xs text-muted">
              {hits.length} pack{hits.length === 1 ? "" : "s"} hit
            </p>
          ) : (
            <p className="mt-2 font-mono text-xs text-muted">no pack hits</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
