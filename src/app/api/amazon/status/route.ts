import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAmazonConfigStatus } from "@/lib/amazon/client";

// Reports which Amazon SP-API credentials are configured. Auth-gated.
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json(getAmazonConfigStatus());
}
