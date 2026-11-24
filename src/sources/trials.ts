// ClinicalTrials.gov API v2 (https://clinicaltrials.gov/data-api/api).
import { fetchJson, qs } from "../http.js";

const BASE = "https://clinicaltrials.gov/api/v2/studies";

export const TRIAL_STATUSES = [
  "RECRUITING",
  "NOT_YET_RECRUITING",
  "ACTIVE_NOT_RECRUITING",
  "ENROLLING_BY_INVITATION",
  "COMPLETED",
  "TERMINATED",
  "WITHDRAWN",
  "SUSPENDED",
] as const;
export type TrialStatus = (typeof TRIAL_STATUSES)[number];

export interface TrialSummary {
  nctId: string;
  title: string;
  status: string;
  phases: string[];
  studyType: string;
  conditions: string[];
  interventions: string[];
  sponsor: string;
  startDate: string;
  enrollment?: number;
  countries: string[];
  hasResults: boolean;
  url: string;
}

export interface TrialDetail extends TrialSummary {
  summary: string;
  eligibility: string;
  minAge?: string;
  maxAge?: string;
  sex?: string;
  primaryOutcomes: string[];
  locations: { facility: string; city: string; country: string }[];
}

function toSummary(study: any): TrialSummary {
  const p = study?.protocolSection ?? {};
  const id = p.identificationModule ?? {};
  const status = p.statusModule ?? {};
  const design = p.designModule ?? {};
  const locs: any[] = p.contactsLocationsModule?.locations ?? [];
  return {
    nctId: id.nctId ?? "",
    title: id.briefTitle ?? id.officialTitle ?? "",
    status: status.overallStatus ?? "",
    phases: design.phases ?? [],
    studyType: design.studyType ?? "",
    conditions: p.conditionsModule?.conditions ?? [],
    interventions: (p.armsInterventionsModule?.interventions ?? []).map((i: any) =>
      i.type ? `${i.name} (${i.type.toLowerCase()})` : i.name,
    ),
    sponsor: p.sponsorCollaboratorsModule?.leadSponsor?.name ?? "",
    startDate: status.startDateStruct?.date ?? "",
    enrollment: design.enrollmentInfo?.count,
    countries: [...new Set(locs.map((l) => l.country).filter(Boolean))] as string[],
    hasResults: Boolean(study?.hasResults),
    url: `https://clinicaltrials.gov/study/${id.nctId ?? ""}`,
  };
}

export async function searchTrials(opts: {
  query?: string;
  condition?: string;
  intervention?: string;
  country?: string;
  statuses?: TrialStatus[];
  max?: number;
}): Promise<{ total?: number; trials: TrialSummary[] }> {
  const url = `${BASE}?${qs({
    "query.term": opts.query,
    "query.cond": opts.condition,
    "query.intr": opts.intervention,
    "query.locn": opts.country,
    "filter.overallStatus": opts.statuses?.length ? opts.statuses.join(",") : undefined,
    pageSize: Math.min(opts.max ?? 10, 50),
    countTotal: "true",
    format: "json",
  })}`;
  const data = await fetchJson<{ studies?: any[]; totalCount?: number }>(url);
  return { total: data.totalCount, trials: (data.studies ?? []).map(toSummary) };
}

export async function getTrial(nctId: string): Promise<TrialDetail> {
  const id = nctId.trim().toUpperCase();
  if (!/^NCT\d{8}$/.test(id)) {
    throw new Error(`"${nctId}" is not a valid NCT ID (expected NCT followed by 8 digits).`);
  }
  const study = await fetchJson<any>(`${BASE}/${id}?${qs({ format: "json" })}`);
  const p = study?.protocolSection ?? {};
  const elig = p.eligibilityModule ?? {};
  return {
    ...toSummary(study),
    summary: p.descriptionModule?.briefSummary ?? "",
    eligibility: elig.eligibilityCriteria ?? "",
    minAge: elig.minimumAge,
    maxAge: elig.maximumAge,
    sex: elig.sex,
    primaryOutcomes: (p.outcomesModule?.primaryOutcomes ?? []).map((o: any) =>
      o.timeFrame ? `${o.measure} (time frame: ${o.timeFrame})` : o.measure,
    ),
    locations: (p.contactsLocationsModule?.locations ?? []).map((l: any) => ({
      facility: l.facility ?? "",
      city: l.city ?? "",
      country: l.country ?? "",
    })),
  };
}
