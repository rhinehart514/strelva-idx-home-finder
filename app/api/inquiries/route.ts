import { NextResponse } from "next/server";
import {
  getInquiryClientKey,
  inquiryRateLimiter,
  InquiryValidationError,
  isValidListingInquiryToken,
  parseInquirySubmission,
} from "@/src/lib/inquiries";
import { getProductionInquiryWorkflow } from "@/src/lib/inquiries/runtime";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 32 * 1_024;

export async function POST(request: Request) {
  const rateLimit = inquiryRateLimiter.consume(getInquiryClientKey(request));
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: "Too many inquiry attempts. Please wait before trying again.",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
      {
        status: 429,
        headers: { "retry-after": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: "The inquiry is too large to submit." },
      { status: 413 },
    );
  }

  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: "The inquiry is too large to submit." },
        { status: 413 },
      );
    }

    let rawInput: unknown;
    try {
      rawInput = JSON.parse(body);
    } catch {
      return NextResponse.json(
        { error: "Send the inquiry as valid JSON." },
        { status: 400 },
      );
    }

    const submission = parseInquirySubmission(rawInput);
    if (
      !submission.listing.inquiryToken ||
      !isValidListingInquiryToken({
        installationId: submission.installationId,
        listingId: submission.listing.id,
        address: submission.listing.address,
        token: submission.listing.inquiryToken,
      })
    ) {
      return NextResponse.json(
        { error: "Choose a current listing before sending an inquiry." },
        { status: 400 },
      );
    }
    const result = await getProductionInquiryWorkflow().submit(submission);
    return NextResponse.json(result, {
      status:
        result.status === "unavailable"
          ? 503
          : result.status === "pending"
            ? 202
            : 200,
    });
  } catch (error) {
    if (error instanceof InquiryValidationError) {
      return NextResponse.json(
        { error: error.message, issues: error.issues },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error:
          "The inquiry could not be processed. Your information was not delivered.",
      },
      { status: 500 },
    );
  }
}
