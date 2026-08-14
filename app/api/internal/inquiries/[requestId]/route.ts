import { NextResponse } from "next/server";
import { getProductionInquiryWorkflow } from "@/src/lib/inquiries/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReceiptRouteProps = {
  params: Promise<{ requestId: string }>;
};

export async function GET(request: Request, { params }: ReceiptRouteProps) {
  const expected = process.env.INQUIRY_WORKER_SECRET?.trim();
  const authorization = request.headers.get("authorization");
  if (!expected || authorization !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { requestId } = await params;
  const receipt = await getProductionInquiryWorkflow().getReceipt(requestId);
  if (!receipt) {
    return NextResponse.json({ error: "Delivery Receipt not found." }, { status: 404 });
  }
  return NextResponse.json(receipt, {
    headers: { "Cache-Control": "no-store" },
  });
}
