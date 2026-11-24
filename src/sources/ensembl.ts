// Ensembl REST API (https://rest.ensembl.org).
import { fetchJson, qs } from "../http.js";

const BASE = "https://rest.ensembl.org";

export interface GeneInfo {
  ensemblId: string;
  symbol: string;
  description: string;
  biotype: string;
  species: string;
  location: string;
  assembly: string;
  canonicalTranscript?: string;
  url: string;
}

function toGene(d: any): GeneInfo {
  const strand = d.strand === 1 ? "+" : d.strand === -1 ? "-" : "";
  const species = d.species ?? "";
  return {
    ensemblId: d.id ?? "",
    symbol: d.display_name ?? "",
    description: (d.description ?? "").replace(/\s*\[Source:.*\]$/, ""),
    biotype: d.biotype ?? "",
    species,
    location: d.seq_region_name
      ? `${d.seq_region_name}:${d.start}-${d.end}${strand ? ` (${strand})` : ""}`
      : "",
    assembly: d.assembly_name ?? "",
    canonicalTranscript: d.canonical_transcript,
    url: `https://www.ensembl.org/${species ? species.charAt(0).toUpperCase() + species.slice(1) : "Homo_sapiens"}/Gene/Summary?g=${d.id ?? ""}`,
  };
}

export async function lookupGene(symbolOrId: string, species = "homo_sapiens"): Promise<GeneInfo> {
  const q = symbolOrId.trim();
  const isId = /^ENS[A-Z]*G\d{11}(\.\d+)?$/i.test(q);
  const path = isId
    ? `/lookup/id/${encodeURIComponent(q)}`
    : `/lookup/symbol/${encodeURIComponent(species)}/${encodeURIComponent(q)}`;
  const d = await fetchJson<any>(`${BASE}${path}?${qs({ "content-type": "application/json" })}`);
  return toGene(d);
}
