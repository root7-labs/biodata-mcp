// PubMed via NCBI E-utilities (https://www.ncbi.nlm.nih.gov/books/NBK25501/).
import { fetchJson, fetchText, qs } from "../http.js";

const BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

function commonParams(): Record<string, string | undefined> {
  return {
    tool: "biodata-mcp",
    email: process.env.NCBI_EMAIL,
    api_key: process.env.NCBI_API_KEY,
  };
}

export interface PubMedSummary {
  pmid: string;
  title: string;
  journal: string;
  pubDate: string;
  year: string;
  authors: string[];
  doi?: string;
  pubTypes: string[];
  url: string;
}

export interface PubMedArticle extends PubMedSummary {
  abstract: string;
  meshTerms: string[];
}

export type SortOrder = "relevance" | "pub_date";

export async function searchPubMed(
  query: string,
  opts: { max?: number; sort?: SortOrder; fromYear?: number; toYear?: number } = {},
): Promise<{ total: number; ids: string[] }> {
  let term = query.trim();
  if (opts.fromYear || opts.toYear) {
    const from = opts.fromYear ?? 1800;
    const to = opts.toYear ?? 3000;
    term = `(${term}) AND ${from}:${to}[dp]`;
  }
  const url = `${BASE}/esearch.fcgi?${qs({
    db: "pubmed",
    term,
    retmax: Math.min(opts.max ?? 10, 100),
    sort: opts.sort === "pub_date" ? "pub_date" : "relevance",
    retmode: "json",
    ...commonParams(),
  })}`;
  const data = await fetchJson<{
    esearchresult?: { count?: string; idlist?: string[]; ERROR?: string };
  }>(url);
  const r = data.esearchresult ?? {};
  return { total: Number(r.count ?? 0), ids: r.idlist ?? [] };
}

export async function summarisePubMed(ids: string[]): Promise<PubMedSummary[]> {
  if (ids.length === 0) return [];
  const url = `${BASE}/esummary.fcgi?${qs({
    db: "pubmed",
    id: ids.join(","),
    retmode: "json",
    ...commonParams(),
  })}`;
  const data = await fetchJson<{ result?: Record<string, any> }>(url);
  const result = data.result ?? {};
  const uids: string[] = result.uids ?? ids;
  return uids
    .map((uid) => result[uid])
    .filter((d) => d && !d.error)
    .map((d): PubMedSummary => {
      const doi = (d.articleids ?? []).find((a: any) => a.idtype === "doi")?.value;
      const pubDate: string = d.pubdate ?? "";
      return {
        pmid: String(d.uid),
        title: stripTags(d.title ?? ""),
        journal: d.fulljournalname || d.source || "",
        pubDate,
        year: (pubDate.match(/\d{4}/) ?? [""])[0],
        authors: (d.authors ?? []).map((a: any) => a.name).filter(Boolean),
        doi,
        pubTypes: d.pubtype ?? [],
        url: `https://pubmed.ncbi.nlm.nih.gov/${d.uid}/`,
      };
    });
}

export async function fetchPubMedArticles(ids: string[]): Promise<PubMedArticle[]> {
  if (ids.length === 0) return [];
  const [summaries, xml] = await Promise.all([
    summarisePubMed(ids),
    fetchText(
      `${BASE}/efetch.fcgi?${qs({
        db: "pubmed",
        id: ids.join(","),
        rettype: "abstract",
        retmode: "xml",
        ...commonParams(),
      })}`,
      "application/xml",
    ),
  ]);
  const byPmid = parsePubMedXml(xml);
  return summaries.map((s) => ({
    ...s,
    abstract: byPmid.get(s.pmid)?.abstract ?? "",
    meshTerms: byPmid.get(s.pmid)?.mesh ?? [],
  }));
}

/** Minimal, dependency-free extraction of abstracts and MeSH terms from PubMed XML. */
export function parsePubMedXml(xml: string): Map<string, { abstract: string; mesh: string[] }> {
  const out = new Map<string, { abstract: string; mesh: string[] }>();
  const articles = xml.split(/<PubmedArticle[\s>]/).slice(1);
  for (const art of articles) {
    const pmid = art.match(/<PMID[^>]*>(\d+)<\/PMID>/)?.[1];
    if (!pmid) continue;
    const parts: string[] = [];
    for (const m of art.matchAll(/<AbstractText([^>]*)>([\s\S]*?)<\/AbstractText>/g)) {
      const label = m[1].match(/Label="([^"]+)"/)?.[1];
      const text = decodeEntities(stripTags(m[2])).trim();
      if (text) parts.push(label ? `${label}: ${text}` : text);
    }
    const mesh = [...art.matchAll(/<DescriptorName[^>]*>([\s\S]*?)<\/DescriptorName>/g)].map((m) =>
      decodeEntities(stripTags(m[1])).trim(),
    );
    out.set(pmid, { abstract: parts.join("\n\n"), mesh });
  }
  return out;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

/**
 * Labels a paper by study design using PubMed publication-type tags.
 * This is a design label, NOT a quality appraisal.
 */
export function designLabel(pubTypes: string[]): { label: string; rank: number } {
  const t = pubTypes.map((p) => p.toLowerCase());
  const has = (x: string) => t.some((p) => p.includes(x));
  if (has("meta-analysis")) return { label: "Meta-analysis", rank: 1 };
  if (has("systematic review")) return { label: "Systematic review", rank: 2 };
  if (has("randomized controlled trial")) return { label: "Randomised controlled trial", rank: 3 };
  if (has("clinical trial")) return { label: "Clinical trial (other)", rank: 4 };
  if (has("observational study") || has("comparative study")) return { label: "Observational/comparative", rank: 5 };
  if (has("practice guideline") || has("guideline")) return { label: "Guideline", rank: 2 };
  if (has("review")) return { label: "Narrative review", rank: 6 };
  if (has("case reports")) return { label: "Case report", rank: 7 };
  return { label: "Other / primary research", rank: 6 };
}

export function formatAuthors(authors: string[], max = 3): string {
  if (authors.length === 0) return "";
  if (authors.length <= max) return authors.join(", ");
  return `${authors.slice(0, max).join(", ")} et al.`;
}
