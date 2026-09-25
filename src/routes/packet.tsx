import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { PacketInspector } from "@/components/packet-inspector";
import {
  exampleAgentSelfOpenStop,
  exampleHumanOpenCandidate,
} from "@/lib/packet/fixtures/example-bakken-issue";
import {
  exampleDucAgentSelfOpenStop,
  exampleDucHumanOpenCandidate,
} from "@/lib/packet/fixtures/example-duc-queue-issue";
import {
  BAKKEN_PACK,
  UI_LEDGER_CAP,
  appendSeal,
  buildPacketFromWell,
  createLedger,
  evaluatePacket,
  listPackIds,
  listRecentSeals,
  lookupPack,
  openCandidate,
  proposePacket,
  sealFromPacket,
  tipDigest,
  validateIssuePacket,
  type IssuePacket,
  type SealLedger,
  type SealRecord,
} from "@/lib/packet";
import { searchWells } from "@/lib/ndic.functions";
import {
  formatApi,
  formatSpud,
  outcomeOf,
  outcomeMeta,
  statusLabel,
  titleCounty,
  type WellRow,
} from "@/lib/outcomes";

type PacketSearch = {
  mode?: "fixtures" | "live";
  api?: string;
  pack?: string;
};

export const Route = createFileRoute("/packet")({
  validateSearch: (raw: Record<string, unknown>): PacketSearch => {
    const mode = raw.mode === "live" ? "live" : raw.mode === "fixtures" ? "fixtures" : undefined;
    const api = typeof raw.api === "string" && raw.api.length > 0 && raw.api.length <= 32
      ? raw.api
      : undefined;
    const pack = typeof raw.pack === "string" && raw.pack.length > 0 && raw.pack.length <= 64
      ? raw.pack
      : undefined;
    return { mode, api, pack };
  },
  component: PacketPage,
});

type PageMode = "fixtures" | "live";

type FixtureId =
  | "agent-stop"
  | "human-open"
  | "duc-agent-stop"
  | "duc-human-open"
  | "runtime";

const FIXTURES: { id: FixtureId; label: string; build: () => IssuePacket }[] = [
  {
    id: "agent-stop",
    label: "Bakken — agent self-OPEN (invalid)",
    build: exampleAgentSelfOpenStop,
  },
  {
    id: "human-open",
    label: "Bakken — human OPEN_CANDIDATE",
    build: exampleHumanOpenCandidate,
  },
  {
    id: "duc-agent-stop",
    label: "DUC queue — agent self-OPEN (invalid)",
    build: exampleDucAgentSelfOpenStop,
  },
  {
    id: "duc-human-open",
    label: "DUC queue — human OPEN_CANDIDATE",
    build: exampleDucHumanOpenCandidate,
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

function buildRuntimeDemo(seed: IssuePacket): {
  steps: RuntimeStep[];
  packet: IssuePacket;
  ledger: SealLedger;
} {
  const steps: RuntimeStep[] = [];
  let ledger = createLedger();

  const openAsk = proposePacket({
    packId: seed.packId,
    packVersion: seed.packVersion,
    subjectId: "runtime-agent-open",
    subjectLabel: seed.subjectLabel,
    measuredFacts: seed.measuredFacts,
    outcomeClassId: seed.outcomeClassId,
    designIntent: seed.designIntent,
    fieldObservation: seed.fieldObservation,
    advisorAnswers: [],
    residue: seed.residue,
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

  const proposed = proposePacket({
    packId: seed.packId,
    packVersion: seed.packVersion,
    subjectId: "runtime-propose",
    subjectLabel: seed.subjectLabel,
    measuredFacts: seed.measuredFacts,
    outcomeClassId: seed.outcomeClassId,
    designIntent: seed.designIntent,
    fieldObservation: seed.fieldObservation,
    advisorAnswers: seed.advisorAnswers,
    residue: seed.residue,
    notes: "runtime propose STOP",
    gate: "STOP",
  });
  steps.push({
    label: "2. agent propose STOP (seed fields)",
    ok: proposed.ok,
    detail: proposed.ok
      ? "ok — gate " + proposed.packet.gate + " / " + proposed.packet.proposedBy
      : proposed.reason,
  });
  if (proposed.ok) {
    const tip = tipDigest(ledger);
    const sealed = appendSeal(
      ledger,
      sealFromPacket(
        proposed.packet,
        "propose",
        tip === null ? "" : tip,
        "runtime propose STOP",
      ),
    );
    if (sealed.ok) {
      ledger = sealed.ledger;
    }
  }

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
  if (scored.ok) {
    const tip = tipDigest(ledger);
    const sealed = appendSeal(
      ledger,
      sealFromPacket(
        scored.packet,
        "evaluate",
        tip === null ? "" : tip,
        "verdict " + scored.verdict,
      ),
    );
    if (sealed.ok) {
      ledger = sealed.ledger;
    }
  }

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
  if (humanOpen.ok) {
    const tip = tipDigest(ledger);
    const sealed = appendSeal(
      ledger,
      sealFromPacket(
        humanOpen.packet,
        "open",
        tip === null ? "" : tip,
        "human_open stamp",
      ),
    );
    if (sealed.ok) {
      ledger = sealed.ledger;
    }
  }

  const packet = humanOpen.ok
    ? humanOpen.packet
    : proposed.ok
      ? proposed.packet
      : seed;
  return { steps, packet, ledger };
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

function shortDigest(hex: string): string {
  if (hex.length <= 12) return hex;
  return hex.slice(0, 8) + "…" + hex.slice(hex.length - 4);
}

function LedgerStrip({ ledger }: { ledger: SealLedger }) {
  const tip = tipDigest(ledger);
  const recent: SealRecord[] = listRecentSeals(ledger, UI_LEDGER_CAP);
  return (
    <section className="mb-4 rounded-md border border-line bg-surface p-4">
      <h2 className="text-xs tracking-widest text-accent uppercase">Ledger</h2>
      <p className="mt-2 text-sm text-muted">
        Append-only seal demo in component state (cap {UI_LEDGER_CAP} shown). No
        rewrite / delete. Tip is the chain head digest.
      </p>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted uppercase">Tip</dt>
          <dd className="font-mono text-fg">
            {tip === null ? "—" : shortDigest(tip)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted uppercase">Seals (shown)</dt>
          <dd className="font-mono text-fg">{recent.length}</dd>
        </div>
      </dl>
      {recent.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No seals yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {recent.map((row) => (
            <li
              key={row.id + "-" + row.digest}
              className="rounded-md border border-line bg-raised px-3 py-2 text-sm"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-mono text-fg">{row.kind}</span>
                <span className="text-xs tracking-wide text-muted uppercase">
                  {row.gate}
                </span>
              </div>
              <p className="mt-1 font-mono text-xs text-muted">
                {shortDigest(row.digest)} ←{" "}
                {row.prevDigest.length === 0
                  ? "genesis"
                  : shortDigest(row.prevDigest)}
              </p>
              {row.note.length > 0 ? (
                <p className="mt-1 text-muted">{row.note}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LiveWellPanel({
  packId,
  onPackId,
  selected,
  onSelected,
  draft,
  onDraft,
  results,
  total,
  loading,
  error,
  onSearch,
  buildError,
}: {
  packId: string;
  onPackId: (id: string) => void;
  selected: WellRow | null;
  onSelected: (well: WellRow) => void;
  draft: string;
  onDraft: (value: string) => void;
  results: WellRow[];
  total: number | null;
  loading: boolean;
  error: string | null;
  onSearch: (event: FormEvent) => void;
  buildError: string | null;
}) {
  const packIds = listPackIds();
  return (
    <section className="mb-4 rounded-md border border-line bg-surface p-4">
      <h2 className="text-xs tracking-widest text-accent uppercase">
        Live well
      </h2>
      <p className="mt-2 text-sm text-muted">
        Search the NDIC public well index. Measured facts only — no invented
        oil, gas, or water volumes.
      </p>

      <label className="mt-3 block text-xs tracking-wide text-muted uppercase">
        Domain pack
        <select
          value={packId}
          onChange={(event) => onPackId(event.target.value)}
          className="mt-1 h-11 w-full rounded-md border border-line bg-bg px-3 text-sm text-fg sm:max-w-xs"
        >
          {packIds.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </label>

      <form onSubmit={onSearch} className="mt-3 flex gap-2">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search file number, API, well, or operator</span>
          <input
            value={draft}
            onChange={(event) => onDraft(event.target.value)}
            placeholder="File no., API, well, operator"
            className="h-11 w-full rounded-md border border-line bg-bg px-3 text-sm text-fg placeholder:text-muted"
          />
        </label>
        <button
          type="submit"
          className="h-11 rounded-md bg-accent px-4 text-sm font-medium text-ink"
        >
          Find
        </button>
      </form>

      {error ? (
        <p className="mt-3 text-sm text-accent" role="alert">
          fail-closed — {error}
        </p>
      ) : null}
      {buildError ? (
        <p className="mt-3 text-sm text-accent" role="alert">
          fail-closed — {buildError}
        </p>
      ) : null}

      {loading ? <p className="mt-3 text-xs text-muted">Pulling wells…</p> : null}

      {!loading && results.length === 0 && !error ? (
        <p className="mt-3 text-sm text-muted">
          No well selected. Search and pick a row to build a packet.
        </p>
      ) : null}

      {results.length > 0 ? (
        <>
          <p className="mt-3 font-mono text-xs text-muted">
            {total != null ? `${total} match${total === 1 ? "" : "es"}` : "Results"}
          </p>
          <ul className="mt-2 max-h-64 divide-y divide-line overflow-y-auto border-y border-line">
            {results.map((well) => {
              const on =
                selected?.fileNo === well.fileNo &&
                selected?.api === well.api &&
                selected?.wellName === well.wellName;
              const outcome = outcomeOf(well.status);
              return (
                <li key={`${well.fileNo}-${well.api}-${well.wellName}`}>
                  <button
                    type="button"
                    onClick={() => onSelected(well)}
                    className={
                      "flex w-full min-h-11 flex-col gap-1 py-3 text-left sm:flex-row sm:items-baseline sm:justify-between " +
                      (on ? "bg-raised px-2" : "px-1")
                    }
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-fg">
                        {well.wellName ?? "Unnamed well"}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {formatApi(well.api)} · {well.operator ?? "Unknown"} ·{" "}
                        {titleCounty(well.county)}
                      </span>
                    </span>
                    <span className="shrink-0 text-left sm:text-right">
                      <span className="block font-mono text-xs text-accent">
                        {outcome
                          ? outcomeMeta(outcome).short
                          : statusLabel(well.status)}
                      </span>
                      <span className="block font-mono text-xs text-muted tabular-nums">
                        {formatSpud(well.spud)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </section>
  );
}

function PacketPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const initialMode: PageMode =
    search.mode === "live" || (search.api != null && search.api.length > 0)
      ? "live"
      : "fixtures";

  const [pageMode, setPageMode] = useState<PageMode>(initialMode);
  const [fixtureId, setFixtureId] = useState<FixtureId>("human-open");
  const [packId, setPackId] = useState(
    () => search.pack ?? listPackIds()[0] ?? BAKKEN_PACK.id,
  );
  const [draft, setDraft] = useState(() => search.api ?? "");
  const [query, setQuery] = useState(() => search.api ?? "");
  const [results, setResults] = useState<WellRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [selected, setSelected] = useState<WellRow | null>(null);
  const [runLiveRuntime, setRunLiveRuntime] = useState(false);

  useEffect(() => {
    if (pageMode !== "live") return;
    if (!query.trim()) {
      setResults([]);
      setTotal(null);
      setListError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setListError(null);
    searchWells({ data: { q: query.trim() } })
      .then((result) => {
        if (cancelled) return;
        setResults(result.wells);
        setTotal(result.total);
        if (result.wells.length === 1) {
          setSelected(result.wells[0]);
        } else if (search.api) {
          const digits = search.api.replace(/\D/g, "");
          let i = 0;
          let match: WellRow | null = null;
          while (i < result.wells.length) {
            const apiDigits = (result.wells[i].api ?? "").replace(/\D/g, "");
            if (
              apiDigits === digits ||
              (result.wells[i].api ?? "") === search.api
            ) {
              match = result.wells[i];
              break;
            }
            i += 1;
          }
          if (match) setSelected(match);
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setResults([]);
        setTotal(null);
        setSelected(null);
        setListError(
          error instanceof Error ? error.message : "Search failed",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pageMode, query, search.api]);

  function setMode(next: PageMode) {
    setPageMode(next);
    setRunLiveRuntime(false);
    void navigate({
      search: (prev) => ({
        ...prev,
        mode: next,
        api: next === "live" ? (selected?.api ?? prev.api) : undefined,
        pack: next === "live" ? packId : undefined,
      }),
    });
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    const q = draft.trim();
    setQuery(q);
    setSelected(null);
    setRunLiveRuntime(false);
    void navigate({
      search: (prev) => ({
        ...prev,
        mode: "live",
        api: q || undefined,
        pack: packId,
      }),
    });
  }

  function selectWell(well: WellRow) {
    setSelected(well);
    setRunLiveRuntime(false);
    void navigate({
      search: (prev) => ({
        ...prev,
        mode: "live",
        api: well.api ?? prev.api,
        pack: packId,
      }),
    });
  }

  function changePack(id: string) {
    setPackId(id);
    setRunLiveRuntime(false);
    void navigate({
      search: (prev) => ({
        ...prev,
        mode: "live",
        pack: id,
      }),
    });
  }

  const packLookup = lookupPack(packId);

  const liveBuilt = useMemo(() => {
    if (pageMode !== "live") return null;
    if (!selected) return null;
    const looked = lookupPack(packId);
    if (!looked.ok) {
      return { ok: false as const, reason: looked.reason };
    }
    return buildPacketFromWell({
      well: selected,
      pack: looked.pack,
      proposedBy: "agent_propose",
      gate: "STOP",
    });
  }, [pageMode, selected, packId]);

  const livePacket =
    liveBuilt && liveBuilt.ok ? liveBuilt.packet : null;
  const liveBuildError =
    liveBuilt && !liveBuilt.ok ? liveBuilt.reason : null;

  const fixtureRuntime = useMemo(
    () => buildRuntimeDemo(exampleHumanOpenCandidate()),
    [],
  );

  const liveRuntime = useMemo(() => {
    if (!livePacket || !runLiveRuntime) return null;
    return buildRuntimeDemo(livePacket);
  }, [livePacket, runLiveRuntime]);

  const fixturePacket = useMemo(() => {
    if (fixtureId === "runtime") {
      return fixtureRuntime.packet;
    }
    let i = 0;
    while (i < FIXTURES.length) {
      if (FIXTURES[i].id === fixtureId) {
        return FIXTURES[i].build();
      }
      i += 1;
    }
    return exampleHumanOpenCandidate();
  }, [fixtureId, fixtureRuntime.packet]);

  const packet: IssuePacket | null =
    pageMode === "live"
      ? liveRuntime
        ? liveRuntime.packet
        : livePacket
      : fixturePacket;

  const validation = useMemo(
    () => (packet ? validateIssuePacket(packet) : null),
    [packet],
  );

  const inspectorPackLookup = packet ? lookupPack(packet.packId) : packLookup;

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
            Domain pack + issue packet + validate (gate + residue). Fixtures or
            a live NDIC well row — fail-closed, no invented volumes.
          </p>
        </div>
        <Link
          to="/"
          className="inline-flex h-11 items-center rounded-md border border-line bg-surface px-3 text-sm text-fg"
        >
          Wells home
        </Link>
      </header>

      <section className="mt-4 rounded-md border border-line bg-surface p-3">
        <h2 className="text-xs tracking-widest text-accent uppercase">
          Registered packs
        </h2>
        <p className="mt-2 font-mono text-sm text-fg">
          {listPackIds().join(" · ")}
        </p>
      </section>

      <div
        role="tablist"
        aria-label="Packet source mode"
        className="mt-4 flex flex-wrap gap-2"
      >
        {(
          [
            { id: "fixtures" as const, label: "Fixtures" },
            { id: "live" as const, label: "Live well" },
          ] as const
        ).map((row) => {
          const on = pageMode === row.id;
          return (
            <button
              key={row.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setMode(row.id)}
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

      {pageMode === "fixtures" ? (
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
      ) : (
        <div className="mt-4">
          <LiveWellPanel
            packId={packId}
            onPackId={changePack}
            selected={selected}
            onSelected={selectWell}
            draft={draft}
            onDraft={setDraft}
            results={results}
            total={total}
            loading={loading}
            error={listError}
            onSearch={submitSearch}
            buildError={liveBuildError}
          />
          {livePacket ? (
            <div className="mb-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setRunLiveRuntime(true)}
                className={
                  "min-h-11 rounded-md border px-3 py-2 text-sm " +
                  (runLiveRuntime
                    ? "border-accent bg-accent text-ink"
                    : "border-line bg-surface text-fg")
                }
              >
                Runtime path (propose → evaluate → open)
              </button>
            </div>
          ) : null}
        </div>
      )}

      <div className="mt-4">
        {pageMode === "fixtures" && fixtureId === "runtime" ? (
          <>
            <RuntimePathStrip steps={fixtureRuntime.steps} />
            <LedgerStrip ledger={fixtureRuntime.ledger} />
          </>
        ) : null}
        {pageMode === "live" && liveRuntime ? (
          <>
            <RuntimePathStrip steps={liveRuntime.steps} />
            <LedgerStrip ledger={liveRuntime.ledger} />
          </>
        ) : null}
        {pageMode === "live" && !packet ? (
          <section className="rounded-md border border-line bg-surface p-4">
            <h2 className="text-xs tracking-widest text-accent uppercase">
              Packet
            </h2>
            <p className="mt-3 text-sm text-muted">
              {listError
                ? "Search failed — no packet."
                : liveBuildError
                  ? "Build failed — no packet."
                  : !packLookup.ok
                    ? "Unknown pack — fail-closed."
                    : "Select a live well to inspect a packet."}
            </p>
          </section>
        ) : null}
        {packet && validation ? (
          !inspectorPackLookup.ok ? (
            <section className="rounded-md border border-line bg-surface p-4">
              <h2 className="text-xs tracking-widest text-accent uppercase">
                Pack lookup
              </h2>
              <p className="mt-3 text-sm text-fg">
                <span className="font-mono text-accent">fail-closed</span> —{" "}
                {inspectorPackLookup.reason}
              </p>
            </section>
          ) : (
            <PacketInspector
              pack={inspectorPackLookup.pack}
              packet={packet}
              validation={validation}
            />
          )
        ) : null}
      </div>
    </main>
  );
}
