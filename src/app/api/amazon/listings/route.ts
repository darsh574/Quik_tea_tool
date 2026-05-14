import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { patchListingsItem, AmazonNotConfiguredError } from "@/lib/amazon/client";
import { marketplaceByCode } from "@/lib/amazon/regions";

// PATCH /api/amazon/listings
// Body: { sellerId, sku, marketplaceCode, patches: [{ op, path, value }] }
// Updates price / quantity / attributes for one SKU in one marketplace.
export async function PATCH(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    sellerId?: string;
    sku?: string;
    marketplaceCode?: string;
    patches?: Array<{ op: string; path: string; value: unknown }>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { sellerId, sku, marketplaceCode, patches } = body;
  if (!sellerId || !sku || !marketplaceCode || !patches?.length) {
    return NextResponse.json(
      { error: "sellerId, sku, marketplaceCode and a non-empty patches[] are required." },
      { status: 400 }
    );
  }

  const mp = marketplaceByCode(marketplaceCode);
  if (!mp) {
    return NextResponse.json(
      { error: `Unknown marketplace code "${marketplaceCode}".` },
      { status: 400 }
    );
  }

  try {
    const result = await patchListingsItem({
      region: mp.region,
      sellerId,
      sku,
      marketplaceId: mp.id,
      patches,
    });
    return NextResponse.json({ ok: true, marketplace: mp.code, result });
  } catch (err) {
    if (err instanceof AmazonNotConfiguredError) {
      return NextResponse.json({ error: err.message, notConfigured: true }, { status: 503 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "SP-API call failed" },
      { status: 502 }
    );
  }
}
