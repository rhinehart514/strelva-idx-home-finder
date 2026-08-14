import { describe, expect, it } from "vitest";
import type { Listing, ListingSearchResult } from "../mls/types";
import { selectDisplayableInventory } from "./displayable-inventory";

const listing = {
  id: "listing-1",
  listOfficeName: "Listing Brokerage",
} as Listing;

function liveResult(
  replacement: Partial<ListingSearchResult> = {},
): ListingSearchResult {
  return {
    source: {
      id: "trestle",
      name: "Approved MLS source",
      mode: "live",
      isLive: true,
      description: "Live",
      freshnessWindowMinutes: 60,
    },
    query: { limit: 12 },
    fetchedAt: "2026-08-14T16:00:00.000Z",
    sourceCheckedAt: "2026-08-14T15:30:00.000Z",
    latestListingModifiedAt: "2026-08-14T15:30:00.000Z",
    count: 1,
    listings: [listing],
    ...replacement,
  };
}

describe("Displayable Inventory boundary", () => {
  it("removes live records before serialization when feed-level or brokerage evidence is invalid", () => {
    const now = new Date("2026-08-14T16:00:00.000Z");
    expect(selectDisplayableInventory(liveResult(), now).listings).toHaveLength(1);
    expect(
      selectDisplayableInventory(
        liveResult({ sourceCheckedAt: "2026-08-14T14:00:00.000Z" }),
        now,
      ),
    ).toMatchObject({ count: 0, listings: [] });
    expect(
      selectDisplayableInventory(
        liveResult({ listings: [{ ...listing, listOfficeName: null }] }),
        now,
      ),
    ).toMatchObject({ count: 0, listings: [] });
  });
});
