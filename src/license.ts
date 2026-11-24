// Licence checks for BioData MCP Pro.
//
// Two kinds of key are accepted:
//  1. Polar keys (issued automatically when someone buys on Polar). Checked online against
//     Polar's public validate endpoint, cached for 6 hours.
//  2. Offline keys starting "bd1." (issued by you with `npm run keys:issue`, e.g. for testers
//     and reviewers). Signed with Ed25519; only the public key ships in the package.
import { createPublicKey, verify } from "node:crypto";
import { PUBLIC_KEY_PEM } from "./license-pubkey.js";
import { DEFAULT_UPGRADE_URL, POLAR_API_BASE, POLAR_ORGANIZATION_ID } from "./license-config.js";

export interface LicenceInfo {
  valid: boolean;
  source?: "polar" | "offline";
  plan?: string;
  holder?: string;
  expires?: string | null;
  reason?: string;
  note?: string;
}

const OFFLINE_PREFIX = "bd1.";
const CACHE_MS = 6 * 60 * 60 * 1000;

function b64urlDecode(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export function checkOfflineKey(key: string, publicKeyPem = PUBLIC_KEY_PEM): LicenceInfo {
  if (!publicKeyPem) return { valid: false, reason: "This build has no offline-key public key configured." };
  const [payloadB64, sigB64] = key.slice(OFFLINE_PREFIX.length).split(".");
  if (!payloadB64 || !sigB64) return { valid: false, reason: "Licence key is incomplete." };
  let ok = false;
  try {
    ok = verify(null, Buffer.from(payloadB64), createPublicKey(publicKeyPem), b64urlDecode(sigB64));
  } catch {
    ok = false;
  }
  if (!ok) return { valid: false, reason: "Licence key signature is invalid." };
  let payload: { sub?: string; plan?: string; exp?: string | null };
  try {
    payload = JSON.parse(b64urlDecode(payloadB64).toString("utf8"));
  } catch {
    return { valid: false, reason: "Licence key payload is unreadable." };
  }
  if (payload.exp && Date.parse(payload.exp) < Date.now()) {
    return { valid: false, reason: `Licence expired on ${payload.exp.slice(0, 10)}.`, holder: payload.sub };
  }
  return { valid: true, source: "offline", plan: payload.plan ?? "pro", holder: payload.sub, expires: payload.exp ?? null };
}

export async function checkPolarKey(key: string, organizationId = POLAR_ORGANIZATION_ID): Promise<LicenceInfo> {
  if (!organizationId) return { valid: false, reason: "This build has no Polar organization configured." };
  let res: Response;
  try {
    res = await fetch(`${POLAR_API_BASE}/v1/customer-portal/license-keys/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ key, organization_id: organizationId }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // The research tools need the internet anyway, so a brief outage at Polar should not lock out a paying user.
    return { valid: true, source: "polar", note: "Could not reach Polar to confirm the key; Pro is enabled for now." };
  }
  if (res.status === 404) return { valid: false, reason: "Licence key not found, revoked or expired." };
  if (res.status === 422 || res.status === 400) return { valid: false, reason: "Licence key was rejected by Polar." };
  if (!res.ok) {
    return { valid: true, source: "polar", note: `Polar returned HTTP ${res.status}; Pro is enabled for now.` };
  }
  let body: { status?: string; expires_at?: string | null; customer?: { email?: string | null; name?: string | null } };
  try {
    body = await res.json();
  } catch {
    return { valid: true, source: "polar", note: "Unexpected reply from Polar; Pro is enabled for now." };
  }
  if (body.status !== "granted") return { valid: false, reason: `Licence status is "${body.status ?? "unknown"}".` };
  if (body.expires_at && Date.parse(body.expires_at) < Date.now()) {
    return { valid: false, reason: `Licence expired on ${body.expires_at.slice(0, 10)}.` };
  }
  return {
    valid: true,
    source: "polar",
    plan: "pro",
    holder: body.customer?.email ?? body.customer?.name ?? undefined,
    expires: body.expires_at ?? null,
  };
}

let cached: { key: string; at: number; info: Promise<LicenceInfo> } | undefined;

/** Resolves the current licence, caching the result for 6 hours. */
export function getLicence(key = process.env.BIODATA_LICENSE_KEY): Promise<LicenceInfo> {
  const k = key?.trim();
  if (!k) return Promise.resolve({ valid: false, reason: "No licence key set (BIODATA_LICENSE_KEY)." });
  if (k.startsWith(OFFLINE_PREFIX)) return Promise.resolve(checkOfflineKey(k));
  if (cached && cached.key === k && Date.now() - cached.at < CACHE_MS) return cached.info;
  const info = checkPolarKey(k);
  cached = { key: k, at: Date.now(), info };
  return info;
}

export function resetLicenceCache(): void {
  cached = undefined;
}

export const UPGRADE_URL = process.env.BIODATA_UPGRADE_URL ?? DEFAULT_UPGRADE_URL;

export function upgradeMessage(tool: string, reason?: string): string {
  return [
    `"${tool}" is a BioData MCP Pro tool.`,
    reason ? `Licence check: ${reason}` : "",
    `Get a Pro key at ${UPGRADE_URL}, then set BIODATA_LICENSE_KEY in your MCP client config and restart it.`,
    "Free tools (search_pubmed, get_pubmed_articles, search_trials, get_trial, search_proteins, get_protein, lookup_gene) keep working without a key.",
  ]
    .filter(Boolean)
    .join("\n");
}
