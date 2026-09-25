export type OutcomeId =
  | "prespud"
  | "drilling"
  | "sealed"
  | "duc"
  | "producing"
  | "shut"
  | "dry"
  | "plugged"
  | "cancelled";

export const OUTCOMES: {
  id: OutcomeId;
  label: string;
  short: string;
  statuses: string[];
}[] = [
  {
    id: "prespud",
    label: "Permitted, not spud",
    short: "Permit",
    statuses: ["LOC", "LOCR", "PNS"],
  },
  {
    id: "drilling",
    label: "Drilling",
    short: "Drilling",
    statuses: ["DRL"],
  },
  {
    id: "sealed",
    label: "Confidential",
    short: "Sealed",
    statuses: ["Confidential"],
  },
  {
    id: "duc",
    label: "Drilled, not completed",
    short: "DUC",
    statuses: ["NC"],
  },
  {
    id: "producing",
    label: "Active",
    short: "Active",
    statuses: ["A"],
  },
  {
    id: "shut",
    label: "Inactive or temp. abandoned",
    short: "Shut-in",
    statuses: ["IA", "TA", "TAO", "TASC", "TATD"],
  },
  {
    id: "dry",
    label: "Dry hole",
    short: "Dry",
    statuses: ["DRY"],
  },
  {
    id: "plugged",
    label: "Plugged or abandoned",
    short: "Plugged",
    statuses: ["PA", "PANF", "AB"],
  },
  {
    id: "cancelled",
    label: "Expired or cancelled permit",
    short: "Cancelled",
    statuses: ["EXP", "PNC"],
  },
];

const STATUS_TO_OUTCOME = new Map<string, OutcomeId>();
for (const outcome of OUTCOMES) {
  for (const status of outcome.statuses) STATUS_TO_OUTCOME.set(status, outcome.id);
}

export function outcomeOf(status: string | null | undefined): OutcomeId | null {
  if (!status) return null;
  return STATUS_TO_OUTCOME.get(status) ?? null;
}

export function outcomeMeta(id: OutcomeId) {
  return OUTCOMES.find((item) => item.id === id)!;
}

export const WELL_TYPES: Record<string, string> = {
  OG: "Oil & gas",
  SWD: "Saltwater disposal",
  WI: "Water injection",
  GASD: "Gas disposal",
  ST: "Stratigraphic test",
  GASC: "Gas condensate",
  WS: "Water supply",
  CO2I: "CO2 injection",
  AI: "Air injection",
  GI: "Gas injection",
  CO2S: "CO2 storage",
  CBM: "Coalbed methane",
  DF: "Dump flood",
  SFI: "Slurry fracture injection",
  GASN: "Gas, non-associated",
  MWUI: "Monitoring / water",
  AGD: "Acid gas disposal",
  GS: "Gas storage",
  DFP: "Dump flood producer",
  INJP: "Injection",
  NJ: "Non-jurisdiction",
  Confidential: "Confidential",
};

export const STATUS_LABEL: Record<string, string> = {
  A: "Active",
  AB: "Abandoned",
  DRL: "Drilling",
  DRY: "Dry hole",
  EXP: "Expired permit",
  IA: "Inactive",
  LOC: "Location — not spud",
  LOCR: "Location reclaimed",
  NC: "Not completed",
  PA: "Plugged and abandoned",
  PANF: "Plugged, not found",
  PNC: "Permit now cancelled",
  PNS: "Permitted, not started",
  TA: "Temporarily abandoned",
  TAO: "Temp. abandoned, observation",
  TASC: "Temp. abandoned, completion",
  TATD: "Temp. abandoned, drilling",
  Confidential: "Confidential",
  NJ: "Non-jurisdiction",
};

const COUNTY_SPECIAL: Record<string, string> = {
  MCKENZIE: "McKenzie",
  MCHENRY: "McHenry",
  MCLEAN: "McLean",
};

export function titleCounty(raw: string | null | undefined): string {
  if (!raw) return "—";
  const key = raw.trim().toUpperCase();
  if (COUNTY_SPECIAL[key]) return COUNTY_SPECIAL[key];
  return key.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

export function formatApi(raw: string | null | undefined): string {
  if (!raw) return "—";
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10) return raw.trim();
  const state = digits.slice(0, 2);
  const county = digits.slice(2, 5);
  const well = digits.slice(5, 10);
  const sidetrack = digits.length >= 12 ? digits.slice(10, 12) : "";
  return sidetrack ? `${state}-${county}-${well}-${sidetrack}` : `${state}-${county}-${well}`;
}

export function formatSpud(epochMs: number | null | undefined): string {
  if (epochMs == null) return "Not spud";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Chicago",
  }).format(new Date(epochMs));
}

export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

export function typeLabel(code: string | null | undefined): string {
  if (!code) return "—";
  return WELL_TYPES[code] ?? code;
}

export function statusLabel(code: string | null | undefined): string {
  if (!code) return "—";
  return STATUS_LABEL[code] ?? code;
}

export type WellRow = {
  fileNo: number | null;
  api: string | null;
  operator: string | null;
  wellName: string | null;
  td: number | null;
  spud: number | null;
  field: string | null;
  legal: string | null;
  lat: number | null;
  lon: number | null;
  wellType: string | null;
  status: string | null;
  county: string | null;
};

export type PermitRow = {
  api: string | null;
  operator: string | null;
  dayRange: string | null;
  timesRenew: number | null;
  lat: number | null;
  lon: number | null;
  fileNo: number | null;
};

export type StatusCount = { status: string; n: number };
export type CountyStatus = { county: string; status: string; n: number };
export type NamedCount = { name: string; n: number };

export type Snapshot = {
  pulledAt: string;
  totalWells: number;
  statuses: StatusCount[];
  counties: CountyStatus[];
  activeTypes: NamedCount[];
  operators: NamedCount[];
  permitBands: NamedCount[];
  permitTotal: number;
  recent: WellRow[];
  permits: PermitRow[];
};

export type CountyRollup = {
  county: string;
  active: number;
  drilling: number;
  sealed: number;
  duc: number;
  shut: number;
  dry: number;
  plugged: number;
  prespud: number;
  cancelled: number;
  total: number;
};

export function rollupCounties(rows: CountyStatus[]): CountyRollup[] {
  const map = new Map<string, CountyRollup>();
  for (const row of rows) {
    const county = row.county || "UNKNOWN";
    let bucket = map.get(county);
    if (!bucket) {
      bucket = {
        county,
        active: 0,
        drilling: 0,
        sealed: 0,
        duc: 0,
        shut: 0,
        dry: 0,
        plugged: 0,
        prespud: 0,
        cancelled: 0,
        total: 0,
      };
      map.set(county, bucket);
    }
    const id = outcomeOf(row.status);
    const n = row.n;
    bucket.total += n;
    if (id === "producing") bucket.active += n;
    else if (id === "drilling") bucket.drilling += n;
    else if (id === "sealed") bucket.sealed += n;
    else if (id === "duc") bucket.duc += n;
    else if (id === "shut") bucket.shut += n;
    else if (id === "dry") bucket.dry += n;
    else if (id === "plugged") bucket.plugged += n;
    else if (id === "prespud") bucket.prespud += n;
    else if (id === "cancelled") bucket.cancelled += n;
  }
  return [...map.values()].sort((a, b) => b.active - a.active || b.total - a.total);
}

export function countStatuses(statuses: StatusCount[], id: OutcomeId): number {
  const wanted = new Set(outcomeMeta(id).statuses);
  return statuses.reduce((sum, row) => (wanted.has(row.status) ? sum + row.n : sum), 0);
}

export function outcomeSentence(well: WellRow): string {
  const id = outcomeOf(well.status);
  const spud = formatSpud(well.spud);
  const kind = typeLabel(well.wellType);
  if (id === "prespud") {
    return "Permitted. No spud date on the well index, so this location has not been drilled.";
  }
  if (id === "drilling") {
    return `Spud ${spud}. Still drilling — there is no production outcome yet.`;
  }
  if (id === "sealed") {
    return `Spud ${spud}. Confidential. North Dakota can withhold completion and production for up to six months.`;
  }
  if (id === "duc") {
    const depth = well.td ? ` to ${well.td.toLocaleString("en-US")} ft` : "";
    return `Drilled${depth}, not completed. The hole is in the ground. A producing outcome is not.`;
  }
  if (id === "producing" && well.wellType === "OG") {
    return `Active oil and gas. Spud ${spud}. Public status is a producing outcome. Monthly oil, gas, and water are not on this open service.`;
  }
  if (id === "producing") {
    return `Active ${kind.toLowerCase()}. Spud ${spud}. This is not an oil-production outcome.`;
  }
  if (id === "shut") {
    return `Spud ${spud}. ${statusLabel(well.status)} — drilled, not producing today.`;
  }
  if (id === "dry") {
    return `Spud ${spud}. Classified dry hole. No commercial production outcome.`;
  }
  if (id === "plugged") {
    return well.spud
      ? `Spud ${spud}. ${statusLabel(well.status)}. Terminal well.`
      : `${statusLabel(well.status)}. Terminal well, no spud date on the index.`;
  }
  if (id === "cancelled") {
    return well.spud
      ? `${statusLabel(well.status)}. A spud date is on file (${spud}), but this is not an active producer.`
      : `${statusLabel(well.status)}. Never spud on the public index.`;
  }
  return `${statusLabel(well.status)}. ${kind}.`;
}
