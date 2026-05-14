import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  createReport,
  getReport,
  getReportDocument,
  AmazonNotConfiguredError,
} from "@/lib/amazon/client";
import { marketplaceByCode } from "@/lib/amazon/regions";

async function requireUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

function handleError(err: unknown) {
  if (err instanceof AmazonNotConfiguredError) {
    return NextResponse.json({ error: err.message, notConfigured: true }, { status: 503 });
  }
  return NextResponse.json(
    { error: err instanceof Error ? err.message : "SP-API call failed" },
    { status: 502 }
  );
}

// POST /api/amazon/reports
// Body: { reportType, marketplaceCodes: string[], dataStartTime?, dataEndTime? }
// Kicks off a report and returns { reportId }. Poll with GET below.
export async function POST(req: NextRequest) {
  if (!(await requireUser())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    reportType?: string;
    marketplaceCodes?: string[];
    dataStartTime?: string;
    dataEndTime?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { reportType, marketplaceCodes, dataStartTime, dataEndTime } = body;
  if (!reportType || !marketplaceCodes?.length) {
    return NextResponse.json(
      { error: "reportType and a non-empty marketplaceCodes[] are required." },
      { status: 400 }
    );
  }

  const mps = marketplaceCodes.map((c) => marketplaceByCode(c)).filter(Boolean);
  if (mps.length !== marketplaceCodes.length) {
    return NextResponse.json({ error: "One or more marketplace codes are unknown." }, { status: 400 });
  }
  // Reports are per-region; all selected marketplaces must share a region.
  const region = mps[0]!.region;
  if (mps.some((m) => m!.region !== region)) {
    return NextResponse.json(
      { error: "All marketplaces in one report request must be in the same region (NA/EU/FE)." },
      { status: 400 }
    );
  }

  try {
    const result = await createReport({
      region,
      reportType,
      marketplaceIds: mps.map((m) => m!.id),
      dataStartTime,
      dataEndTime,
    });
    return NextResponse.json({ ok: true, region, ...result });
  } catch (err) {
    return handleError(err);
  }
}

// GET /api/amazon/reports?region=NA&reportId=...   → poll status
// GET /api/amazon/reports?region=NA&documentId=... → get download URL
export async function GET(req: NextRequest) {
  if (!(await requireUser())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const region = searchParams.get("region") as "NA" | "EU" | "FE" | null;
  const reportId = searchParams.get("reportId");
  const documentId = searchParams.get("documentId");

  if (!region || !["NA", "EU", "FE"].includes(region)) {
    return NextResponse.json({ error: "region (NA|EU|FE) is required." }, { status: 400 });
  }

  try {
    if (documentId) {
      return NextResponse.json(await getReportDocument(region, documentId));
    }
    if (reportId) {
      return NextResponse.json(await getReport(region, reportId));
    }
    return NextResponse.json({ error: "reportId or documentId is required." }, { status: 400 });
  } catch (err) {
    return handleError(err);
  }
}
