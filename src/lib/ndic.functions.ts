import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  OUTCOMES,
  type NamedCount,
  type OutcomeId,
  type PermitRow,
  type Snapshot,
  type WellRow,
} from "@/lib/outcomes";

const BASE = "https://gis.dmr.nd.gov/dmrpublicservices/rest/services";
const TTL_MS = 10 * 60 * 1000;

type ArcFeature = { attributes: Record<string, unknown> };

let snapshotCache: { at: number; data: Snapshot } | null = null;

async function arc(
  service: string,
  params: Record<string, string>,
): Promise<{ features?: ArcFeature[]; count?: number; error?: { message?: string } }> {
  const url = new URL(`${BASE}/${service}/FeatureServer/0/query`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("f", "json");
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "DOAPO/1.0" },
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error(`NDIC GIS returned ${response.status}`);
  const data = (await response.json()) as {
    features?: ArcFeature[];
    count?: number;
    error?: { message?: string };
  };
  if (data.error) throw new Error(data.error.message || "NDIC GIS rejected the query");
  return data;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function wellFrom(attributes: Record<string, unknown>): WellRow {
  const qq = str(attributes.qq);
  const sec = num(attributes.sec);
  const twp = num(attributes.twp);
  const rng = num(attributes.rng);
  const parts = [
    qq,
    sec != null ? `Sec ${sec}` : null,
    twp != null ? `T${twp}` : null,
    rng != null ? `R${rng}` : null,
  ].filter(Boolean);
  const api = str(attributes.api_no) ?? str(attributes.api);
  return {
    fileNo: num(attributes.fileno),
    api,
    operator: str(attributes.operator),
    wellName: str(attributes.well_name),
    td: num(attributes.td),
    spud: num(attributes.spud_date),
    field: str(attributes.field_name),
    legal: parts.length ? parts.join(" ") : null,
    lat: num(attributes.latitude),
    lon: num(attributes.longitude),
    wellType: str(attributes.well_type),
    status: str(attributes.status),
    county: str(attributes.County),
  };
}

function permitFrom(attributes: Record<string, unknown>): PermitRow {
  return {
    api: str(attributes.Api),
    operator: str(attributes.Operator),
    dayRange: str(attributes.DayRange),
    timesRenew: num(attributes.TimesRenew),
    lat: num(attributes.Lat),
    lon: num(attributes.Lon),
    fileNo: num(attributes.FileNo),
  };
}

const WELL_FIELDS =
  "fileno,api_no,api,operator,well_name,td,spud_date,field_name,qq,sec,twp,rng,latitude,longitude,well_type,status,County";

const STAT = JSON.stringify([
  { statisticType: "count", onStatisticField: "fileno", outStatisticFieldName: "n" },
]);

async function loadSnapshot(): Promise<Snapshot> {
  if (snapshotCache && Date.now() - snapshotCache.at < TTL_MS) return snapshotCache.data;

  const [statusRes, countyRes, typeRes, operatorRes, bandRes, permitCount, recentRes, permitRes] =
    await Promise.all([
      arc("Wells", {
        where: "1=1",
        outStatistics: STAT,
        groupByFieldsForStatistics: "status",
        returnGeometry: "false",
      }),
      arc("Wells", {
        where: "1=1",
        outStatistics: STAT,
        groupByFieldsForStatistics: "County,status",
        returnGeometry: "false",
      }),
      arc("Wells", {
        where: "status='A'",
        outStatistics: STAT,
        groupByFieldsForStatistics: "well_type",
        returnGeometry: "false",
      }),
      arc("Wells", {
        where: "status='A' AND well_type='OG'",
        outStatistics: STAT,
        groupByFieldsForStatistics: "operator",
        returnGeometry: "false",
      }),
      arc("PermitStatusBeforeSpud", {
        where: "1=1",
        outStatistics: JSON.stringify([
          { statisticType: "count", onStatisticField: "FileNo", outStatisticFieldName: "n" },
        ]),
        groupByFieldsForStatistics: "DayRange",
        returnGeometry: "false",
      }),
      arc("PermitStatusBeforeSpud", { where: "1=1", returnCountOnly: "true" }),
      arc("Wells", {
        where: "spud_date IS NOT NULL",
        outFields: WELL_FIELDS,
        orderByFields: "spud_date DESC",
        resultRecordCount: "24",
        returnGeometry: "false",
      }),
      arc("PermitStatusBeforeSpud", {
        where: "1=1",
        outFields: "Api,Operator,DayRange,TimesRenew,Lat,Lon,FileNo",
        orderByFields: "TimesRenew ASC,FileNo DESC",
        resultRecordCount: "12",
        returnGeometry: "false",
      }),
    ]);

  const statuses = (statusRes.features ?? []).map((feature) => ({
    status: str(feature.attributes.status) ?? "—",
    n: num(feature.attributes.n) ?? 0,
  }));
  const counties = (countyRes.features ?? []).map((feature) => ({
    county: str(feature.attributes.County) ?? "UNKNOWN",
    status: str(feature.attributes.status) ?? "—",
    n: num(feature.attributes.n) ?? 0,
  }));
  const activeTypes: NamedCount[] = (typeRes.features ?? [])
    .map((feature) => ({
      name: str(feature.attributes.well_type) ?? "—",
      n: num(feature.attributes.n) ?? 0,
    }))
    .sort((a, b) => b.n - a.n);
  const operators: NamedCount[] = (operatorRes.features ?? [])
    .map((feature) => ({
      name: str(feature.attributes.operator) ?? "Unknown operator",
      n: num(feature.attributes.n) ?? 0,
    }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 8);
  const permitBands: NamedCount[] = (bandRes.features ?? [])
    .map((feature) => ({
      name: str(feature.attributes.DayRange) ?? "—",
      n: num(feature.attributes.n) ?? 0,
    }))
    .sort((a, b) => b.n - a.n);

  const data: Snapshot = {
    pulledAt: new Date().toISOString(),
    totalWells: statuses.reduce((sum, row) => sum + row.n, 0),
    statuses,
    counties,
    activeTypes,
    operators,
    permitBands,
    permitTotal: permitCount.count ?? permitBands.reduce((sum, row) => sum + row.n, 0),
    recent: (recentRes.features ?? []).map((feature) => wellFrom(feature.attributes)),
    permits: (permitRes.features ?? []).map((feature) => permitFrom(feature.attributes)),
  };
  snapshotCache = { at: Date.now(), data };
  return data;
}

const OUTCOME_IDS = OUTCOMES.map((item) => item.id) as [OutcomeId, ...OutcomeId[]];

const SearchInput = z.object({
  q: z.string().max(80).optional(),
  county: z.string().max(40).optional(),
  outcome: z.enum(OUTCOME_IDS).optional(),
  oilGasOnly: z.boolean().optional(),
  offset: z.number().int().min(0).max(20000).optional(),
});

function sqlText(value: string): string {
  return value.replace(/'/g, "''").replace(/[%_]/g, "");
}

function buildWhere(input: z.infer<typeof SearchInput>): string {
  const parts = ["1=1"];
  const county = (input.county ?? "").trim().toUpperCase();
  if (county && /^[A-Z][A-Z .'-]{0,30}$/.test(county)) {
    parts.push(`County='${sqlText(county)}'`);
  }
  if (input.outcome) {
    const statuses = OUTCOMES.find((item) => item.id === input.outcome)!.statuses;
    parts.push(`status IN (${statuses.map((status) => `'${status}'`).join(",")})`);
  }
  if (input.oilGasOnly) parts.push("well_type='OG'");
  const query = (input.q ?? "").trim();
  if (query) {
    if (/^\d{1,7}$/.test(query)) {
      parts.push(`fileno=${Number(query)}`);
    } else if (/^[\d\- ]+$/.test(query)) {
      const digits = query.replace(/\D/g, "").slice(0, 14);
      if (digits.length >= 5) parts.push(`(api_no LIKE '%${digits}%' OR api LIKE '%${digits}%')`);
    } else {
      const text = sqlText(query.toUpperCase()).slice(0, 60);
      if (text) {
        parts.push(`(UPPER(well_name) LIKE '%${text}%' OR UPPER(operator) LIKE '%${text}%')`);
      }
    }
  }
  return parts.join(" AND ");
}

export const getSnapshot = createServerFn({ method: "GET" }).handler(async () => loadSnapshot());

export const refreshSnapshot = createServerFn({ method: "POST" }).handler(async () => {
  snapshotCache = null;
  return loadSnapshot();
});

export const searchWells = createServerFn({ method: "GET" })
  .validator((input: unknown) => SearchInput.parse(input))
  .handler(async ({ data }) => {
    const where = buildWhere(data);
    const offset = data.offset ?? 0;
    const numeric = /^\d{1,7}$/.test((data.q ?? "").trim());
    const orderByFields = numeric || !(data.q ?? "").trim() ? "spud_date DESC" : "well_name ASC";
    const [countRes, listRes] = await Promise.all([
      arc("Wells", { where, returnCountOnly: "true" }),
      arc("Wells", {
        where,
        outFields: WELL_FIELDS,
        orderByFields,
        resultRecordCount: "40",
        resultOffset: String(offset),
        returnGeometry: "false",
      }),
    ]);
    const wells = (listRes.features ?? []).map((feature) => wellFrom(feature.attributes));
    return {
      total: countRes.count ?? wells.length,
      wells,
    };
  });
