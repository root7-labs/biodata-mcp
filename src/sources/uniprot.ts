// UniProt REST API (https://www.uniprot.org/help/api).
import { fetchJson, qs } from "../http.js";

const BASE = "https://rest.uniprot.org/uniprotkb";

export interface ProteinSummary {
  accession: string;
  entryName: string;
  reviewed: boolean;
  proteinName: string;
  genes: string[];
  organism: string;
  length?: number;
  url: string;
}

export interface ProteinDetail extends ProteinSummary {
  function: string[];
  subcellularLocation: string[];
  diseases: { name: string; description: string }[];
  keywords: string[];
  crossRefs: { db: string; id: string }[];
}

function proteinName(e: any): string {
  const d = e?.proteinDescription ?? {};
  return (
    d.recommendedName?.fullName?.value ??
    d.submissionNames?.[0]?.fullName?.value ??
    d.alternativeNames?.[0]?.fullName?.value ??
    ""
  );
}

function toSummary(e: any): ProteinSummary {
  const acc = e?.primaryAccession ?? "";
  return {
    accession: acc,
    entryName: e?.uniProtkbId ?? "",
    reviewed: String(e?.entryType ?? "").toLowerCase().includes("reviewed") &&
      !String(e?.entryType ?? "").toLowerCase().includes("unreviewed"),
    proteinName: proteinName(e),
    genes: (e?.genes ?? []).map((g: any) => g.geneName?.value).filter(Boolean),
    organism: e?.organism?.scientificName ?? "",
    length: e?.sequence?.length,
    url: `https://www.uniprot.org/uniprotkb/${acc}/entry`,
  };
}

export async function searchProteins(opts: {
  query: string;
  organismTaxId?: number;
  reviewedOnly?: boolean;
  max?: number;
}): Promise<ProteinSummary[]> {
  const parts = [`(${opts.query.trim()})`];
  if (opts.organismTaxId) parts.push(`(organism_id:${opts.organismTaxId})`);
  if (opts.reviewedOnly) parts.push("(reviewed:true)");
  const url = `${BASE}/search?${qs({
    query: parts.join(" AND "),
    format: "json",
    size: Math.min(opts.max ?? 10, 50),
    fields: "accession,id,protein_name,gene_names,organism_name,length,reviewed",
  })}`;
  const data = await fetchJson<{ results?: any[] }>(url);
  return (data.results ?? []).map(toSummary);
}

const KEEP_XREFS = new Set(["PDB", "Ensembl", "HGNC", "MIM", "Reactome", "STRING", "AlphaFoldDB", "GeneID"]);

export async function getProtein(accession: string): Promise<ProteinDetail> {
  const acc = accession.trim().toUpperCase();
  if (!/^[A-Z0-9]{6,10}(-\d+)?$/.test(acc)) {
    throw new Error(`"${accession}" does not look like a UniProt accession (e.g. P38398).`);
  }
  const e = await fetchJson<any>(`${BASE}/${acc}.json`);
  const comments: any[] = e?.comments ?? [];
  const texts = (type: string) =>
    comments
      .filter((c) => c.commentType === type)
      .flatMap((c) => (c.texts ?? []).map((t: any) => t.value))
      .filter(Boolean);
  const subcell = comments
    .filter((c) => c.commentType === "SUBCELLULAR LOCATION")
    .flatMap((c) => (c.subcellularLocations ?? []).map((s: any) => s.location?.value))
    .filter(Boolean);
  const diseases = comments
    .filter((c) => c.commentType === "DISEASE" && c.disease)
    .map((c) => ({
      name: c.disease.diseaseId ?? c.disease.acronym ?? "",
      description: c.disease.description ?? "",
    }));
  const xrefs: { db: string; id: string }[] = [];
  const seen = new Map<string, number>();
  for (const x of e?.uniProtKBCrossReferences ?? []) {
    if (!KEEP_XREFS.has(x.database)) continue;
    const n = seen.get(x.database) ?? 0;
    if (n >= 5) continue;
    seen.set(x.database, n + 1);
    xrefs.push({ db: x.database, id: x.id });
  }
  return {
    ...toSummary(e),
    function: texts("FUNCTION"),
    subcellularLocation: [...new Set(subcell)] as string[],
    diseases,
    keywords: (e?.keywords ?? []).map((k: any) => k.name).filter(Boolean),
    crossRefs: xrefs,
  };
}
