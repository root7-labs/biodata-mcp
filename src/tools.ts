// Tool implementations. Each returns Markdown text that the AI client reads and cites.
import {
  designLabel,
  fetchPubMedArticles,
  formatAuthors,
  searchPubMed,
  summarisePubMed,
  type SortOrder,
} from "./sources/pubmed.js";
import { getTrial, searchTrials, type TrialStatus } from "./sources/trials.js";
import { getProtein, searchProteins } from "./sources/uniprot.js";
import { lookupGene } from "./sources/ensembl.js";
import { toBibtex, toRis, truncate } from "./format.js";

export const FREE_ARTICLE_LIMIT = 5;
export const PRO_ARTICLE_LIMIT = 50;

const SPECIES_TAXID: Record<string, number> = {
  homo_sapiens: 9606,
  mus_musculus: 10090,
  rattus_norvegicus: 10116,
  danio_rerio: 7955,
  drosophila_melanogaster: 7227,
  saccharomyces_cerevisiae: 559292,
};

const FOOTER =
  "_Data retrieved live from public databases. Summaries are for research use and are not medical advice._";

// ---------- Free tools ----------

export async function toolSearchPubMed(a: {
  query: string;
  max_results?: number;
  sort?: SortOrder;
  from_year?: number;
  to_year?: number;
}): Promise<string> {
  const { total, ids } = await searchPubMed(a.query, {
    max: a.max_results ?? 10,
    sort: a.sort,
    fromYear: a.from_year,
    toYear: a.to_year,
  });
  if (ids.length === 0) return `No PubMed results for "${a.query}". Try broader terms or remove year filters.`;
  const items = await summarisePubMed(ids);
  const lines = items.map((p, i) => {
    const d = designLabel(p.pubTypes).label;
    return `${i + 1}. **${p.title}** — ${formatAuthors(p.authors)} _${p.journal}_ (${p.year}). Design tag: ${d}. PMID [${p.pmid}](${p.url})${p.doi ? `, DOI ${p.doi}` : ""}`;
  });
  return [
    `### PubMed: "${a.query}"`,
    `Showing ${items.length} of ${total.toLocaleString("en")} matches (${a.sort === "pub_date" ? "newest first" : "by relevance"}).`,
    "",
    ...lines,
    "",
    "Use get_pubmed_articles with these PMIDs to read abstracts.",
  ].join("\n");
}

export async function toolGetPubMedArticles(a: { pmids: string[] }, isPro: boolean): Promise<string> {
  const limit = isPro ? PRO_ARTICLE_LIMIT : FREE_ARTICLE_LIMIT;
  const clean = [...new Set(a.pmids.map((p) => p.trim().replace(/^PMID:?\s*/i, "")))].filter((p) => /^\d{1,9}$/.test(p));
  if (clean.length === 0) return "No valid PMIDs given. PMIDs are numbers such as 31234567.";
  const used = clean.slice(0, limit);
  const arts = await fetchPubMedArticles(used);
  const blocks = arts.map((p) =>
    [
      `#### ${p.title}`,
      `${formatAuthors(p.authors, 6)} — _${p.journal}_, ${p.pubDate}. PMID [${p.pmid}](${p.url})${p.doi ? ` · DOI ${p.doi}` : ""}`,
      `Design tag: ${designLabel(p.pubTypes).label}${p.meshTerms.length ? ` · MeSH: ${p.meshTerms.slice(0, 8).join("; ")}` : ""}`,
      "",
      p.abstract ? p.abstract : "_No abstract available in PubMed._",
    ].join("\n"),
  );
  const note =
    clean.length > used.length
      ? `\n\n> Returned ${used.length} of ${clean.length} requested. ${isPro ? "" : `The free tier reads up to ${FREE_ARTICLE_LIMIT} articles per call; Pro reads up to ${PRO_ARTICLE_LIMIT}.`}`
      : "";
  return blocks.join("\n\n---\n\n") + note + `\n\n${FOOTER}`;
}

export async function toolSearchTrials(a: {
  query?: string;
  condition?: string;
  intervention?: string;
  country?: string;
  status?: TrialStatus[];
  max_results?: number;
}): Promise<string> {
  if (!a.query && !a.condition && !a.intervention) {
    return "Give at least one of: query, condition or intervention.";
  }
  const { total, trials } = await searchTrials({
    query: a.query,
    condition: a.condition,
    intervention: a.intervention,
    country: a.country,
    statuses: a.status,
    max: a.max_results ?? 10,
  });
  if (trials.length === 0) return "No matching trials on ClinicalTrials.gov. Try fewer filters.";
  const lines = trials.map(
    (t, i) =>
      `${i + 1}. **${t.title}** — [${t.nctId}](${t.url}) · ${t.status}${t.phases.length ? ` · ${t.phases.join("/")}` : ""} · ${t.studyType}` +
      `\n   Conditions: ${truncate(t.conditions.join("; "), 160) || "n/a"} · Interventions: ${truncate(t.interventions.join("; "), 160) || "n/a"}` +
      `\n   Sponsor: ${t.sponsor || "n/a"} · Start: ${t.startDate || "n/a"}${t.enrollment ? ` · Enrolment: ${t.enrollment}` : ""}${t.countries.length ? ` · Countries: ${truncate(t.countries.join(", "), 120)}` : ""}${t.hasResults ? " · Results posted" : ""}`,
  );
  return [
    "### ClinicalTrials.gov results",
    total !== undefined ? `Showing ${trials.length} of ${total.toLocaleString("en")} matching studies.` : "",
    "",
    ...lines,
  ]
    .filter((l) => l !== "")
    .join("\n");
}

export async function toolGetTrial(a: { nct_id: string }): Promise<string> {
  const t = await getTrial(a.nct_id);
  const locs = t.locations.slice(0, 15).map((l) => `- ${[l.facility, l.city, l.country].filter(Boolean).join(", ")}`);
  return [
    `### ${t.title}`,
    `[${t.nctId}](${t.url}) · ${t.status}${t.phases.length ? ` · ${t.phases.join("/")}` : ""} · ${t.studyType} · Sponsor: ${t.sponsor || "n/a"}`,
    `Start: ${t.startDate || "n/a"}${t.enrollment ? ` · Enrolment: ${t.enrollment}` : ""}${t.hasResults ? " · Results posted" : ""}`,
    "",
    `**Conditions:** ${t.conditions.join("; ") || "n/a"}`,
    `**Interventions:** ${t.interventions.join("; ") || "n/a"}`,
    "",
    "**Summary**",
    t.summary || "n/a",
    "",
    "**Primary outcomes**",
    ...(t.primaryOutcomes.length ? t.primaryOutcomes.map((o) => `- ${o}`) : ["- n/a"]),
    "",
    `**Eligibility** (age ${t.minAge ?? "n/a"} to ${t.maxAge ?? "n/a"}, sex: ${t.sex ?? "n/a"})`,
    truncate(t.eligibility || "n/a", 4000),
    "",
    `**Locations** (${t.locations.length} total${t.locations.length > 15 ? ", first 15 shown" : ""})`,
    ...(locs.length ? locs : ["- n/a"]),
    "",
    FOOTER,
  ].join("\n");
}

export async function toolSearchProteins(a: {
  query: string;
  organism_tax_id?: number;
  reviewed_only?: boolean;
  max_results?: number;
}): Promise<string> {
  const res = await searchProteins({
    query: a.query,
    organismTaxId: a.organism_tax_id,
    reviewedOnly: a.reviewed_only ?? true,
    max: a.max_results ?? 10,
  });
  if (res.length === 0) return `No UniProt entries for "${a.query}". Try reviewed_only=false or a different organism.`;
  return [
    `### UniProt: "${a.query}"`,
    "",
    ...res.map(
      (p, i) =>
        `${i + 1}. **${p.proteinName || p.entryName}** — [${p.accession}](${p.url}) (${p.entryName}) · Genes: ${p.genes.join(", ") || "n/a"} · ${p.organism}${p.length ? ` · ${p.length} aa` : ""} · ${p.reviewed ? "Reviewed (Swiss-Prot)" : "Unreviewed (TrEMBL)"}`,
    ),
  ].join("\n");
}

export async function toolGetProtein(a: { accession: string }): Promise<string> {
  const p = await getProtein(a.accession);
  return [
    `### ${p.proteinName || p.entryName} (${p.accession})`,
    `[UniProt entry](${p.url}) · ${p.entryName} · Genes: ${p.genes.join(", ") || "n/a"} · ${p.organism}${p.length ? ` · ${p.length} aa` : ""} · ${p.reviewed ? "Reviewed" : "Unreviewed"}`,
    "",
    "**Function**",
    ...(p.function.length ? p.function.map((f) => truncate(f, 1500)) : ["n/a"]),
    "",
    `**Subcellular location:** ${p.subcellularLocation.join("; ") || "n/a"}`,
    "",
    "**Disease associations**",
    ...(p.diseases.length ? p.diseases.map((d) => `- ${d.name}: ${truncate(d.description, 300)}`) : ["- None annotated"]),
    "",
    `**Keywords:** ${p.keywords.slice(0, 20).join(", ") || "n/a"}`,
    `**Cross-references:** ${p.crossRefs.map((x) => `${x.db}:${x.id}`).join(", ") || "n/a"}`,
  ].join("\n");
}

export async function toolLookupGene(a: { symbol_or_id: string; species?: string }): Promise<string> {
  const g = await lookupGene(a.symbol_or_id, a.species ?? "homo_sapiens");
  return [
    `### ${g.symbol} (${g.ensemblId})`,
    `${g.description || "No description"}`,
    `Species: ${g.species} · Biotype: ${g.biotype} · Location: ${g.location || "n/a"} (${g.assembly || "assembly n/a"})`,
    g.canonicalTranscript ? `Canonical transcript: ${g.canonicalTranscript}` : "",
    `[Ensembl gene page](${g.url})`,
  ]
    .filter(Boolean)
    .join("\n");
}

// ---------- Pro tools ----------

const HIGH_LEVEL_FILTER =
  '(meta-analysis[pt] OR systematic review[pt] OR randomized controlled trial[pt] OR practice guideline[pt] OR guideline[pt])';

export async function toolEvidencePack(a: {
  topic: string;
  max_papers?: number;
  high_level_only?: boolean;
  from_year?: number;
  include_trials?: boolean;
}): Promise<string> {
  const max = Math.min(a.max_papers ?? 15, 40);
  const query = a.high_level_only ? `(${a.topic}) AND ${HIGH_LEVEL_FILTER}` : a.topic;
  const [{ total, ids }, trialsRes] = await Promise.all([
    searchPubMed(query, { max, fromYear: a.from_year }),
    a.include_trials === false
      ? Promise.resolve({ total: 0, trials: [] })
      : searchTrials({ query: a.topic, max: 8 }).catch(() => ({ total: undefined, trials: [] })),
  ]);
  const arts = ids.length ? await fetchPubMedArticles(ids) : [];
  const ranked = arts
    .map((p) => ({ p, d: designLabel(p.pubTypes) }))
    .sort((x, y) => x.d.rank - y.d.rank || Number(y.p.year || 0) - Number(x.p.year || 0));

  const counts = new Map<string, number>();
  for (const r of ranked) counts.set(r.d.label, (counts.get(r.d.label) ?? 0) + 1);

  const table = [
    "| # | Study design (PubMed tag) | Year | Title | Ref |",
    "|---|---|---|---|---|",
    ...ranked.map(
      (r, i) => `| ${i + 1} | ${r.d.label} | ${r.p.year || "n/a"} | ${truncate(r.p.title.replace(/\|/g, "/"), 110)} | [${i + 1}] |`,
    ),
  ];

  const keyFindings = ranked.slice(0, 8).map((r, i) => {
    const abs = r.p.abstract;
    const concl =
      abs.match(/(?:CONCLUSIONS?|INTERPRETATION|FINDINGS|RESULTS)[^:]*:\s*([\s\S]+?)(?:\n\n|$)/i)?.[1] ?? abs;
    return `[${i + 1}] ${truncate(concl.replace(/\s+/g, " "), 450) || "_No abstract available._"}`;
  });

  const refs = ranked.map(
    (r, i) =>
      `[${i + 1}] ${formatAuthors(r.p.authors)} ${r.p.title} _${r.p.journal}_. ${r.p.year}.${r.p.doi ? ` doi:${r.p.doi}.` : ""} PMID: ${r.p.pmid}. ${r.p.url}`,
  );

  const trials = trialsRes.trials.map(
    (t) => `- [${t.nctId}](${t.url}) ${t.title} — ${t.status}${t.phases.length ? `, ${t.phases.join("/")}` : ""}${t.sponsor ? `, ${t.sponsor}` : ""}`,
  );

  return [
    `## Evidence pack: ${a.topic}`,
    `PubMed matches: ${total.toLocaleString("en")} · Papers analysed: ${ranked.length}${a.high_level_only ? " (meta-analyses, systematic reviews, RCTs and guidelines only)" : ""}${a.from_year ? ` · From ${a.from_year}` : ""}`,
    `Design mix: ${[...counts.entries()].map(([k, v]) => `${k} ×${v}`).join(", ") || "n/a"}`,
    "",
    "### Evidence map (strongest study designs first)",
    ...table,
    "",
    "### Key findings from abstracts (verbatim excerpts, for synthesis)",
    ...keyFindings,
    "",
    ...(a.include_trials === false
      ? []
      : ["### Related clinical trials", ...(trials.length ? trials : ["- None found"]), ""]),
    "### References",
    ...refs,
    "",
    "> Design labels come from PubMed publication-type tags. They describe study design only and are not a quality or risk-of-bias appraisal.",
    FOOTER,
  ].join("\n");
}

export async function toolGeneDossier(a: { gene: string; species?: string; max_papers?: number }): Promise<string> {
  const species = a.species ?? "homo_sapiens";
  const taxId = SPECIES_TAXID[species];
  const gene = await lookupGene(a.gene, species);
  const symbol = gene.symbol || a.gene;
  const [proteins, papers, trials] = await Promise.all([
    searchProteins({ query: `gene_exact:${symbol}`, organismTaxId: taxId, reviewedOnly: true, max: 3 }).catch(() => []),
    searchPubMed(`${symbol}[tiab]${species === "homo_sapiens" ? " AND humans[mh]" : ""}`, {
      max: Math.min(a.max_papers ?? 8, 20),
      sort: "relevance",
    }).then((r) => summarisePubMed(r.ids)).catch(() => []),
    species === "homo_sapiens"
      ? searchTrials({ query: symbol, max: 5 }).then((r) => r.trials).catch(() => [])
      : Promise.resolve([]),
  ]);
  const protein = proteins[0] ? await getProtein(proteins[0].accession).catch(() => undefined) : undefined;

  return [
    `## Gene dossier: ${symbol}`,
    "",
    "### Genomic context (Ensembl)",
    `${gene.description || "n/a"} · ${gene.ensemblId} · ${gene.biotype} · ${gene.location} (${gene.assembly}) · [Ensembl](${gene.url})`,
    "",
    "### Protein (UniProt, reviewed)",
    protein
      ? [
          `**${protein.proteinName}** — [${protein.accession}](${protein.url}) · ${protein.length ?? "?"} aa`,
          `Function: ${truncate(protein.function.join(" "), 900) || "n/a"}`,
          `Location: ${protein.subcellularLocation.join("; ") || "n/a"}`,
          `Diseases: ${protein.diseases.map((d) => d.name).join("; ") || "none annotated"}`,
          `Cross-refs: ${protein.crossRefs.map((x) => `${x.db}:${x.id}`).join(", ") || "n/a"}`,
        ].join("\n")
      : "No reviewed UniProt entry found.",
    "",
    "### Key literature (PubMed)",
    ...(papers.length
      ? papers.map((p, i) => `${i + 1}. ${p.title} — _${p.journal}_ (${p.year}). [PMID ${p.pmid}](${p.url})`)
      : ["None found"]),
    "",
    ...(species === "homo_sapiens"
      ? [
          "### Clinical trials mentioning this gene",
          ...(trials.length ? trials.map((t) => `- [${t.nctId}](${t.url}) ${t.title} — ${t.status}`) : ["- None found"]),
          "",
        ]
      : []),
    FOOTER,
  ].join("\n");
}

export async function toolExportCitations(a: { pmids: string[]; format: "ris" | "bibtex" }): Promise<string> {
  const clean = [...new Set(a.pmids.map((p) => p.trim().replace(/^PMID:?\s*/i, "")))].filter((p) => /^\d{1,9}$/.test(p));
  if (clean.length === 0) return "No valid PMIDs given.";
  const items: Awaited<ReturnType<typeof summarisePubMed>> = [];
  for (let i = 0; i < Math.min(clean.length, 200); i += 100) {
    items.push(...(await summarisePubMed(clean.slice(i, i + 100))));
  }
  const body = a.format === "bibtex" ? toBibtex(items) : toRis(items);
  return [
    `${items.length} citation(s) in ${a.format === "bibtex" ? "BibTeX" : "RIS"} format${clean.length > 200 ? " (first 200 only)" : ""}. Save as a .${a.format === "bibtex" ? "bib" : "ris"} file to import into Zotero, EndNote or Mendeley.`,
    "",
    "```" + (a.format === "bibtex" ? "bibtex" : ""),
    body,
    "```",
  ].join("\n");
}
