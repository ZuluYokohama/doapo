import { useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { PacketInspector } from "@/components/packet-inspector";
import {
  exampleAgentSelfOpenStop,
  exampleHumanOpenCandidate,
} from "@/lib/packet/fixtures/example-bakken-issue";
import {
  BAKKEN_PACK,
  evaluatePacket,
  lookupPack,
  openCandidate,
  proposePacket,
  validateIssuePacket,
  type IssuePacket,
} from "@/lib/packet";

export const Route = createFileRoute("/packet")({
  component: PacketPage,
});

type FixtureId = "agent-stop" | "human-open" | "runtime";

const FIXTURES: { id: FixtureId; label: string; build: () => IssuePacket }[] = [
  {
    id: "agent-stop",
    label: "Agent self-OPEN (invalid / STOP)",
    build: exampleAgentSelfOpenStop,
  },
  {
    id: "human-open",
    label: "Human OPEN_CANDIDATE (valid)",
    build: exampleHumanOpenCandidate,
  },
  {
    id: "runtime",
    label: "Runtime path (propose → evaluate → open)",
    build: exampleHumanOpenCandidate,
  },
];

type RuntimeStep = {
  label: string;
  ok: boolean;
  detail: string;
};

function buildRuntimeDemo(): {
  steps: RuntimeStep[];
  packet: IssuePacket;
} {
  const steps: RuntimeStep[] = [];
  const openAsk = proposePacket({
    packId: BAKKEN_PACK.id,
    packVersion: BAKKEN_PACK.version,
    subjectId: "runtime-agent-open",
    subjectLabel: "Runtime Agent OPEN Ask",
    measuredFacts: [],
    outcomeClassId: null,
    designIntent: null,
    fieldObservation: null,
    advisorAnswers: [],
    residue: [],
    notes: "agent asks OPEN",
    gate: "OPEN_CANDIDATE",
  });
  steps.push({
    label: "1. agent propose OPEN_CANDIDATE",
    ok: openAsk.ok,
    detail: openAsk.ok
      ? "unexpected ok"
      : "fail-closed — " + openAsk.reason,
  });

  const humanSeed = exampleHumanOpenCandidate();
  const proposed = proposePacket({
    packId: humanSeed.packId,
    packVersion: humanSeed.packVersion,
    subjectId: "runtime-propose",
    subjectLabel: humanSeed.subjectLabel,
    measuredFacts: humanSeed.measuredFacts,
    outcomeClassId: humanSeed.outcomeClassId,
    designIntent: humanSeed.designIntent,
    fieldObservation: humanSeed.fieldObservation,
    advisorAnswers: humanSeed.advisorAnswers,
    residue: humanSeed.residue,
    notes: "runtime propose STOP",
    gate: "STOP",
  });
  steps.push({
    label: "2. agent propose STOP (human fixture fields)",
    ok: proposed.ok,
    detail: proposed.ok
      ? "ok — gate " + proposed.packet.gate + " / " + proposed.packet.proposedBy
      : proposed.reason,
  });

  const scored =
    proposed.ok
      ? evaluatePacket(proposed.packet)
      : ({ ok: false, reason: "no packet" } as const);
  steps.push({
    label: "3. evaluate (no OPEN stamp)",
    ok: scored.ok,
    detail: scored.ok
      ? "verdict " +
        scored.verdict +
        " — gate " +
        scored.packet.gate +
        (scored.packet.gate === "OPEN_CANDIDATE" ? " (UNEXPECTED OPEN)" : "")
      : scored.reason,
  });

  const agentOpen =
    scored.ok
      ? openCandidate(scored.packet, "agent_propose")
      : ({ ok: false, reason: "no packet" } as const);
  steps.push({
    label: "4. openCandidate as agent_propose",
    ok: agentOpen.ok,
    detail: agentOpen.ok
      ? "unexpected ok"
      : "fail-closed — " + agentOpen.reason,
  });

  const humanOpen =
    scored.ok
      ? openCandidate(scored.packet, "human_open")
      : ({ ok: false, reason: "no packet" } as const);
  steps.push({
    label: "5. openCandidate as human_open",
    ok: humanOpen.ok,
    detail: humanOpen.ok
      ? "ok — gate " +
        humanOpen.packet.gate +
        " / " +
        humanOpen.packet.proposedBy
      : humanOpen.reason,
  });

  const packet = humanOpen.ok
    ? humanOpen.packet
    : proposed.ok
      ? proposed.packet
      : humanSeed;
  return { steps, packet };
}

function RuntimePathStrip({ steps }: { steps: RuntimeStep[] }) {
  return (
    <section className="mb-4 rounded-md border border-line bg-surface p-4">
      <h2 className="text-xs tracking-widest text-accent uppercase">
        Runtime path
      </h2>
      <p className="mt-2 text-sm text-muted">
        Demo only (no persistence): propose → evaluate → open. Agent path cannot
        reach OPEN_CANDIDATE; only human_open may stamp it.
      </p>
      <ol className="mt-3 space-y-2">
        {steps.map((step) => (
          <li
            key={step.label}
            className="rounded-md border border-line bg-raised px-3 py-2 text-sm"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-mono text-fg">{step.label}</span>
              <span
                className={
                  "text-xs tracking-wide uppercase " +
                  (step.ok ? "text-accent" : "text-muted")
                }
              >
                {step.ok ? "ok" : "fail"}
              </span>
            </div>
            <p className="mt-1 text-muted">{step.detail}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function PacketPage() {
  const [fixtureId, setFixtureId] = useState<FixtureId>("human-open");

  const runtime = useMemo(() => buildRuntimeDemo(), []);

  const packet = useMemo(() => {
    if (fixtureId === "runtime") {
      return runtime.packet;
    }
    let i = 0;
    while (i < FIXTURES.length) {
      if (FIXTURES[i].id === fixtureId) {
        return FIXTURES[i].build();
      }
      i += 1;
    }
    return exampleHumanOpenCandidate();
  }, [fixtureId, runtime.packet]);

  const validation = useMemo(() => validateIssuePacket(packet), [packet]);
  const packLookup = lookupPack(packet.packId);

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-5 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-4">
        <div>
          <p className="text-xs tracking-widest text-accent uppercase">
            Packet platform
          </p>
          <h1 className="mt-1 text-3xl font-medium tracking-wide text-fg">
            Packet inspector
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Read-only view of domain pack + issue packet + validate result (gate +
            residue). Fixtures only — no NDIC loader.
          </p>
        </div>
        <Link
          to="/"
          className="inline-flex h-11 items-center rounded-md border border-line bg-surface px-3 text-sm text-fg"
        >
          Wells home
        </Link>
      </header>

      <div
        role="tablist"
        aria-label="Fixture packets"
        className="mt-4 flex flex-wrap gap-2"
      >
        {FIXTURES.map((row) => {
          const on = row.id === fixtureId;
          return (
            <button
              key={row.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setFixtureId(row.id)}
              className={
                "min-h-11 rounded-md border px-3 py-2 text-left text-sm " +
                (on
                  ? "border-accent bg-accent text-ink"
                  : "border-line bg-surface text-fg")
              }
            >
              {row.label}
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        {fixtureId === "runtime" ? (
          <RuntimePathStrip steps={runtime.steps} />
        ) : null}
        {!packLookup.ok ? (
          <section className="rounded-md border border-line bg-surface p-4">
            <h2 className="text-xs tracking-widest text-accent uppercase">
              Pack lookup
            </h2>
            <p className="mt-3 text-sm text-fg">
              <span className="font-mono text-accent">fail-closed</span> —{" "}
              {packLookup.reason}
            </p>
          </section>
        ) : (
          <PacketInspector
            pack={packLookup.pack}
            packet={packet}
            validation={validation}
          />
        )}
      </div>
    </main>
  );
}
