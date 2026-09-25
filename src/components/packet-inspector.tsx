/**
 * Read-only UI for domain pack + issue packet + validate result.
 * Power of 10: flat sections, bounded maps via buildInspectorModel, no recursion.
 */
import type { ReactNode } from "react";
import type { DomainPack, IssuePacket, ValidateResult, GateVerdict } from "@/lib/packet";
import { buildInspectorModel } from "./packet-inspector-model";

export type PacketInspectorProps = {
  pack: DomainPack;
  packet: IssuePacket;
  validation: ValidateResult;
};

function gateBadgeClass(gate: GateVerdict): string {
  if (gate === "OPEN_CANDIDATE") {
    return "border-accent bg-accent text-ink";
  }
  if (gate === "STOP") {
    return "border-line bg-raised text-fg";
  }
  if (gate === "RESIDUE") {
    return "border-line bg-surface text-muted";
  }
  return "border-line bg-surface text-muted";
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-md border border-line bg-surface p-4">
      <h2 className="text-xs tracking-widest text-accent uppercase">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <p className="text-sm text-muted">{text}</p>;
}

export function PacketInspector({ pack, packet, validation }: PacketInspectorProps) {
  const model = buildInspectorModel(pack, packet);

  return (
    <div className="space-y-4">
      <Section title="Pack identity">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted uppercase">Id</dt>
            <dd className="font-mono text-fg">{model.packId}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted uppercase">Version</dt>
            <dd className="font-mono text-fg">{model.packVersion}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted uppercase">Title</dt>
            <dd className="text-fg">{model.packTitle}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted uppercase">Substrate</dt>
            <dd className="text-muted">{model.substrate}</dd>
          </div>
        </dl>
      </Section>

      <Section title="Gate">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={
              "inline-flex min-h-11 items-center rounded-md border px-3 font-mono text-sm " +
              gateBadgeClass(model.gate)
            }
          >
            {model.gate}
          </span>
          <p className="text-sm text-muted">
            proposedBy{" "}
            <span className="font-mono text-fg">{model.proposedBy}</span>
          </p>
        </div>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted uppercase">Subject</dt>
            <dd className="text-fg">
              {model.subjectLabel}{" "}
              <span className="font-mono text-muted">({model.subjectId})</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted uppercase">Outcome class</dt>
            <dd className="font-mono text-fg">
              {model.outcomeClassId ?? "—"}
            </dd>
          </div>
        </dl>
      </Section>

      <Section title="Validation">
        {validation.ok ? (
          <p className="text-sm text-fg">
            <span className="font-mono text-accent">ok</span> — packet passes
            validateIssuePacket
          </p>
        ) : (
          <p className="text-sm text-fg">
            <span className="font-mono text-accent">STOP</span> — {validation.reason}
          </p>
        )}
      </Section>

      <Section title="Measured facts">
        {model.facts.length === 0 ? (
          <EmptyNote text="No measured facts on this packet." />
        ) : (
          <ul className="space-y-2">
            {model.facts.map((row) => (
              <li
                key={row.key}
                className="rounded-md border border-line bg-raised px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-mono text-fg">{row.key}</span>
                  <span className="text-xs tracking-wide text-muted uppercase">
                    {row.evidence}
                  </span>
                </div>
                <div className="mt-1 text-fg">{row.value}</div>
                <div className="mt-0.5 text-xs text-muted">{row.sourceLabel}</div>
              </li>
            ))}
          </ul>
        )}
        {model.factsTruncated ? (
          <p className="mt-2 text-xs text-muted">Truncated at MAX_MEASURED_FACTS.</p>
        ) : null}
      </Section>

      <Section title="Design intent / field observation">
        <dl className="grid gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted uppercase">designIntent</dt>
            <dd className="mt-1 text-fg">{model.designIntent ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted uppercase">fieldObservation</dt>
            <dd className="mt-1 text-fg">{model.fieldObservation ?? "—"}</dd>
          </div>
          {model.notes.length > 0 ? (
            <div>
              <dt className="text-xs text-muted uppercase">notes</dt>
              <dd className="mt-1 text-muted">{model.notes}</dd>
            </div>
          ) : null}
        </dl>
      </Section>

      <Section title="Residue">
        {model.residue.length === 0 ? (
          <EmptyNote text="No residue items on this packet." />
        ) : (
          <ul className="space-y-2">
            {model.residue.map((row) => (
              <li
                key={row.id}
                className="rounded-md border border-line bg-raised px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-mono text-fg">{row.id}</span>
                  <span className="text-xs tracking-wide text-muted uppercase">
                    {row.evidence}
                  </span>
                </div>
                <p className="mt-1 text-muted">{row.statement}</p>
              </li>
            ))}
          </ul>
        )}
        {model.residueTruncated ? (
          <p className="mt-2 text-xs text-muted">Truncated at MAX_RESIDUE_ITEMS.</p>
        ) : null}
      </Section>

      <Section title="Kill conditions (from pack)">
        {model.killConditions.length === 0 ? (
          <EmptyNote text="No kill conditions on this pack." />
        ) : (
          <ul className="space-y-2">
            {model.killConditions.map((row) => (
              <li
                key={row.id}
                className="rounded-md border border-line bg-raised px-3 py-2 text-sm"
              >
                <span className="font-mono text-fg">{row.id}</span>
                <p className="mt-1 text-muted">{row.statement}</p>
              </li>
            ))}
          </ul>
        )}
        {model.killsTruncated ? (
          <p className="mt-2 text-xs text-muted">Truncated at MAX_KILL_CONDITIONS.</p>
        ) : null}
      </Section>

      <Section title="Arena benchmarks">
        <p className="mb-2 text-xs text-muted">
          Arena only — not affiliation. Public competitive posture; not employer,
          partner, or controlling SOP.
        </p>
        {model.arenaBenchmarks.length === 0 ? (
          <EmptyNote text="No arena benchmarks on this pack." />
        ) : (
          <ul className="space-y-2">
            {model.arenaBenchmarks.map((row) => (
              <li key={row.url} className="text-sm">
                <a
                  href={row.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent underline-offset-2 hover:underline"
                >
                  {row.label}
                </a>
                <span className="ml-2 text-xs text-muted">
                  arena only — not affiliation · {row.evidence}
                </span>
              </li>
            ))}
          </ul>
        )}
        {model.benchmarksTruncated ? (
          <p className="mt-2 text-xs text-muted">Truncated at MAX_SOURCE_REFS.</p>
        ) : null}
      </Section>
    </div>
  );
}
