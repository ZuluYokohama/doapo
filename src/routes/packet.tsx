import { useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { PacketInspector } from "@/components/packet-inspector";
import {
  exampleAgentSelfOpenStop,
  exampleHumanOpenCandidate,
} from "@/lib/packet/fixtures/example-bakken-issue";
import { lookupPack, validateIssuePacket, type IssuePacket } from "@/lib/packet";

export const Route = createFileRoute("/packet")({
  component: PacketPage,
});

type FixtureId = "agent-stop" | "human-open";

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
];

function PacketPage() {
  const [fixtureId, setFixtureId] = useState<FixtureId>("human-open");

  const packet = useMemo(() => {
    let i = 0;
    while (i < FIXTURES.length) {
      if (FIXTURES[i].id === fixtureId) {
        return FIXTURES[i].build();
      }
      i += 1;
    }
    return exampleHumanOpenCandidate();
  }, [fixtureId]);

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
