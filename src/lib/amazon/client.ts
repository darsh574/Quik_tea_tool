// ─────────────────────────────────────────────────────────────────────────────
// Amazon Selling Partner API — multi-region client wrapper. SERVER ONLY.
//
// Auth model (post-2023, no AWS SigV4): refresh_token -> LWA access_token
// (cached ~55 min) -> SP-API call with `x-amz-access-token` header.
// One LWA app (client id/secret) covers all regions; the refresh token differs
// per region (NA / EU / FE).
//
// Credentials live in env vars and are read lazily, so the app builds and runs
// fine before the brand finishes its developer registration — the Amazon tab
// just reports "not configured" until the env vars are filled in.
// ─────────────────────────────────────────────────────────────────────────────

import "server-only";
import {
  type Region,
  REGION_ENDPOINTS,
  SANDBOX_ENDPOINTS,
  LWA_TOKEN_URL,
} from "./regions";

interface TokenCacheEntry {
  accessToken: string;
  expiresAt: number; // epoch ms
}

// One token cache per region — never mix regions.
const tokenCache: Partial<Record<Region, TokenCacheEntry>> = {};

function refreshTokenFor(region: Region): string | undefined {
  return {
    NA: process.env.AMAZON_REFRESH_TOKEN_NA,
    EU: process.env.AMAZON_REFRESH_TOKEN_EU,
    FE: process.env.AMAZON_REFRESH_TOKEN_FE,
  }[region];
}

export interface AmazonConfigStatus {
  hasClientCreds: boolean;
  regions: Record<Region, boolean>;
  sandbox: boolean;
  configured: boolean;
}

/** Report which credentials are present — used by the Amazon tab status banner. */
export function getAmazonConfigStatus(): AmazonConfigStatus {
  const hasClientCreds = Boolean(
    process.env.AMAZON_LWA_CLIENT_ID && process.env.AMAZON_LWA_CLIENT_SECRET
  );
  const regions: Record<Region, boolean> = {
    NA: Boolean(process.env.AMAZON_REFRESH_TOKEN_NA),
    EU: Boolean(process.env.AMAZON_REFRESH_TOKEN_EU),
    FE: Boolean(process.env.AMAZON_REFRESH_TOKEN_FE),
  };
  const configured = hasClientCreds && (regions.NA || regions.EU || regions.FE);
  return {
    hasClientCreds,
    regions,
    sandbox: process.env.AMAZON_USE_SANDBOX === "true",
    configured,
  };
}

export class AmazonNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AmazonNotConfiguredError";
  }
}

/** Exchange the region's refresh token for a short-lived LWA access token. */
async function getAccessToken(region: Region): Promise<string> {
  const cached = tokenCache[region];
  if (cached && cached.expiresAt > Date.now()) return cached.accessToken;

  const clientId = process.env.AMAZON_LWA_CLIENT_ID;
  const clientSecret = process.env.AMAZON_LWA_CLIENT_SECRET;
  const refreshToken = refreshTokenFor(region);

  if (!clientId || !clientSecret) {
    throw new AmazonNotConfiguredError(
      "AMAZON_LWA_CLIENT_ID / AMAZON_LWA_CLIENT_SECRET are not set."
    );
  }
  if (!refreshToken) {
    throw new AmazonNotConfiguredError(
      `No refresh token configured for region ${region} (AMAZON_REFRESH_TOKEN_${region}).`
    );
  }

  const res = await fetch(LWA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LWA token exchange failed (${res.status}): ${text}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  // Cache for slightly less than the full hour (leave a 5-min buffer).
  tokenCache[region] = {
    accessToken: json.access_token,
    expiresAt: Date.now() + (json.expires_in - 300) * 1000,
  };
  return json.access_token;
}

function baseUrl(region: Region): string {
  const sandbox = process.env.AMAZON_USE_SANDBOX === "true";
  const host = (sandbox ? SANDBOX_ENDPOINTS : REGION_ENDPOINTS)[region];
  return `https://${host}`;
}

export interface SpApiOptions {
  region: Region;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
}

/**
 * Make an authenticated SP-API call. Retries once on a 429 with backoff.
 * Returns the parsed JSON response (or throws with the Amazon error body).
 */
export async function spApiCall<T = unknown>(opts: SpApiOptions): Promise<T> {
  const { region, method = "GET", path, query, body } = opts;
  const token = await getAccessToken(region);

  const url = new URL(baseUrl(region) + path);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
  }

  async function attempt(): Promise<Response> {
    return fetch(url.toString(), {
      method,
      headers: {
        "x-amz-access-token": token,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  }

  let res = await attempt();
  if (res.status === 429) {
    // Exponential-ish backoff, single retry — SP-API rate limits are per-endpoint.
    await new Promise((r) => setTimeout(r, 2000));
    res = await attempt();
  }

  const text = await res.text();
  const requestId = res.headers.get("x-amzn-RequestId") || "";
  if (!res.ok) {
    throw new Error(
      `SP-API ${method} ${path} failed (${res.status})${requestId ? ` [req ${requestId}]` : ""}: ${text}`
    );
  }
  return (text ? JSON.parse(text) : {}) as T;
}

// ── Convenience operations (the endpoints the brand asked for) ───────────────

/** Update a listing (price, qty, attributes) for one SKU in one marketplace. */
export async function patchListingsItem(params: {
  region: Region;
  sellerId: string;
  sku: string;
  marketplaceId: string;
  patches: Array<{ op: string; path: string; value: unknown }>;
}) {
  return spApiCall({
    region: params.region,
    method: "PATCH",
    path: `/listings/2021-08-01/items/${encodeURIComponent(params.sellerId)}/${encodeURIComponent(
      params.sku
    )}`,
    query: { marketplaceIds: params.marketplaceId },
    body: { productType: "PRODUCT", patches: params.patches },
  });
}

/** Kick off a report (e.g. sales / inventory / advertising). Returns reportId. */
export async function createReport(params: {
  region: Region;
  reportType: string;
  marketplaceIds: string[];
  dataStartTime?: string;
  dataEndTime?: string;
}) {
  return spApiCall<{ reportId: string }>({
    region: params.region,
    method: "POST",
    path: "/reports/2021-06-30/reports",
    body: {
      reportType: params.reportType,
      marketplaceIds: params.marketplaceIds,
      dataStartTime: params.dataStartTime,
      dataEndTime: params.dataEndTime,
    },
  });
}

/** Poll a report's status; when DONE it carries a reportDocumentId. */
export async function getReport(region: Region, reportId: string) {
  return spApiCall<{
    reportId: string;
    processingStatus: string;
    reportDocumentId?: string;
  }>({
    region,
    path: `/reports/2021-06-30/reports/${encodeURIComponent(reportId)}`,
  });
}

/** Get the download URL + compression info for a finished report document. */
export async function getReportDocument(region: Region, documentId: string) {
  return spApiCall<{
    reportDocumentId: string;
    url: string;
    compressionAlgorithm?: string;
  }>({
    region,
    path: `/reports/2021-06-30/documents/${encodeURIComponent(documentId)}`,
  });
}
