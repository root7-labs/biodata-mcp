# BioData MCP

**Cited biomedical research inside your AI assistant. Every answer traces back to a PMID, NCT ID or database accession.**

BioData MCP is a [Model Context Protocol](https://modelcontextprotocol.io) server for Claude Desktop, Cursor and other MCP clients. It connects your assistant to PubMed, ClinicalTrials.gov, UniProt and Ensembl, for biotech and pharma analysts, medical writers, researchers and students who need answers they can cite.

- **Four databases, one install.** Literature, registered trials, proteins and genes.
- **Evidence ordered by study design.** Meta-analyses and randomised trials appear before case reports.
- **Citations ready to use.** Numbered references, DOIs, and RIS or BibTeX export for Zotero, EndNote and Mendeley.
- **No account needed for the free tools.** Data is read live from the public databases.

## Tools

| Tool | Tier | What it does |
|---|---|---|
| `search_pubmed` | Free | Search PubMed (full query syntax, year filters, newest-first sort) |
| `get_pubmed_articles` | Free (5/call) · Pro (50/call) | Abstracts, MeSH terms and citation details |
| `search_trials` | Free | ClinicalTrials.gov by condition, intervention, country and status |
| `get_trial` | Free | Full trial record: outcomes, eligibility, locations |
| `search_proteins` | Free | UniProtKB search (reviewed entries by default) |
| `get_protein` | Free | Function, location, disease links, cross-references |
| `lookup_gene` | Free | Ensembl gene location, biotype, canonical transcript |
| `evidence_pack` | **Pro** | Cited evidence pack: papers ranked by study design, key findings, related trials, numbered references |
| `gene_dossier` | **Pro** | One-call gene profile across Ensembl, UniProt, PubMed and ClinicalTrials.gov |
| `export_citations` | **Pro** | Up to 200 PMIDs as RIS or BibTeX |
| `biodata_status` | Free | Shows your tier and settings |

## Install

Requires [Node.js](https://nodejs.org) 18.17 or newer.

### Claude Desktop

Open **Settings → Developer → Edit Config** and add:

```json
{
  "mcpServers": {
    "biodata": {
      "command": "npx",
      "args": ["-y", "biodata-mcp"],
      "env": {
        "NCBI_EMAIL": "you@example.com",
        "BIODATA_LICENSE_KEY": ""
      }
    }
  }
}
```

Restart Claude Desktop. You should see the BioData tools in the tools menu.

### Cursor and other MCP clients

Use the same `command`, `args` and `env` in your client's MCP configuration (for Cursor: `.cursor/mcp.json`).

### Settings

| Variable | Required | Purpose |
|---|---|---|
| `NCBI_EMAIL` | Recommended | NCBI asks API users to identify themselves |
| `NCBI_API_KEY` | Optional | Raises the PubMed rate limit from 3 to 10 requests/second. Free from your NCBI account settings |
| `BIODATA_LICENSE_KEY` | For Pro | Unlocks Pro tools |

## Try these prompts

- "Build an evidence pack on SGLT2 inhibitors and heart failure hospitalisation since 2018, high-level evidence only."
- "Give me a gene dossier for PCSK9 and summarise what is in trials right now."
- "Find recruiting phase 3 trials for tuberculosis in South Africa and compare their primary outcomes."
- "Read the abstracts for these PMIDs and tell me where they disagree: …"
- "Export the references from that evidence pack as BibTeX."

## Pro

Pro unlocks `evidence_pack`, `gene_dossier`, `export_citations` and 50-article batch reads.

**$99 a year or $12 a month.** Founding offer: use the code `FOUNDING` for 50% off your first year (first 20 buyers).

1. Buy Pro at **[buy.polar.sh](https://buy.polar.sh/polar_cl_izX9bcMQvKqrvU4t66u2P4pp07GycLlSpQoSq45gkOW)**. Your licence key appears on the confirmation page and in your Polar customer portal.
2. Paste it as the value of `BIODATA_LICENSE_KEY` in your MCP client config.
3. Restart the client and ask it to run `biodata_status` to confirm.

The key is checked with Polar, our payment provider, about once every six hours. Only the key is sent, never your queries.

## Good to know

- **Research use only.** Outputs summarise public records and are not medical advice. Always check the primary source before relying on a finding.
- **Study-design labels are not quality grades.** They come from PubMed publication-type tags and do not assess risk of bias.
- **Data sources and their terms.** Data comes from NCBI E-utilities, ClinicalTrials.gov, UniProt and Ensembl, each under its own terms of use. This product is not affiliated with or endorsed by any of them.
- **Privacy.** The server runs on your machine. Queries go directly to the public databases above and are never sent to us. Pro users' licence keys are checked with Polar.

## Support

Questions or bugs: [open an issue](https://github.com/kramdayal-create/biodata-mcp/issues) or email hello@root7.co.za.

BioData MCP is built by Root 7 (Pty) Ltd, South Africa.
