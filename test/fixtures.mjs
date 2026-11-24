// Offline fixtures shaped like the real API responses, so tests run without network access.
export const esearch = {
  esearchresult: { count: "1234", idlist: ["11111111", "22222222", "33333333"] },
};

export const esummary = {
  result: {
    uids: ["11111111", "22222222", "33333333"],
    11111111: {
      uid: "11111111",
      title: "Vitamin D and fracture risk: a <i>meta-analysis</i>.",
      fulljournalname: "BMJ",
      source: "BMJ",
      pubdate: "2023 Jan 5",
      authors: [{ name: "Smith J" }, { name: "Naidoo K" }, { name: "Okafor A" }, { name: "Lee M" }],
      articleids: [{ idtype: "pubmed", value: "11111111" }, { idtype: "doi", value: "10.1136/bmj-2022-000001" }],
      pubtype: ["Journal Article", "Meta-Analysis"],
    },
    22222222: {
      uid: "22222222",
      title: "Cholecalciferol in older adults: randomised trial.",
      fulljournalname: "The Lancet",
      pubdate: "2021",
      authors: [{ name: "Brown P" }],
      articleids: [],
      pubtype: ["Journal Article", "Randomized Controlled Trial"],
    },
    33333333: {
      uid: "33333333",
      title: "A case of hypercalcaemia.",
      fulljournalname: "Case Reports",
      pubdate: "2024 Mar",
      authors: [],
      articleids: [],
      pubtype: ["Case Reports"],
    },
  },
};

export const efetchXml = `<?xml version="1.0"?>
<PubmedArticleSet>
<PubmedArticle><MedlineCitation><PMID Version="1">11111111</PMID><Article><Abstract>
<AbstractText Label="BACKGROUND">Background text.</AbstractText>
<AbstractText Label="CONCLUSIONS">Vitamin D alone did not reduce fractures &amp; falls.</AbstractText>
</Abstract></Article><MeshHeadingList><MeshHeading><DescriptorName UI="D1">Vitamin D</DescriptorName></MeshHeading><MeshHeading><DescriptorName UI="D2">Fractures, Bone</DescriptorName></MeshHeading></MeshHeadingList></MedlineCitation></PubmedArticle>
<PubmedArticle><MedlineCitation><PMID Version="1">22222222</PMID><Article><Abstract><AbstractText>Plain abstract for the RCT.</AbstractText></Abstract></Article></MedlineCitation></PubmedArticle>
<PubmedArticle><MedlineCitation><PMID Version="1">33333333</PMID><Article></Article></MedlineCitation></PubmedArticle>
</PubmedArticleSet>`;

const study = (nct, title) => ({
  protocolSection: {
    identificationModule: { nctId: nct, briefTitle: title },
    statusModule: { overallStatus: "RECRUITING", startDateStruct: { date: "2024-02" } },
    designModule: { phases: ["PHASE3"], studyType: "INTERVENTIONAL", enrollmentInfo: { count: 400 } },
    conditionsModule: { conditions: ["Osteoporosis"] },
    armsInterventionsModule: { interventions: [{ type: "DRUG", name: "Cholecalciferol" }] },
    sponsorCollaboratorsModule: { leadSponsor: { name: "University of Cape Town" } },
    descriptionModule: { briefSummary: "Tests vitamin D in older adults." },
    eligibilityModule: { eligibilityCriteria: "Inclusion: age 65+", minimumAge: "65 Years", sex: "ALL" },
    outcomesModule: { primaryOutcomes: [{ measure: "Fracture incidence", timeFrame: "24 months" }] },
    contactsLocationsModule: { locations: [{ facility: "Groote Schuur", city: "Cape Town", country: "South Africa" }] },
  },
  hasResults: false,
});

export const trialsSearch = { totalCount: 2, studies: [study("NCT01234567", "Vitamin D Trial A"), study("NCT07654321", "Vitamin D Trial B")] };
export const trialDetail = study("NCT01234567", "Vitamin D Trial A");

export const uniprotSearch = {
  results: [
    {
      primaryAccession: "P38398",
      uniProtkbId: "BRCA1_HUMAN",
      entryType: "UniProtKB reviewed (Swiss-Prot)",
      proteinDescription: { recommendedName: { fullName: { value: "Breast cancer type 1 susceptibility protein" } } },
      genes: [{ geneName: { value: "BRCA1" } }],
      organism: { scientificName: "Homo sapiens" },
      sequence: { length: 1863 },
    },
  ],
};

export const uniprotEntry = {
  ...uniprotSearch.results[0],
  comments: [
    { commentType: "FUNCTION", texts: [{ value: "E3 ubiquitin-protein ligase involved in DNA repair." }] },
    { commentType: "SUBCELLULAR LOCATION", subcellularLocations: [{ location: { value: "Nucleus" } }] },
    { commentType: "DISEASE", disease: { diseaseId: "Breast cancer", description: "A common malignancy." } },
  ],
  keywords: [{ name: "DNA repair" }, { name: "Tumor suppressor" }],
  uniProtKBCrossReferences: [{ database: "PDB", id: "1JM7" }, { database: "Ensembl", id: "ENST00000357654" }, { database: "GO", id: "GO:0000001" }],
};

export const ensemblGene = {
  id: "ENSG00000012048",
  display_name: "BRCA1",
  description: "BRCA1 DNA repair associated [Source:HGNC Symbol;Acc:HGNC:1100]",
  biotype: "protein_coding",
  species: "homo_sapiens",
  seq_region_name: "17",
  start: 43044292,
  end: 43170245,
  strand: -1,
  assembly_name: "GRCh38",
  canonical_transcript: "ENST00000357654.9",
};

/** Routes a URL to a fixture and records every URL requested. */
export function installFetchStub() {
  const calls = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    if (url.includes("esearch.fcgi")) return json(esearch);
    if (url.includes("esummary.fcgi")) return json(esummary);
    if (url.includes("efetch.fcgi")) return new Response(efetchXml, { status: 200 });
    if (url.includes("clinicaltrials.gov/api/v2/studies/NCT")) return json(trialDetail);
    if (url.includes("clinicaltrials.gov/api/v2/studies")) return json(trialsSearch);
    if (url.includes("rest.uniprot.org/uniprotkb/search")) return json(uniprotSearch);
    if (url.includes("rest.uniprot.org/uniprotkb/")) return json(uniprotEntry);
    if (url.includes("rest.ensembl.org/lookup")) return json(ensemblGene);
    return new Response("not found", { status: 404 });
  };
  return calls;
}
