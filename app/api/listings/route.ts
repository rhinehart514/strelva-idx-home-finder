import { NextResponse } from "next/server";
import {
  getMlsProvider,
  MlsError,
  parseListingSearchQuery,
} from "@/src/lib/mls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const query = parseListingSearchQuery(new URL(request.url).searchParams);
    const result = await getMlsProvider().searchListings(query);

    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof MlsError) {
      return NextResponse.json(
        {
          error: {
            code: error.code,
            message: error.publicMessage,
            retryable: error.retryable,
          },
        },
        {
          status: error.status,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    return NextResponse.json(
      {
        error: {
          code: "upstream",
          message: "Listings could not be loaded.",
          retryable: true,
        },
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
