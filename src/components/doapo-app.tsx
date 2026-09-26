import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { RefreshCw, Search } from "lucide-react";
import { searchWells } from "@/lib/ndic.functions";
import {
  UI_LEDGER_CAP,
  countSealsForSubject,
  listSealsForSubject,
  loadPreferredLedger,
  loadSessionLedger,
  wellSubjectId,
  type SealRecord,
} from "@/lib/packet";
import {
  OUTCOMES,
  countStatuses,
  formatApi,
  formatCount,
  formatSpud,
  outcomeMeta,
  outcomeOf,
  outcomeSentence,
  rollupCounties,
  statusLabel,
  titleCounty,
  typeLabel,
  type OutcomeId,
  type Snapshot,
  type WellRow,
} from "@/lib/outcomes";

const PAGE = 40;

type SearchState = {
  q: string;
  county: string;
  outcome: OutcomeId | "";
  oilGasOnly: boolean;
  offset: number;
};

const EMPTY_SEARCH: SearchState = {
  q: "",
  county: "",
  outcome: "",
  oilGasOnly: false,
  offset: 0,
};

function pulledLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
    timeZoneName: "short",
  }).format(new Date(iso));
}

function ChartTip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value?: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-line bg-surface px-2 py-1 text-xs text-fg">
      <div className="text-muted">{label}</div>
      <div className="font-mono tabular-nums">{formatCount(payload[0]?.value ?? 0)} active</div>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="min-w-0 border-l border-line pl-3">
      <div className="text-xs tracking-wide text-muted uppercase">{label}</div>
      <div className="mt-1 font-mono text-xl tabular-nums text-fg sm:text-2xl">{value}</div>
      <div className="truncate text-xs text-muted">{note}</div>
    </div>
  );
}

export function DoapoApp({
  initial,
  onReload,
}: {
  initial: Snapshot;
  onReload: () => void;
}) {
  const [snap, setSnap] = useState(initial);
  const [filters, setFilters] = useState<SearchState>(EMPTY_SEARCH);
  const [draft, setDraft] = useState("");
  const [register, setRegister] = useState<WellRow[]>(initial.recent);
  const [total, setTotal] = useState<number | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [selected, setSelected] = useState<WellRow | null>(initial.recent[0] ?? null);
  const [usingRecent, setUsingRecent] = useState(true);

  useEffect(() => {
    setSnap(initial);
    setRegister(initial.recent);
    setSelected(initial.recent[0] ?? null);
    setUsingRecent(true);
    setTotal(null);
  }, [initial]);

  const counties = useMemo(() => rollupCounties(snap.counties), [snap.counties]);
  const chartRows = counties.slice(0, 8).map((row) => ({
    county: titleCounty(row.county),
    active: row.active,
  }));
  const activeOg = snap.activeTypes.find((row) => row.name === "OG")?.n ?? 0;
  const activeAll = countStatuses(snap.statuses, "producing");
  const activeService = Math.max(0, activeAll - activeOg);
  const filtered = Boolean(filters.q || filters.county || filters.outcome || filters.oilGasOnly);

  useEffect(() => {
    if (!filtered && filters.offset === 0) {
      setUsingRecent(true);
      setRegister(snap.recent);
      setTotal(null);
      setListError(null);
      return;
    }
    let cancelled = false;
    setLoadingList(true);
    setListError(null);
    searchWells({
      data: {
        q: filters.q || undefined,
        county: filters.county || undefined,
        outcome: filters.outcome || undefined,
        oilGasOnly: filters.oilGasOnly || undefined,
        offset: filters.offset,
      },
    })
      .then((result) => {
        if (cancelled) return;
        setUsingRecent(false);
        setRegister(result.wells);
        setTotal(result.total);
        setSelected(result.wells[0] ?? null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setListError(error instanceof Error ? error.message : "Search failed");
      })
      .finally(() => {
        if (!cancelled) setLoadingList(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filtered, filters, snap.recent]);

  function applyOutcome(id: OutcomeId) {
    setFilters((current) => ({
      ...current,
      outcome: current.outcome === id ? "" : id,
      offset: 0,
    }));
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setFilters((current) => ({ ...current, q: draft.trim(), offset: 0 }));
  }

  const pageStart = filters.offset + 1;
  const pageEnd = filters.offset + register.length;

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-5 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-4">
        <div>
          <p className="text-xs tracking-widest text-accent uppercase">NDIC Oil & Gas Division</p>
          <h1 className="mt-1 text-3xl font-medium tracking-wide text-fg">DOAPO</h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Dakota oil & production outcomes. Permit, spud, and current well status — live from
            the public North Dakota well index.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs text-muted">
            Index pulled
            <span className="mt-0.5 block font-mono text-fg">{pulledLabel(snap.pulledAt)}</span>
          </p>
          <Link
            to="/packet"
            className="inline-flex h-11 items-center rounded-md border border-line bg-surface px-3 text-sm text-muted hover:text-fg"
          >
            Packet
          </Link>
          <button
            type="button"
            onClick={onReload}
            className="inline-flex h-11 items-center gap-2 rounded-md border border-line bg-surface px-3 text-sm text-fg"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Refresh
          </button>
        </div>
      </header>

      <section className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Wells indexed" value={formatCount(snap.totalWells)} note="Every status" />
        <Stat
          label="Active oil & gas"
          value={formatCount(activeOg)}
          note={`${formatCount(activeService)} other active`}
        />
        <Stat
          label="Drilling now"
          value={formatCount(countStatuses(snap.statuses, "drilling"))}
          note={`${formatCount(countStatuses(snap.statuses, "sealed"))} confidential`}
        />
        <Stat
          label="Approved, not spud"
          value={formatCount(snap.permitTotal)}
          note="Current permit book"
        />
      </section>

      <p className="mt-4 text-xs leading-relaxed text-muted">
        Outcome class is the NDIC status code. Monthly oil, gas, and water volumes are not on
        this open service — they live in the monthly production report and the paid well history.
        Confidential wells can hide production for up to six months.
      </p>

      <section className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {OUTCOMES.map((item) => {
          const on = filters.outcome === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={on}
              onClick={() => applyOutcome(item.id)}
              className={
                "min-h-11 rounded-md border px-3 py-2 text-left " +
                (on ? "border-accent bg-accent text-ink" : "border-line bg-surface text-fg")
              }
            >
              <span className="block text-xs tracking-wide uppercase opacity-80">{item.short}</span>
              <span className="mt-1 block font-mono text-lg tabular-nums">
                {formatCount(countStatuses(snap.statuses, item.id))}
              </span>
            </button>
          );
        })}
      </section>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-5">
        <aside className="contents lg:col-span-2 lg:col-start-4 lg:row-start-1 lg:flex lg:flex-col lg:gap-6">
          <div className="order-1 lg:order-none">
            <WellDetail well={selected} />
          </div>
          <div className="order-3 flex flex-col gap-6 lg:order-none">
            <section>
              <h2 className="text-sm font-medium tracking-wide text-fg uppercase">
                Active wells by county
              </h2>
              <p className="mt-1 text-xs text-muted">Status A, all well types. Core of the index.</p>
              <div className="mt-3 h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartRows}
                    layout="vertical"
                    margin={{ left: 4, right: 52, top: 0, bottom: 0 }}
                  >
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="county"
                      width={88}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "var(--color-muted)", fontSize: 12 }}
                    />
                    <Tooltip content={<ChartTip />} cursor={{ fill: "var(--color-raised)" }} />
                    <Bar dataKey="active" fill="var(--color-accent)" barSize={10} radius={[0, 2, 2, 0]}>
                      <LabelList
                        dataKey="active"
                        position="right"
                        fill="var(--color-muted)"
                        fontSize={11}
                        formatter={(value: unknown) => formatCount(Number(value ?? 0))}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section>
              <h2 className="text-sm font-medium tracking-wide text-fg uppercase">
                Active oil & gas operators
              </h2>
              <ol className="mt-3 divide-y divide-line border-y border-line">
                {snap.operators.map((row, index) => (
                  <li key={row.name} className="flex items-baseline justify-between gap-3 py-2">
                    <button
                      type="button"
                      onClick={() => {
                        setDraft(row.name);
                        setFilters({
                          q: row.name,
                          county: "",
                          outcome: "producing",
                          oilGasOnly: true,
                          offset: 0,
                        });
                      }}
                      className="min-h-11 min-w-0 flex-1 truncate text-left text-sm text-fg"
                    >
                      <span className="mr-2 font-mono text-xs text-muted">{index + 1}</span>
                      {row.name}
                    </button>
                    <span className="shrink-0 font-mono text-xs text-muted tabular-nums">
                      {formatCount(row.n)}
                    </span>
                  </li>
                ))}
              </ol>
            </section>

            <section>
              <h2 className="text-sm font-medium tracking-wide text-fg uppercase">
                Permit book, not spud
              </h2>
              <p className="mt-1 text-xs text-muted">
                {formatCount(snap.permitTotal)} approved locations still ahead of the bit. Renewal
                count is how many times NDIC has extended the permit.
              </p>
              <ul className="mt-3 space-y-2">
                {snap.permitBands.map((band) => {
                  const width = snap.permitTotal
                    ? Math.max(4, Math.round((band.n / snap.permitTotal) * 100))
                    : 0;
                  return (
                    <li key={band.name}>
                      <div className="flex justify-between text-xs text-muted">
                        <span>{band.name === "0" ? "Band 0" : `${band.name} days`}</span>
                        <span className="font-mono tabular-nums">{formatCount(band.n)}</span>
                      </div>
                      <div className="mt-1 h-1 bg-raised">
                        <div className="h-1 bg-accent" style={{ width: `${width}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
              <ul className="mt-3 divide-y divide-line border-y border-line">
                {snap.permits.map((permit) => (
                  <li key={`${permit.fileNo}-${permit.api}`}>
                    <button
                      type="button"
                      onClick={() => {
                        const file = permit.fileNo ? String(permit.fileNo) : "";
                        setDraft(file);
                        setFilters({
                          q: file,
                          county: "",
                          outcome: "",
                          oilGasOnly: false,
                          offset: 0,
                        });
                      }}
                      className="flex min-h-11 w-full items-baseline justify-between gap-3 py-2 text-left"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-fg">
                          {permit.operator ?? "Unknown operator"}
                        </span>
                        <span className="block font-mono text-xs text-muted">
                          File {permit.fileNo ?? "—"} · {formatApi(permit.api)}
                        </span>
                      </span>
                      <span className="shrink-0 text-right font-mono text-xs text-muted">
                        {permit.timesRenew ?? 0} renewals
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </aside>

        <section className="order-2 lg:col-span-3 lg:col-start-1 lg:row-start-1 lg:order-none">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-medium tracking-wide text-fg uppercase">Well register</h2>
            <p className="text-xs text-muted">
              {usingRecent
                ? "Latest spuds"
                : total != null
                  ? `${formatCount(total)} match${total === 1 ? "" : "es"}`
                  : "Searching"}
            </p>
          </div>

          <form onSubmit={submitSearch} className="mt-3 flex gap-2">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Search file number, API, well, or operator</span>
              <Search
                className="pointer-events-none absolute top-3 left-3 size-4 text-muted"
                aria-hidden="true"
              />
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="File no., API, well, operator"
                className="h-11 w-full rounded-md border border-line bg-bg pr-3 pl-9 text-sm text-fg placeholder:text-muted"
              />
            </label>
            <button
              type="submit"
              className="h-11 rounded-md bg-accent px-4 text-sm font-medium text-ink"
            >
              Find
            </button>
          </form>

          <div className="mt-2 flex flex-wrap gap-2">
            <label className="min-w-0 flex-1">
              <span className="sr-only">County</span>
              <select
                value={filters.county}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    county: event.target.value,
                    offset: 0,
                  }))
                }
                className="h-11 w-full rounded-md border border-line bg-bg px-3 text-sm text-fg"
              >
                <option value="">All counties</option>
                {counties.map((row) => (
                  <option key={row.county} value={row.county}>
                    {titleCounty(row.county)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              aria-pressed={filters.oilGasOnly}
              onClick={() =>
                setFilters((current) => ({
                  ...current,
                  oilGasOnly: !current.oilGasOnly,
                  offset: 0,
                }))
              }
              className={
                "h-11 rounded-md border px-3 text-sm " +
                (filters.oilGasOnly
                  ? "border-accent bg-accent text-ink"
                  : "border-line bg-surface text-fg")
              }
            >
              Oil & gas only
            </button>
            {filtered ? (
              <button
                type="button"
                onClick={() => {
                  setDraft("");
                  setFilters(EMPTY_SEARCH);
                }}
                className="h-11 rounded-md border border-line px-3 text-sm text-muted"
              >
                Clear
              </button>
            ) : null}
          </div>

          {listError ? (
            <p className="mt-3 text-sm text-accent" role="alert">
              {listError}
            </p>
          ) : null}

          <ul className="mt-3 max-h-96 divide-y divide-line overflow-y-auto border-y border-line">
            {register.length === 0 && !loadingList ? (
              <li className="py-6 text-sm text-muted">No wells match that filter.</li>
            ) : null}
            {register.map((well) => {
              const on = selected?.fileNo === well.fileNo && selected?.wellName === well.wellName;
              const outcome = outcomeOf(well.status);
              return (
                <li key={`${well.fileNo}-${well.api}`}>
                  <button
                    type="button"
                    onClick={() => setSelected(well)}
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
                        {well.operator ?? "Unknown operator"} · {titleCounty(well.county)}
                      </span>
                    </span>
                    <span className="shrink-0 text-left sm:text-right">
                      <span className="block font-mono text-xs text-accent">
                        {outcome ? outcomeMeta(outcome).short : statusLabel(well.status)}
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

          {loadingList ? <p className="mt-2 text-xs text-muted">Pulling wells…</p> : null}

          {!usingRecent && total != null && total > PAGE ? (
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="font-mono text-xs text-muted tabular-nums">
                {pageStart}–{pageEnd} of {formatCount(total)}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={filters.offset === 0 || loadingList}
                  onClick={() =>
                    setFilters((current) => ({
                      ...current,
                      offset: Math.max(0, current.offset - PAGE),
                    }))
                  }
                  className="h-11 rounded-md border border-line px-3 text-sm text-fg disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={filters.offset + PAGE >= total || loadingList}
                  onClick={() =>
                    setFilters((current) => ({ ...current, offset: current.offset + PAGE }))
                  }
                  className="h-11 rounded-md border border-line px-3 text-sm text-fg disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}


function shortDigest(hex: string): string {
  if (hex.length <= 12) return hex;
  return hex.slice(0, 8) + "…" + hex.slice(hex.length - 4);
}

function WellPacketHistory({ well }: { well: WellRow }) {
  const subjectId = wellSubjectId(well);
  const preferred = loadPreferredLedger(loadSessionLedger());
  const count =
    subjectId !== null
      ? countSealsForSubject(preferred.ledger, subjectId)
      : 0;
  const recent: SealRecord[] =
    subjectId !== null
      ? listSealsForSubject(preferred.ledger, subjectId, UI_LEDGER_CAP)
      : [];
  console.assert(recent.length <= UI_LEDGER_CAP, "history within UI cap");
  return (
    <div className="mt-3 rounded-md border border-line bg-raised px-3 py-2">
      <p className="text-xs tracking-widest text-accent uppercase">
        Packet history
      </p>
      <p className="mt-1 font-mono text-xs text-muted">
        Subject{" "}
        {subjectId !== null ? subjectId : "—"} · {count} seal
        {count === 1 ? "" : "s"} ({preferred.source})
      </p>
      {subjectId === null ? (
        <p className="mt-2 text-sm text-muted">
          No subject id (missing API and file no).
        </p>
      ) : recent.length === 0 ? (
        <p className="mt-2 text-sm text-muted">
          No seals for this well yet. Open packet and run the runtime path.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {recent.map((row) => (
            <li key={row.id + "-" + row.digest} className="text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-mono text-fg">{row.kind}</span>
                <span className="text-xs tracking-wide text-muted uppercase">
                  {row.gate}
                </span>
              </div>
              <p className="mt-0.5 font-mono text-xs text-muted">{row.atIso}</p>
              <p className="mt-0.5 font-mono text-xs text-muted">
                {shortDigest(row.digest)}
              </p>
              {row.note.length > 0 ? (
                <p className="mt-0.5 text-muted">{row.note}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function WellDetail({ well }: { well: WellRow | null }) {
  if (!well) {
    return (
      <section className="rounded-md border border-line bg-surface p-4">
        <h2 className="text-sm font-medium text-fg">No well selected</h2>
        <p className="mt-1 text-sm text-muted">Pick a row to read its outcome path.</p>
      </section>
    );
  }
  const id = outcomeOf(well.status);
  const spudded = well.spud != null;
  const steps = [
    { name: "Permit", done: well.fileNo != null, detail: well.fileNo ? `File ${well.fileNo}` : "—" },
    { name: "Spud", done: spudded, detail: formatSpud(well.spud) },
    {
      name: "Outcome",
      done: id != null && id !== "prespud" && id !== "cancelled",
      detail: id ? outcomeMeta(id).short : statusLabel(well.status),
    },
  ];
  return (
    <section className="rounded-md border border-line bg-surface p-4">
      <p className="text-xs tracking-widest text-accent uppercase">
        {id ? outcomeMeta(id).label : statusLabel(well.status)}
      </p>
      <h2 className="mt-1 text-xl font-medium text-fg">{well.wellName ?? "Unnamed well"}</h2>
      <p className="mt-1 text-sm text-muted">{well.operator ?? "Unknown operator"}</p>
      <p className="mt-3 text-sm leading-relaxed text-fg">{outcomeSentence(well)}</p>
      <WellPacketHistory well={well} />
      {well.api ? (
        <p className="mt-3">
          <Link
            to="/packet"
            search={{ mode: "live", api: well.api }}
            className="inline-flex h-11 items-center rounded-md border border-line bg-raised px-3 text-sm text-fg"
          >
            Open packet
          </Link>
        </p>
      ) : null}
      <ol className="mt-4 grid grid-cols-3 gap-2">
        {steps.map((step) => (
          <li
            key={step.name}
            className={"rounded-md border px-2 py-2 " + (step.done ? "border-accent" : "border-line")}
          >
            <span className="block text-xs tracking-wide text-muted uppercase">{step.name}</span>
            <span className="mt-1 block truncate font-mono text-xs text-fg">{step.detail}</span>
          </li>
        ))}
      </ol>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <Fact label="API" value={formatApi(well.api)} mono />
        <Fact label="Status" value={well.status ? `${well.status} · ${statusLabel(well.status)}` : "—"} />
        <Fact label="Type" value={typeLabel(well.wellType)} />
        <Fact label="County" value={titleCounty(well.county)} />
        <Fact label="Field" value={well.field ?? "—"} />
        <Fact label="TD" value={well.td ? `${well.td.toLocaleString("en-US")} ft` : "—"} mono />
        <Fact label="Legal" value={well.legal ?? "—"} />
        <Fact
          label="Surface"
          value={
            well.lat != null && well.lon != null
              ? `${well.lat.toFixed(5)}, ${well.lon.toFixed(5)}`
              : "—"
          }
          mono
        />
      </dl>
    </section>
  );
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs tracking-wide text-muted uppercase">{label}</dt>
      <dd className={"mt-0.5 truncate text-fg " + (mono ? "font-mono text-xs" : "text-sm")}>
        {value}
      </dd>
    </div>
  );
}
