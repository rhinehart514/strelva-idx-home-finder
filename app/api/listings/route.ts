import { NextResponse } from "next/server";
import {
  getMlsProviderForInstallation,
  MlsError,
  parseListingSearchQuery,
} from "@/src/lib/mls";
import {
  getHomeFinderInstallation,
  InstallationNotFoundError,
} from "@/src/lib/installations";
import { createListingInquiryToken } from "@/src/lib/inquiries";
import { assessIdxStaleness, selectDisplayableInventory } from "@/src/lib/idx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const installationId = params.get("installationId")?.trim();
    if (!installationId) {
      return NextResponse.json(
        { error: { code: "installation", message: "Choose a Home Finder Installation." } },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    const installation = getHomeFinderInstallation(installationId);
    const query = parseListingSearchQuery(params);
    let result = await getMlsProviderForInstallation(
      installation,
    ).searchListings(query);
    const eligibleCount = result.listings.length;
    result = selectDisplayableInventory(result);
    if (
      installation.mode === "live" &&
      (assessIdxStaleness(
        result.sourceCheckedAt,
        result.source.freshnessWindowMinutes,
      ).status !== "current" ||
        (eligibleCount > 0 && result.listings.length === 0))
    ) {
      throw new MlsError(
        "invalid_response",
        "Live inventory is temporarily unavailable because its display evidence could not be verified.",
        503,
        true,
      );
    }

    const featuredOfficeName = installation.mls.featuredOfficeName?.toLocaleLowerCase("en-US");
    if (featuredOfficeName) {
      result.listings.sort((left, right) => {
        const leftFeatured = left.listOfficeName?.toLocaleLowerCase("en-US") === featuredOfficeName;
        const rightFeatured = right.listOfficeName?.toLocaleLowerCase("en-US") === featuredOfficeName;
        return Number(rightFeatured) - Number(leftFeatured);
      });
    }

    if (installation.mode === "live") {
      result.listings = result.listings.map((listing) => {
        const address = [
          listing.address.line,
          listing.address.city,
          listing.address.state,
          listing.address.postalCode,
        ]
          .filter(Boolean)
          .join(", ");
        return {
          ...listing,
          inquiryToken: createListingInquiryToken({
            installationId,
            listingId: listing.id,
            address,
          }),
        };
      });
    }

    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof InstallationNotFoundError) {
      return NextResponse.json(
        { error: { code: "installation", message: "This Home Finder Installation is unavailable." } },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
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
