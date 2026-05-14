// ─────────────────────────────────────────────────────────────────────────────
// Amazon SP-API region + marketplace map.
// One app registration covers all regions; the refresh token differs per region.
// Reference: Amazon-API-Integration-Summary.txt
// ─────────────────────────────────────────────────────────────────────────────

export type Region = "NA" | "EU" | "FE";

export const REGION_ENDPOINTS: Record<Region, string> = {
  NA: "sellingpartnerapi-na.amazon.com",
  EU: "sellingpartnerapi-eu.amazon.com",
  FE: "sellingpartnerapi-fe.amazon.com",
};

export const SANDBOX_ENDPOINTS: Record<Region, string> = {
  NA: "sandbox.sellingpartnerapi-na.amazon.com",
  EU: "sandbox.sellingpartnerapi-eu.amazon.com",
  FE: "sandbox.sellingpartnerapi-fe.amazon.com",
};

export const LWA_TOKEN_URL = "https://api.amazon.com/auth/o2/token";

export interface Marketplace {
  code: string;
  name: string;
  id: string;
  region: Region;
  currency: string;
}

// The marketplaces a brand is most likely to use. Extend as needed.
export const MARKETPLACES: Marketplace[] = [
  { code: "US", name: "United States", id: "ATVPDKIKX0DER", region: "NA", currency: "USD" },
  { code: "CA", name: "Canada", id: "A2EUQ1WTGCTBG2", region: "NA", currency: "CAD" },
  { code: "MX", name: "Mexico", id: "A1AM78C64UM0Y8", region: "NA", currency: "MXN" },
  { code: "BR", name: "Brazil", id: "A2Q3Y263D00KWC", region: "NA", currency: "BRL" },
  { code: "UK", name: "United Kingdom", id: "A1F83G8C2ARO7P", region: "EU", currency: "GBP" },
  { code: "DE", name: "Germany", id: "A1PA6795UKMFR9", region: "EU", currency: "EUR" },
  { code: "FR", name: "France", id: "A13V1IB3VIYZZH", region: "EU", currency: "EUR" },
  { code: "IT", name: "Italy", id: "APJ6JRA9NG5V4", region: "EU", currency: "EUR" },
  { code: "ES", name: "Spain", id: "A1RKKUPIHCS9HS", region: "EU", currency: "EUR" },
  { code: "NL", name: "Netherlands", id: "A1805IZSGTT6HS", region: "EU", currency: "EUR" },
  { code: "SE", name: "Sweden", id: "A2NODRKZP88ZB9", region: "EU", currency: "SEK" },
  { code: "PL", name: "Poland", id: "A1C3SOZRARQ6R3", region: "EU", currency: "PLN" },
  { code: "BE", name: "Belgium", id: "AMEN7PMS3EDWL", region: "EU", currency: "EUR" },
  { code: "IE", name: "Ireland", id: "A28R8C7NBKEWEA", region: "EU", currency: "EUR" },
  { code: "TR", name: "Turkey", id: "A33AVAJ2PDY3EV", region: "EU", currency: "TRY" },
  { code: "IN", name: "India", id: "A21TJRUUN4KGV", region: "EU", currency: "INR" },
  { code: "SA", name: "Saudi Arabia", id: "A17E79C6D8DWNP", region: "EU", currency: "SAR" },
  { code: "EG", name: "Egypt", id: "ARBP9OOSHTCHU", region: "EU", currency: "EGP" },
  { code: "AE", name: "United Arab Emirates", id: "A2VIGQ35RCS4UG", region: "EU", currency: "AED" },
  { code: "ZA", name: "South Africa", id: "AE08WJ6YKNBMC", region: "EU", currency: "ZAR" },
  { code: "JP", name: "Japan", id: "A1VC38T7YXB528", region: "FE", currency: "JPY" },
  { code: "AU", name: "Australia", id: "A39IBJ37TRP1C6", region: "FE", currency: "AUD" },
  { code: "SG", name: "Singapore", id: "A19VAU5U5O7RUS", region: "FE", currency: "SGD" },
];

export function marketplaceByCode(code: string): Marketplace | undefined {
  return MARKETPLACES.find((m) => m.code === code.toUpperCase());
}
