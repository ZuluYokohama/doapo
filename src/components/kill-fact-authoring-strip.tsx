/**
 * Kill fact authoring strip for /packet — toggle kill:<id>=triggered facts.
 * Power of 10: bounded list render, fail-closed over-cap / bad id.
 */
import { useState } from "react";
import {
  KILL_TRIGGER_VALUE,
  MAX_KILL_CONDITIONS,
  MAX_MEASURED_FACTS,
  isKillTriggered,
  killFactKey,
  listKillConditionsForUi,
  setKillTriggered,
  type DomainPack,
  type IssuePacket,
  type KillCondition,
} from "@/lib/packet";

function KillFactRow({
  kill,
  triggered,
  onToggle,
}: {
  kill: KillCondition;
  triggered: boolean;
  onToggle: (killId: string, next: boolean) => string | null;
}) {
  const [localError, setLocalError] = useState<string | null>(null);
  const factKey = killFactKey(kill.id);

  function apply(next: boolean) {
    const err = onToggle(kill.id, next);
    setLocalError(err);
  }

  return (
    <li className="rounded-md border border-line bg-raised px-3 py-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-mono text-fg">{kill.id}</span>
        <span
          className={
            "text-xs tracking-wide uppercase " +
            (triggered ? "text-accent" : "text-muted")
          }
        >
          {triggered ? "triggered" : "clear"}
        </span>
      </div>
      <p className="mt-2 text-muted">{kill.statement}</p>
      <p className="mt-1 font-mono text-xs text-muted">
        fact key {factKey} = {KILL_TRIGGER_VALUE}
      </p>
      <label className="mt-3 inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-fg">
        <input
          type="checkbox"
          checked={triggered}
          onChange={(event) => apply(event.target.checked)}
          className="h-4 w-4"
        />
        Triggered
      </label>
      {localError ? (
        <p className="mt-2 text-sm text-accent" role="alert">
          fail-closed — {localError}
        </p>
      ) : null}
    </li>
  );
}

export function KillFactAuthoringStrip({
  pack,
  packet,
  onPacket,
}: {
  pack: DomainPack;
  packet: IssuePacket;
  onPacket: (next: IssuePacket) => void;
}) {
  const rows = listKillConditionsForUi(pack.killConditions);
  const [stripError, setStripError] = useState<string | null>(null);
  const factCount = packet.measuredFacts.length;

  function applyToggle(killId: string, next: boolean): string | null {
    console.assert(killId.length > 0, "toggle killId");
    const result = setKillTriggered(packet, killId, next);
    if (!result.ok) {
      setStripError(result.reason);
      return result.reason;
    }
    setStripError(null);
    onPacket(result.packet);
    return null;
  }

  return (
    <section className="mb-4 rounded-md border border-line bg-surface p-4">
      <h2 className="text-xs tracking-widest text-accent uppercase">
        Kill fact authoring
      </h2>
      <p className="mt-2 text-sm text-muted">
        Set measured fact {`kill:<id>=${KILL_TRIGGER_VALUE}`} from pack
        killConditions. Feeds kill check / evaluate / audit. Cap{" "}
        {MAX_MEASURED_FACTS} measured facts (from-well builder uses a smaller
        well-fact cap).
      </p>
      <p className="mt-2 font-mono text-xs text-muted">
        {rows.length} / {MAX_KILL_CONDITIONS} kills · {factCount} /{" "}
        {MAX_MEASURED_FACTS} facts
      </p>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No kill conditions on this pack.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {rows.map((row) => (
            <KillFactRow
              key={row.id + "@" + packet.subjectId}
              kill={row}
              triggered={isKillTriggered(packet.measuredFacts, row.id)}
              onToggle={applyToggle}
            />
          ))}
        </ul>
      )}
      {stripError ? (
        <p className="mt-3 text-sm text-accent" role="alert">
          fail-closed — {stripError}
        </p>
      ) : null}
    </section>
  );
}
