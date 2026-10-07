export type ListingStatus =
  | "active"
  | "coming-soon"
  | "active-under-contract"
  | "pending"
  | "closed"
  | "off-market"
  | "unknown";

export type ListingPropertyType =
  | "house"
  | "condo"
  | "townhouse"
  | "multi-family"
  | "manufactured"
  | "land"
  | "commercial"
  | "other";

export type ListingPhoto = {
  url: string;
  alt: string;
  order: number;
};

export type ListingAddress = {
  line: string;
  city: string;
  state: string;
  postalCode: string;
  latitude: number | null;
  longitude: number | null;
};

export type Listing = {
  id: string;
  inquiryToken?: string;
  mlsNumber: string | null;
  status: ListingStatus;
  propertyType: ListingPropertyType;
  address: ListingAddress;
  price: number;
  bedrooms: number | null;
  bathrooms: number | null;
  livingAreaSqFt: number | null;
  lotSizeAcres: number | null;
  yearBuilt: number | null;
  publicRemarks: string | null;
  photos: ListingPhoto[];
  listingUrl: string | null;
  listAgentName: string | null;
  listOfficeName: string | null;
  coListOfficeName: string | null;
  /** Listing participant-supplied phone/email; never the inquiry destination. */
  attributionContact: string | null;
  sourceSystemName: string | null;
  modifiedAt: string | null;
};

export type ListingSearchQuery = {
  q?: string;
  city?: string;
  minPrice?: number;
  maxPrice?: number;
  minBeds?: number;
  minBaths?: number;
  limit: number;
};

export type ListingSource = {
  id: "demo" | "trestle";
  name: string;
  mode: "demo" | "live";
  isLive: boolean;
  description: string;
  freshnessWindowMinutes: number | null;
};

export type ListingSearchResult = {
  source: ListingSource;
  query: ListingSearchQuery;
  fetchedAt: string;
  sourceCheckedAt: string | null;
  latestListingModifiedAt: string | null;
  count: number;
  listings: Listing[];
};

export interface MlsProvider {
  readonly source: ListingSource;
  searchListings(query: ListingSearchQuery): Promise<ListingSearchResult>;
}
