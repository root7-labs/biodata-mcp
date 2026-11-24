import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { installFetchStub } from "./fixtures.mjs";
import { clearCache } from "../dist/http.js";
import * as T from "../dist/tools.js";
import { parsePubMedXml, designLabel } from "../dist/sources/pubmed.js";
import { getLicence, checkPolarKey, resetLicenceCache } from "../dist/license.js";

let calls;
beforeEach(() => {
  clearCache();
  calls = installFetchStub();
});

test("search_pubmed lists results with design tags and builds year filter", async () => {
  const out = await T.toolSearchPubMed({ query: "vitamin D fracture", max_results: 3, from_year: 2020 });
  assert.match(out, /Showing 3 of 1,234 matches/);
  assert.match(out, /Design tag: Meta-analysis/);
  assert.match(out, /Vitamin D and fracture risk: a meta-analysis\./); // HTML tags stripped
  assert.match(out, /Smith J, Naidoo K, Okafor A et al\./);
  assert.ok(decodeURIComponent(calls[0]).includes("2020:3000[dp]"));
});

test("PubMed XML parsing keeps labelled sections, decodes entities and MeSH", () => {
  const m = parsePubMedXml(`<PubmedArticleSet><PubmedArticle><MedlineCitation><PMID>9</PMID><AbstractText Label="AIM">a &amp; b</AbstractText><DescriptorName>X</DescriptorName></MedlineCitation></PubmedArticle></PubmedArticleSet>`);
  assert.equal(m.get("9").abstract, "AIM: a & b");
  assert.deepEqual(m.get("9").mesh, ["X"]);
});

test("design labels rank stronger designs first", () => {
  assert.equal(designLabel(["Meta-Analysis"]).rank, 1);
  assert.ok(designLabel(["Randomized Controlled Trial"]).rank < designLabel(["Case Reports"]).rank);
});

test("get_pubmed_articles enforces the free limit and validates IDs", async () => {
  const ids = ["11111111", "22222222", "33333333", "1", "2", "3", "4"];
  const free = await T.toolGetPubMedArticles({ pmids: ids }, false);
  assert.match(free, /Returned 5 of 7 requested/);
  assert.match(free, /CONCLUSIONS: Vitamin D alone did not reduce fractures & falls\./);
  assert.match(free, /No abstract available/);
  const bad = await T.toolGetPubMedArticles({ pmids: ["abc"] }, false);
  assert.match(bad, /No valid PMIDs/);
});

test("trial search and detail render key fields", async () => {
  const s = await T.toolSearchTrials({ condition: "osteoporosis", country: "South Africa", status: ["RECRUITING"] });
  assert.match(s, /NCT01234567/);
  assert.match(s, /PHASE3/);
  assert.ok(calls.some((u) => decodeURIComponent(u).includes("filter.overallStatus=RECRUITING")));
  const d = await T.toolGetTrial({ nct_id: "nct01234567" });
  assert.match(d, /Fracture incidence \(time frame: 24 months\)/);
  assert.match(d, /Groote Schuur, Cape Town, South Africa/);
  await assert.rejects(() => T.toolGetTrial({ nct_id: "12345" }), /not a valid NCT ID/);
  assert.match(await T.toolSearchTrials({}), /at least one of/);
});

test("protein search, entry and gene lookup", async () => {
  const s = await T.toolSearchProteins({ query: "BRCA1", organism_tax_id: 9606 });
  assert.match(s, /P38398/);
  assert.match(s, /Reviewed \(Swiss-Prot\)/);
  const e = await T.toolGetProtein({ accession: "p38398" });
  assert.match(e, /E3 ubiquitin-protein ligase/);
  assert.match(e, /Breast cancer/);
  assert.doesNotMatch(e, /GO:0000001/); // only selected cross-references kept
  const g = await T.toolLookupGene({ symbol_or_id: "BRCA1" });
  assert.match(g, /17:43044292-43170245 \(-\)/);
  assert.doesNotMatch(g, /\[Source:/);
});

test("evidence_pack ranks by design and includes trials and references", async () => {
  const out = await T.toolEvidencePack({ topic: "vitamin D fracture", high_level_only: true });
  const firstRow = out.split("\n").find((l) => l.startsWith("| 1 |"));
  assert.match(firstRow, /Meta-analysis/);
  assert.match(out, /Related clinical trials/);
  assert.match(out, /\[1\] Smith J, Naidoo K, Okafor A et al\..*doi:10\.1136/);
  assert.ok(decodeURIComponent(calls.find((u) => u.includes("esearch"))).includes("meta-analysis[pt]"));
});

test("gene_dossier combines Ensembl, UniProt, PubMed and trials", async () => {
  const out = await T.toolGeneDossier({ gene: "BRCA1" });
  for (const s of ["ENSG00000012048", "P38398", "PMID 11111111", "NCT01234567"]) assert.ok(out.includes(s), s);
});

test("export_citations produces RIS and BibTeX", async () => {
  const ris = await T.toolExportCitations({ pmids: ["11111111"], format: "ris" });
  assert.match(ris, /TY {2}- JOUR/);
  assert.match(ris, /DO {2}- 10\.1136\/bmj-2022-000001/);
  const bib = await T.toolExportCitations({ pmids: ["11111111"], format: "bibtex" });
  assert.match(bib, /@article\{smith2023pmid11111111/);
});

test("caching avoids repeat network calls", async () => {
  await T.toolLookupGene({ symbol_or_id: "BRCA1" });
  await T.toolLookupGene({ symbol_or_id: "BRCA1" });
  assert.equal(calls.length, 1);
});

test("licence: no key is free tier; offline key without public key is rejected", async () => {
  resetLicenceCache();
  assert.equal((await getLicence(undefined)).valid, false);
  assert.match((await getLicence("bd1.abc.def")).reason, /no offline-key public key/i);
});

test("licence: Polar key validation handles granted, revoked and outages", async () => {
  const seen = [];
  const reply = (status, body) => async (url, init) => {
    seen.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };
  globalThis.fetch = reply(200, { status: "granted", expires_at: null, customer: { email: "buyer@lab.org" } });
  const ok = await checkPolarKey("BIODATA-123", "org-uuid");
  assert.equal(ok.valid, true);
  assert.equal(ok.holder, "buyer@lab.org");
  assert.match(seen[0].url, /\/v1\/customer-portal\/license-keys\/validate$/);
  assert.deepEqual(seen[0].body, { key: "BIODATA-123", organization_id: "org-uuid" });

  globalThis.fetch = reply(404, { error: "ResourceNotFound", detail: "x" });
  assert.equal((await checkPolarKey("BIODATA-123", "org-uuid")).valid, false);

  globalThis.fetch = reply(200, { status: "granted", expires_at: "2020-01-01T00:00:00Z" });
  assert.match((await checkPolarKey("BIODATA-123", "org-uuid")).reason, /expired/);

  globalThis.fetch = async () => { throw new TypeError("fetch failed"); };
  const outage = await checkPolarKey("BIODATA-123", "org-uuid");
  assert.equal(outage.valid, true);
  assert.match(outage.note, /Could not reach Polar/);

  assert.match((await checkPolarKey("BIODATA-123", "")).reason, /no Polar organization/);
});
