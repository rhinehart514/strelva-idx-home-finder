import { NextResponse } from "next/server";
import { getProductionInquiryWorkflow } from "@/src/lib/inquiries/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const expected = process.env.INQUIRY_WORKER_SECRET?.trim();
  const authorization = request.headers.get("authorization");
  if (!expected || authorization !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const processed = await getProductionInquiryWorkflow().processPending();
  const purged = await getProductionInquiryWorkflow().performMaintenance();
  return NextResponse.json({ processed, purged });
}
