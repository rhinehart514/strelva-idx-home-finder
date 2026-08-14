import { MlsError } from "./errors";
import { buildTrestleFilter } from "./query";
import type {
  Listing,
  ListingPhoto,
  ListingPropertyType,
  ListingSearchQuery,
  ListingSearchResult,
  ListingSource,
  ListingStatus,
  MlsProvider,
} from "./types";

export const TRESTLE_TOKEN_URL =
  "https://api.cotality.com/trestle/oidc/connect/token";
export const TRESTLE_PROPERTY_URL =
  "https://api.cotality.com/trestle/odata/Property";

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_PHOTOS_PER_LISTING = 12;

const PROPERTY_FIELDS = [
  "ListingKey",
  "ListingId",
  "StandardStatus",
  "PropertyType",
  "PropertySubType",
  "UnparsedAddress",
  "StreetNumber",
  "StreetName",
  "StreetSuffix",
  "City",
  "PostalCity",
  "StateOrProvince",
  "PostalCode",
  "Latitude",
  "Longitude",
  "ListPrice",
  "BedroomsTotal",
  "BathroomsTotalInteger",
  "BathroomsFull",
  "BathroomsHalf",
  "LivingArea",
  "LotSizeAcres",
  "YearBuilt",
  "PublicRemarks",
  "InternetAddressDisplayYN",
  "InternetEntireListingDisplayYN",
  "VirtualTourURLUnbranded",
  "ListAgentFullName",
  "ListOfficeName",
  "OriginatingSystemName",
  "ModificationTimestamp",
].join(",");

type Fetcher = typeof fetch;

type TrestleProviderOptions = {
  clientId: string;
  clientSecret: string;
  sourceName?: string;
  freshnessWindowMinutes?: number;
  fetcher?: Fetcher;
  now?: () => number;
  timeoutMs?: number;
};

type CachedToken = {
  value: string;
  refreshAfter: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function numberValue(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function booleanValue(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "boolean" ? value : null;
}

function safeUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function isoDate(value: string | null) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function normalizeStatus(value: string | null): ListingStatus {
  const normalized = value?.replace(/[\s_-]/g, "").toLocaleLowerCase("en-US");
  switch (normalized) {
    case "active":
      return "active";
    case "comingsoon":
      return "coming-soon";
    case "activeundercontract":
      return "active-under-contract";
    case "pending":
      return "pending";
    case "closed":
      return "closed";
    case "withdrawn":
    case "expired":
    case "canceled":
    case "cancelled":
      return "off-market";
    default:
      return "unknown";
  }
}

function normalizePropertyType(
  propertyType: string | null,
  propertySubType: string | null,
): ListingPropertyType {
  const value = `${propertyType ?? ""} ${propertySubType ?? ""}`
    .replace(/[\s_-]/g, "")
    .toLocaleLowerCase("en-US");

  if (value.includes("condominium") || value.includes("condo")) return "condo";
  if (value.includes("townhouse") || value.includes("townhome")) {
    return "townhouse";
  }
  if (value.includes("duplex") || value.includes("triplex") || value.includes("multifamily")) {
    return "multi-family";
  }
  if (value.includes("manufactured") || value.includes("mobile")) {
    return "manufactured";
  }
  if (value.includes("land")) return "land";
  if (value.includes("commercial") || value.includes("business")) {
    return "commercial";
  }
  if (value.includes("residential") || value.includes("singlefamily")) {
    return "house";
  }
  return "other";
}

function normalizePhotos(value: unknown, address: string): ListingPhoto[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isRecord)
    .map((media, index) => ({
      url: safeUrl(stringValue(media, "MediaURL")),
      alt: stringValue(media, "ShortDescription") ?? address,
      order: numberValue(media, "Order") ?? index,
      category: stringValue(media, "MediaCategory"),
    }))
    .filter(
      (photo): photo is ListingPhoto & { category: string | null } =>
        photo.url !== null &&
        (photo.category === null || photo.category.toLocaleLowerCase("en-US") === "photo"),
    )
    .sort((left, right) => left.order - right.order)
    .slice(0, MAX_PHOTOS_PER_LISTING)
    .map(({ url, alt, order }) => ({ url, alt, order }));
}

export function normalizeTrestleListing(value: unknown): Listing | null {
  if (!isRecord(value)) return null;
  if (booleanValue(value, "InternetEntireListingDisplayYN") !== true) return null;

  const id = stringValue(value, "ListingKey");
  const price = numberValue(value, "ListPrice");
  if (!id || price === null || price < 0) return null;

  const line =
    stringValue(value, "UnparsedAddress") ??
    [
      stringValue(value, "StreetNumber"),
      stringValue(value, "StreetName"),
      stringValue(value, "StreetSuffix"),
    ]
      .filter((part): part is string => part !== null)
      .join(" ");
  const bathrooms =
    numberValue(value, "BathroomsTotalInteger") ??
    (() => {
      const full = numberValue(value, "BathroomsFull");
      const half = numberValue(value, "BathroomsHalf");
      return full === null && half === null ? null : (full ?? 0) + (half ?? 0) * 0.5;
    })();
  const latitude = numberValue(value, "Latitude");
  const longitude = numberValue(value, "Longitude");
  const canDisplayAddress = booleanValue(value, "InternetAddressDisplayYN") === true;
  const normalizedLine = canDisplayAddress
    ? line || "Address available from brokerage"
    : "Address withheld by seller";

  return {
    id,
    mlsNumber: stringValue(value, "ListingId"),
    status: normalizeStatus(stringValue(value, "StandardStatus")),
    propertyType: normalizePropertyType(
      stringValue(value, "PropertyType"),
      stringValue(value, "PropertySubType"),
    ),
    address: {
      line: normalizedLine,
      city: stringValue(value, "City", "PostalCity") ?? "",
      state: stringValue(value, "StateOrProvince") ?? "",
      postalCode: stringValue(value, "PostalCode") ?? "",
      latitude:
        canDisplayAddress && latitude !== null && latitude >= -90 && latitude <= 90
          ? latitude
          : null,
      longitude:
        canDisplayAddress &&
        longitude !== null &&
        longitude >= -180 &&
        longitude <= 180
          ? longitude
          : null,
    },
    price,
    bedrooms: numberValue(value, "BedroomsTotal"),
    bathrooms,
    livingAreaSqFt: numberValue(value, "LivingArea"),
    lotSizeAcres: numberValue(value, "LotSizeAcres"),
    yearBuilt: numberValue(value, "YearBuilt"),
    publicRemarks: stringValue(value, "PublicRemarks"),
    photos: normalizePhotos(value.Media, normalizedLine),
    listingUrl: safeUrl(stringValue(value, "VirtualTourURLUnbranded")),
    listAgentName: stringValue(value, "ListAgentFullName"),
    listOfficeName: stringValue(value, "ListOfficeName"),
    sourceSystemName: stringValue(value, "OriginatingSystemName"),
    modifiedAt: isoDate(stringValue(value, "ModificationTimestamp")),
  };
}

export function buildTrestlePropertyUrl(query: ListingSearchQuery) {
  const url = new URL(TRESTLE_PROPERTY_URL);
  url.searchParams.set("$select", PROPERTY_FIELDS);
  url.searchParams.set("$filter", buildTrestleFilter(query));
  url.searchParams.set("$orderby", "ModificationTimestamp desc");
  url.searchParams.set("$top", String(query.limit));
  url.searchParams.set(
    "$expand",
    "Media($select=MediaURL,ShortDescription,MediaCategory,Order;$orderby=Order;$top=12)",
  );
  url.searchParams.set("PrettyEnums", "true");
  return url;
}

async function parseJson(response: Response) {
  try {
    return (await response.json()) as unknown;
  } catch (cause) {
    throw new MlsError(
      "invalid_response",
      "The listing provider returned an unreadable response.",
      502,
      true,
      { cause },
    );
  }
}

export class TrestleMlsProvider implements MlsProvider {
  readonly source: ListingSource;

  private readonly fetcher: Fetcher;
  private readonly now: () => number;
  private readonly timeoutMs: number;
  private token: CachedToken | null = null;
  private tokenRequest: Promise<string> | null = null;

  constructor(private readonly options: TrestleProviderOptions) {
    this.source = {
      id: "trestle",
      name: options.sourceName ?? "Authorized MLS source via Trestle",
      mode: "live",
      isLive: true,
      description:
        "Authorized listing data from the connected Trestle feed. Available records and display rights are controlled by the MLS agreement.",
      freshnessWindowMinutes: options.freshnessWindowMinutes ?? null,
    };
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? Date.now;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  private async fetchWithTimeout(url: string | URL, init: RequestInit) {
    try {
      return await this.fetcher(url, {
        ...init,
        cache: "no-store",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (cause) {
      if (
        cause instanceof Error &&
        ["AbortError", "TimeoutError"].includes(cause.name)
      ) {
        throw new MlsError(
          "timeout",
          "The listing provider did not respond in time.",
          504,
          true,
          { cause },
        );
      }
      throw new MlsError(
        "upstream",
        "The listing provider could not be reached.",
        502,
        true,
        { cause },
      );
    }
  }

  private async requestToken() {
    const body = new URLSearchParams({
      client_id: this.options.clientId,
      client_secret: this.options.clientSecret,
      grant_type: "client_credentials",
      scope: "api",
    });
    const response = await this.fetchWithTimeout(TRESTLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    if (!response.ok) {
      throw new MlsError(
        "authentication",
        "The Trestle connection could not be authenticated.",
        502,
        false,
      );
    }

    const payload = await parseJson(response);
    if (!isRecord(payload)) {
      throw new MlsError(
        "invalid_response",
        "The listing provider returned an invalid authentication response.",
        502,
        true,
      );
    }
    const accessToken = stringValue(payload, "access_token");
    const expiresIn = numberValue(payload, "expires_in");
    if (!accessToken || expiresIn === null || expiresIn <= 0) {
      throw new MlsError(
        "invalid_response",
        "The listing provider returned an invalid authentication response.",
        502,
        true,
      );
    }

    const lifetimeMs = expiresIn * 1_000;
    const safetyWindowMs = Math.min(60_000, lifetimeMs * 0.1);
    this.token = {
      value: accessToken,
      refreshAfter: this.now() + lifetimeMs - safetyWindowMs,
    };
    return accessToken;
  }

  private async getToken(forceRefresh = false) {
    if (forceRefresh) this.token = null;
    if (this.token && this.now() < this.token.refreshAfter) return this.token.value;
    if (this.tokenRequest) return this.tokenRequest;

    this.tokenRequest = this.requestToken().finally(() => {
      this.tokenRequest = null;
    });
    return this.tokenRequest;
  }

  private async fetchListings(query: ListingSearchQuery, token: string) {
    return this.fetchWithTimeout(buildTrestlePropertyUrl(query), {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
  }

  async searchListings(query: ListingSearchQuery): Promise<ListingSearchResult> {
    let response = await this.fetchListings(query, await this.getToken());
    if (response.status === 401) {
      response = await this.fetchListings(query, await this.getToken(true));
    }

    if (response.status === 401 || response.status === 403) {
      throw new MlsError(
        "authentication",
        "The Trestle connection is not authorized for this listing feed.",
        502,
        false,
      );
    }
    if (response.status === 429) {
      throw new MlsError(
        "rate_limited",
        "The listing provider is temporarily rate limited. Try again shortly.",
        503,
        true,
      );
    }
    if (!response.ok) {
      throw new MlsError(
        "upstream",
        "The listing provider could not complete this search.",
        502,
        response.status >= 500,
      );
    }

    const payload = await parseJson(response);
    if (!isRecord(payload) || !Array.isArray(payload.value)) {
      throw new MlsError(
        "invalid_response",
        "The listing provider returned an unexpected data shape.",
        502,
        true,
      );
    }

    const listings = payload.value
      .map(normalizeTrestleListing)
      .filter((listing): listing is Listing => listing !== null);
    const latestListingModifiedAt = listings.reduce<string | null>((latest, listing) => {
      if (!listing.modifiedAt) return latest;
      return !latest || listing.modifiedAt > latest ? listing.modifiedAt : latest;
    }, null);
    const sourceResponseDate = response.headers.get("date");
    const parsedSourceResponseDate = sourceResponseDate
      ? new Date(sourceResponseDate)
      : null;
    const sourceCheckedAt =
      parsedSourceResponseDate && !Number.isNaN(parsedSourceResponseDate.getTime())
        ? parsedSourceResponseDate.toISOString()
        : null;

    return {
      source: this.source,
      query,
      fetchedAt: new Date(this.now()).toISOString(),
      sourceCheckedAt,
      latestListingModifiedAt,
      count: listings.length,
      listings,
    };
  }
}
