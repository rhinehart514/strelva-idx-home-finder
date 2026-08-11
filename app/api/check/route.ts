import { NextResponse } from "next/server";
import { checkPublicSite, SiteCheckError } from "@/src/lib/site-check";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const input: unknown = await request.json();
    const url =
      typeof input === "object" && input !== null && "url" in input
        ? (input as { url?: unknown }).url
        : undefined;

    if (typeof url !== "string") {
      return NextResponse.json(
        { error: "Enter a public website URL to check." },
        { status: 400 },
      );
    }

    return NextResponse.json(await checkPublicSite(url));
  } catch (error) {
    if (error instanceof SiteCheckError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: "The page could not be checked. Your URL was not saved." },
      { status: 500 },
    );
  }
}
