import { describe, expect, it } from "vitest";
import { readMlsConfig } from "./config";
import { DemoMlsProvider } from "./demo-provider";
import { MlsError } from "./errors";
import {
  buildTrestleFilter,
  escapeODataString,
  parseListingSearchQuery,
} from "./query";
import {
  TRESTLE_PROPERTY_URL,
  TRESTLE_TOKEN_URL,
  TrestleMlsProvider,
} from "./trestle-provider";
import type { ListingSearchQuery } from "./types";

describe("listing search input", () => {
  it("normalizes supported filters and aliases", () => {
    const query = parseListingSearchQuery(
      new URLSearchParams(
        "q= Elmwood++Village &city= Buffalo &minPrice=250000&maxPrice=700000&beds=3&baths=1.5&limit=8",
      ),
    );

    expect(query).toEqual({
      q: "Elmwood Village",
      city: "Buffalo",
      minPrice: 250_000,
      maxPrice: 700_000,
      minBeds: 3,
      minBaths: 1.5,
      limit: 8,
    });
  });

  it("rejects invalid ranges before they reach a provider", () => {
    expect(() =>
      parseListingSearchQuery(
        new URLSearchParams("minPrice=500000&maxPrice=200000"),
      ),
    ).toThrow("minPrice cannot be greater than maxPrice");
    expect(() =>
      parseListingSearchQuery(new URLSearchParams("limit=500")),
    ).toThrow("limit must be a whole number between 1 and 50");
  });
});

describe("safe Trestle query construction", () => {
  it("escapes OData string literals and never accepts a raw filter", () => {
    expect(escapeODataString("O'Brien")).toBe("'O''Brien'");

    const filter = buildTrestleFilter({
      q: "O'Brien') or ListPrice gt 0 or ('",
      city: "Buffalo",
      minPrice: 200_000,
      limit: 10,
    });

    expect(filter).toContain("o''brien'') or listprice gt 0 or (''");
    expect(filter).toContain("tolower(City) eq 'buffalo'");
    expect(filter).toContain("ListPrice ge 200000");
    expect(filter).toMatch(/^StandardStatus in/);
  });
});

describe("demo provider", () => {
  it("is deterministic, filterable, and unmistakably not live MLS data", async () => {
    const provider = new DemoMlsProvider(
      () => new Date("2026-08-11T15:30:00.000Z"),
    );
    const query: ListingSearchQuery = {
      city: "Buffalo",
      minBeds: 4,
      limit: 12,
    };

    const first = await provider.searchListings(query);
    const second = await provider.searchListings(query);

    expect(first).toEqual(second);
    expect(first.source).toMatchObject({ mode: "demo", isLive: false });
    expect(first.source.description).toContain("not MLS records");
    expect(first.listings).toHaveLength(1);
    expect(first.listings[0]?.id).toBe("demo-elmwood-01");
  });
});

describe("Trestle provider", () => {
  it("uses current Cotality endpoints, caches OAuth tokens, and normalizes records", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      const url = input.toString();
      requests.push({ url, init });

      if (url === TRESTLE_TOKEN_URL) {
        return Response.json({
          access_token: "token-one",
          expires_in: 28_800,
          token_type: "Bearer",
        });
      }

      return Response.json({
        value: [
          {
            ListingKey: "source-listing-key",
            ListingId: "B123456",
            StandardStatus: "Active Under Contract",
            PropertyType: "Residential",
            PropertySubType: "Single Family Residence",
            UnparsedAddress: "12 Oak Street",
            City: "Buffalo",
            StateOrProvince: "NY",
            PostalCode: "14201",
            Latitude: 42.9,
            Longitude: -78.87,
            ListPrice: 425000,
            BedroomsTotal: 3,
            BathroomsFull: 2,
            BathroomsHalf: 1,
            LivingArea: 1800,
            ListOfficeName: "Broker Office",
            OriginatingSystemName: "Authorized MLS",
            InternetEntireListingDisplayYN: true,
            InternetAddressDisplayYN: false,
            ModificationTimestamp: "2026-08-11T13:15:00Z",
            Media: [
              {
                MediaURL: "https://images.example.test/second.jpg",
                MediaCategory: "Photo",
                Order: 2,
              },
              {
                MediaURL: "https://images.example.test/first.jpg",
                MediaCategory: "Photo",
                Order: 1,
              },
              {
                MediaURL: "javascript:alert(1)",
                MediaCategory: "Photo",
                Order: 0,
              },
            ],
          },
          {
            ListingKey: "seller-withheld-listing",
            ListPrice: 300000,
            InternetEntireListingDisplayYN: false,
          },
        ],
      });
    };
    const provider = new TrestleMlsProvider({
      clientId: "client-id",
      clientSecret: "client-secret",
      fetcher,
      now: () => Date.parse("2026-08-11T14:00:00Z"),
    });
    const query = { city: "Buffalo", limit: 10 } satisfies ListingSearchQuery;

    const first = await provider.searchListings(query);
    await provider.searchListings(query);

    expect(requests.filter(({ url }) => url === TRESTLE_TOKEN_URL)).toHaveLength(1);
    expect(requests.filter(({ url }) => url.startsWith(TRESTLE_PROPERTY_URL))).toHaveLength(2);
    const tokenBody = requests[0]?.init?.body;
    expect(tokenBody).toBeInstanceOf(URLSearchParams);
    expect((tokenBody as URLSearchParams).get("grant_type")).toBe(
      "client_credentials",
    );
    const propertyRequest = requests[1];
    expect(propertyRequest?.init?.headers).toMatchObject({
      Authorization: "Bearer token-one",
    });
    const propertyUrl = new URL(propertyRequest?.url ?? "");
    expect(propertyUrl.searchParams.get("$filter")).toContain(
      "tolower(City) eq 'buffalo'",
    );
    expect(propertyUrl.searchParams.get("$top")).toBe("10");

    expect(first.source).toMatchObject({ mode: "live", isLive: true });
    expect(first.fetchedAt).toBe("2026-08-11T14:00:00.000Z");
    expect(first.latestListingModifiedAt).toBe("2026-08-11T13:15:00.000Z");
    expect(first.listings[0]).toMatchObject({
      id: "source-listing-key",
      mlsNumber: "B123456",
      status: "active-under-contract",
      propertyType: "house",
      bathrooms: 2.5,
      listOfficeName: "Broker Office",
      address: {
        line: "Address withheld by seller",
        latitude: null,
        longitude: null,
      },
    });
    expect(first.listings).toHaveLength(1);
    expect(first.listings[0]?.photos.map(({ order }) => order)).toEqual([1, 2]);
  });

  it("types timeouts without exposing provider internals", async () => {
    const fetcher: typeof fetch = async () => {
      throw new DOMException("timed out", "TimeoutError");
    };
    const provider = new TrestleMlsProvider({
      clientId: "client-id",
      clientSecret: "client-secret",
      fetcher,
    });

    await expect(provider.searchListings({ limit: 10 })).rejects.toMatchObject({
      code: "timeout",
      status: 504,
      retryable: true,
    });
  });
});

describe("environment configuration", () => {
  it("defaults honestly to demo and fails closed for incomplete live mode", () => {
    expect(readMlsConfig({})).toEqual({ provider: "demo" });

    try {
      readMlsConfig({ MLS_PROVIDER: "trestle", TRESTLE_CLIENT_ID: "id" });
      throw new Error("Expected readMlsConfig to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(MlsError);
      expect(error).toMatchObject({ code: "configuration", status: 503 });
    }
  });
});
