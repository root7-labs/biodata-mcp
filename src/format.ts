// Citation export helpers (RIS for EndNote/Zotero/Mendeley, BibTeX for LaTeX).
import type { PubMedSummary } from "./sources/pubmed.js";

export function toRis(items: PubMedSummary[]): string {
  return items
    .map((p) => {
      const lines = ["TY  - JOUR", `TI  - ${p.title}`];
      for (const a of p.authors) lines.push(`AU  - ${a}`);
      if (p.journal) lines.push(`JO  - ${p.journal}`);
      if (p.year) lines.push(`PY  - ${p.year}`);
      if (p.doi) lines.push(`DO  - ${p.doi}`);
      lines.push(`AN  - PMID:${p.pmid}`, `UR  - ${p.url}`, "ER  - ");
      return lines.join("\n");
    })
    .join("\n\n");
}

function bibEscape(s: string): string {
  return s.replace(/[{}]/g, "").replace(/([&%$#_])/g, "\\$1");
}

export function toBibtex(items: PubMedSummary[]): string {
  return items
    .map((p) => {
      const first = (p.authors[0] ?? "anon").split(" ")[0].replace(/[^A-Za-z]/g, "").toLowerCase() || "anon";
      const key = `${first}${p.year || ""}pmid${p.pmid}`;
      const fields = [
        `  title = {${bibEscape(p.title)}}`,
        `  author = {${bibEscape(p.authors.join(" and "))}}`,
        p.journal ? `  journal = {${bibEscape(p.journal)}}` : "",
        p.year ? `  year = {${p.year}}` : "",
        p.doi ? `  doi = {${p.doi}}` : "",
        `  pmid = {${p.pmid}}`,
        `  url = {${p.url}}`,
      ].filter(Boolean);
      return `@article{${key},\n${fields.join(",\n")}\n}`;
    })
    .join("\n\n");
}

export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max).trimEnd()}…`;
}
