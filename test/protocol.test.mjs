// End-to-end MCP protocol test: spawns the built server over stdio and talks to it like Claude Desktop would.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const serverPath = fileURLToPath(new URL("../dist/index.js", import.meta.url));

test("server lists tools, gates Pro tools and validates input", async () => {
  const env = { ...process.env };
  delete env.BIODATA_LICENSE_KEY;
  const transport = new StdioClientTransport({ command: process.execPath, args: [serverPath], env, stderr: "ignore" });
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(transport);
  try {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    assert.deepEqual(names, [
      "biodata_status",
      "evidence_pack",
      "export_citations",
      "gene_dossier",
      "get_protein",
      "get_pubmed_articles",
      "get_trial",
      "lookup_gene",
      "search_proteins",
      "search_pubmed",
      "search_trials",
    ]);
    for (const t of tools) assert.ok(t.description && t.description.length > 20, `${t.name} needs a description`);

    const status = await client.callTool({ name: "biodata_status", arguments: {} });
    assert.match(status.content[0].text, /Tier: Free/);

    const gated = await client.callTool({ name: "evidence_pack", arguments: { topic: "metformin ageing" } });
    assert.match(gated.content[0].text, /BioData MCP Pro tool/);

    const invalid = await client.callTool({ name: "get_trial", arguments: { nct_id: "123" } });
    assert.equal(invalid.isError, true);
    assert.match(invalid.content[0].text, /not a valid NCT ID/);
  } finally {
    await client.close();
  }
});
