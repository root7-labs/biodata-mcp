#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getLicence, upgradeMessage, UPGRADE_URL } from "./license.js";
import { TRIAL_STATUSES } from "./sources/trials.js";
import {
  FREE_ARTICLE_LIMIT,
  PRO_ARTICLE_LIMIT,
  toolEvidencePack,
  toolExportCitations,
  toolGeneDossier,
  toolGetProtein,
  toolGetPubMedArticles,
  toolGetTrial,
  toolLookupGene,
  toolSearchProteins,
  toolSearchPubMed,
  toolSearchTrials,
} from "./tools.js";

export const VERSION = "0.1.0";

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

function ok(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

async function run(fn: () => Promise<string>): Promise<ToolResult> {
  try {
    return ok(await fn());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
  }
}

async function pro(tool: string, fn: () => Promise<string>): Promise<ToolResult> {
  const lic = await getLicence();
  if (!lic.valid) return ok(upgradeMessage(tool, lic.reason));
  return run(fn);
}

const readOnly = { readOnlyHint: true, openWorldHint: true } as const;

export function createServer(): McpServer {
  const server = new McpServer({ name: "biodata-mcp", version: VERSION });

  // ----- Free tools -----
  server.registerTool(
    "search_pubmed",
    {
      title: "Search PubMed",
      description:
        "Search PubMed for biomedical literature. Returns titles, journals, years, PMIDs, DOIs and a study-design tag. Supports PubMed query syntax (e.g. 'metformin AND aging[tiab]').",
      inputSchema: {
        query: z.string().min(2).describe("PubMed query. Field tags like [tiab], [mh], [au] are supported."),
        max_results: z.number().int().min(1).max(50).optional().describe("Default 10."),
        sort: z.enum(["relevance", "pub_date"]).optional().describe("Default relevance."),
        from_year: z.number().int().min(1800).max(2100).optional(),
        to_year: z.number().int().min(1800).max(2100).optional(),
      },
      annotations: readOnly,
    },
    (a) => run(() => toolSearchPubMed(a)),
  );

  server.registerTool(
    "get_pubmed_articles",
    {
      title: "Read PubMed abstracts",
      description: `Fetch full abstracts, MeSH terms and citation details for PubMed IDs. Free tier: up to ${FREE_ARTICLE_LIMIT} per call; Pro: up to ${PRO_ARTICLE_LIMIT}.`,
      inputSchema: {
        pmids: z.array(z.string()).min(1).max(PRO_ARTICLE_LIMIT).describe("PubMed IDs, e.g. ['31234567']."),
      },
      annotations: readOnly,
    },
    (a) => run(async () => toolGetPubMedArticles(a, (await getLicence()).valid)),
  );

  server.registerTool(
    "search_trials",
    {
      title: "Search ClinicalTrials.gov",
      description:
        "Search ClinicalTrials.gov registered studies by free text, condition, intervention, location and recruitment status.",
      inputSchema: {
        query: z.string().optional().describe("Free-text search across all fields."),
        condition: z.string().optional().describe("Disease or condition, e.g. 'type 2 diabetes'."),
        intervention: z.string().optional().describe("Drug, device or procedure, e.g. 'semaglutide'."),
        country: z.string().optional().describe("Location filter, e.g. 'South Africa'."),
        status: z.array(z.enum(TRIAL_STATUSES)).optional().describe("Overall status filter, e.g. ['RECRUITING']."),
        max_results: z.number().int().min(1).max(50).optional().describe("Default 10."),
      },
      annotations: readOnly,
    },
    (a) => run(() => toolSearchTrials(a)),
  );

  server.registerTool(
    "get_trial",
    {
      title: "Get a clinical trial",
      description: "Get full details for one ClinicalTrials.gov study: summary, outcomes, eligibility and locations.",
      inputSchema: { nct_id: z.string().describe("NCT ID, e.g. NCT04368728.") },
      annotations: readOnly,
    },
    (a) => run(() => toolGetTrial(a)),
  );

  server.registerTool(
    "search_proteins",
    {
      title: "Search UniProt",
      description:
        "Search UniProtKB proteins by name, gene or keyword. Defaults to reviewed (Swiss-Prot) entries. Use organism_tax_id 9606 for human.",
      inputSchema: {
        query: z.string().min(1).describe("UniProt query, e.g. 'insulin receptor' or 'gene:TP53'."),
        organism_tax_id: z.number().int().optional().describe("NCBI taxonomy ID, e.g. 9606 human, 10090 mouse."),
        reviewed_only: z.boolean().optional().describe("Default true."),
        max_results: z.number().int().min(1).max(50).optional().describe("Default 10."),
      },
      annotations: readOnly,
    },
    (a) => run(() => toolSearchProteins(a)),
  );

  server.registerTool(
    "get_protein",
    {
      title: "Get a UniProt entry",
      description: "Get function, subcellular location, disease associations, keywords and key cross-references for a UniProt accession.",
      inputSchema: { accession: z.string().describe("UniProt accession, e.g. P38398.") },
      annotations: readOnly,
    },
    (a) => run(() => toolGetProtein(a)),
  );

  server.registerTool(
    "lookup_gene",
    {
      title: "Look up a gene in Ensembl",
      description: "Look up a gene by symbol or Ensembl ID: description, biotype, genomic location and canonical transcript.",
      inputSchema: {
        symbol_or_id: z.string().describe("Gene symbol (BRCA1) or Ensembl gene ID (ENSG00000012048)."),
        species: z.string().optional().describe("Ensembl species name, default homo_sapiens."),
      },
      annotations: readOnly,
    },
    (a) => run(() => toolLookupGene(a)),
  );

  // ----- Pro tools -----
  server.registerTool(
    "evidence_pack",
    {
      title: "Evidence pack (Pro)",
      description:
        "PRO. Build a cited evidence pack on a research question: ranks papers by study design (meta-analyses and RCTs first), extracts conclusions from abstracts, lists related clinical trials and returns numbered references ready to cite.",
      inputSchema: {
        topic: z.string().min(3).describe("Research question or topic, e.g. 'vitamin D supplementation and fracture risk'."),
        max_papers: z.number().int().min(3).max(40).optional().describe("Default 15."),
        high_level_only: z.boolean().optional().describe("Only meta-analyses, systematic reviews, RCTs and guidelines."),
        from_year: z.number().int().min(1800).max(2100).optional(),
        include_trials: z.boolean().optional().describe("Default true."),
      },
      annotations: readOnly,
    },
    (a) => pro("evidence_pack", () => toolEvidencePack(a)),
  );

  server.registerTool(
    "gene_dossier",
    {
      title: "Gene dossier (Pro)",
      description:
        "PRO. One-call cross-database profile of a gene: Ensembl genomic context, reviewed UniProt protein function and disease links, key PubMed papers and related clinical trials.",
      inputSchema: {
        gene: z.string().describe("Gene symbol or Ensembl ID, e.g. EGFR."),
        species: z.string().optional().describe("Ensembl species name, default homo_sapiens."),
        max_papers: z.number().int().min(1).max(20).optional().describe("Default 8."),
      },
      annotations: readOnly,
    },
    (a) => pro("gene_dossier", () => toolGeneDossier(a)),
  );

  server.registerTool(
    "export_citations",
    {
      title: "Export citations (Pro)",
      description: "PRO. Export up to 200 PubMed IDs as RIS (Zotero, EndNote, Mendeley) or BibTeX.",
      inputSchema: {
        pmids: z.array(z.string()).min(1).max(200),
        format: z.enum(["ris", "bibtex"]),
      },
      annotations: readOnly,
    },
    (a) => pro("export_citations", () => toolExportCitations(a)),
  );

  server.registerTool(
    "biodata_status",
    {
      title: "BioData MCP status",
      description: "Show the server version, licence tier and which tools are available.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const lic = await getLicence();
      return ok(
        [
          `BioData MCP v${VERSION}`,
          `Tier: ${lic.valid ? `Pro (${lic.holder ?? "licensed"}${lic.expires ? `, expires ${lic.expires.slice(0, 10)}` : ""})` : "Free"}`,
          lic.note ? `Note: ${lic.note}` : "",
          lic.valid ? "" : `Upgrade: ${UPGRADE_URL}${lic.reason ? ` (${lic.reason})` : ""}`,
          `NCBI API key: ${process.env.NCBI_API_KEY ? "set (10 req/s)" : "not set (3 req/s)"}`,
          "Free: search_pubmed, get_pubmed_articles, search_trials, get_trial, search_proteins, get_protein, lookup_gene",
          "Pro: evidence_pack, gene_dossier, export_citations, get_pubmed_articles up to 50 per call",
        ]
          .filter(Boolean)
          .join("\n"),
      );
    },
  );

  return server;
}

async function main(): Promise<void> {
  const server = createServer();
  await server.connect(new StdioServerTransport());
  console.error(`biodata-mcp v${VERSION} running on stdio`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
