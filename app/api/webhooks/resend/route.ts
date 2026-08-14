import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { getProductionInquiryWorkflow } from "@/src/lib/inquiries/runtime";

export const runtime = "nodejs";

type ResendEvent = {
  type?: string;
  data?: { email_id?: string };
};

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  const id = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");
  if (!secret || !id || !timestamp || !signature) {
    return NextResponse.json({ error: "Invalid webhook." }, { status: 400 });
  }

  const rawBody = await request.text();
  let event: ResendEvent;
  try {
    event = new Webhook(secret).verify(rawBody, {
      "svix-id": id,
      "svix-timestamp": timestamp,
      "svix-signature": signature,
    }) as ResendEvent;
  } catch {
    return NextResponse.json({ error: "Invalid webhook." }, { status: 400 });
  }

  const providerMessageId = event.data?.email_id;
  const state =
    event.type === "email.delivered"
      ? "delivered"
      : event.type === "email.bounced" || event.type === "email.failed"
        ? event.type.slice("email.".length)
        : null;
  try {
    if (providerMessageId && state) {
      await getProductionInquiryWorkflow().handleProviderEvent(
        providerMessageId,
        state as "delivered" | "bounced" | "failed",
      );
    }
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json(
      { error: "Webhook processing is temporarily unavailable." },
      { status: 503 },
    );
  }
}
