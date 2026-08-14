import type { ListingSearchResult } from "../mls/types";
import { assessIdxDisplay } from "./compliance";

export function selectDisplayableInventory(
  result: ListingSearchResult,
  now = new Date(),
): ListingSearchResult {
  if (result.source.mode === "demo") return result;
  const listings = result.listings.filter((listing) =>
    assessIdxDisplay({
      dataMode: "live",
      sourceName: result.source.name,
      sourceCheckedAt: result.sourceCheckedAt,
      listingBrokerage: listing.listOfficeName,
      freshnessWindowMinutes: result.source.freshnessWindowMinutes,
      now,
    }).displayReady,
  );
  return { ...result, count: listings.length, listings };
}
