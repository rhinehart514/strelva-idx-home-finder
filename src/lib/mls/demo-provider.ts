import type {
  Listing,
  ListingSearchQuery,
  ListingSearchResult,
  ListingSource,
  MlsProvider,
} from "./types";

const DEMO_UPDATED_AT = "2026-08-11T12:00:00.000Z";

export const DEMO_SOURCE: ListingSource = {
  id: "demo",
  name: "Strelva demonstration data",
  mode: "demo",
  isLive: false,
  description:
    "Deterministic sample listings for product evaluation. These are not MLS records and are not available properties.",
};

const DEMO_LISTINGS: readonly Listing[] = [
  {
    id: "demo-elmwood-01",
    mlsNumber: null,
    status: "active",
    propertyType: "house",
    address: {
      line: "101 Sample Street",
      city: "Buffalo",
      state: "NY",
      postalCode: "14222",
      latitude: 42.9181,
      longitude: -78.8765,
    },
    price: 489_000,
    bedrooms: 4,
    bathrooms: 2.5,
    livingAreaSqFt: 2_184,
    lotSizeAcres: 0.12,
    yearBuilt: 1912,
    publicRemarks: "Demonstration home near Elmwood Village.",
    photos: [],
    listingUrl: null,
    listAgentName: null,
    listOfficeName: "Demonstration brokerage",
    sourceSystemName: "Strelva demo",
    modifiedAt: DEMO_UPDATED_AT,
  },
  {
    id: "demo-north-buffalo-02",
    mlsNumber: null,
    status: "coming-soon",
    propertyType: "house",
    address: {
      line: "202 Example Avenue",
      city: "Buffalo",
      state: "NY",
      postalCode: "14216",
      latitude: 42.9514,
      longitude: -78.8532,
    },
    price: 369_000,
    bedrooms: 3,
    bathrooms: 1.5,
    livingAreaSqFt: 1_628,
    lotSizeAcres: 0.1,
    yearBuilt: 1925,
    publicRemarks: "Demonstration North Buffalo home.",
    photos: [],
    listingUrl: null,
    listAgentName: null,
    listOfficeName: "Demonstration brokerage",
    sourceSystemName: "Strelva demo",
    modifiedAt: DEMO_UPDATED_AT,
  },
  {
    id: "demo-williamsville-03",
    mlsNumber: null,
    status: "active",
    propertyType: "condo",
    address: {
      line: "303 Placeholder Lane",
      city: "Williamsville",
      state: "NY",
      postalCode: "14221",
      latitude: 42.9639,
      longitude: -78.7381,
    },
    price: 279_000,
    bedrooms: 2,
    bathrooms: 2,
    livingAreaSqFt: 1_240,
    lotSizeAcres: null,
    yearBuilt: 2007,
    publicRemarks: "Demonstration condominium in Williamsville.",
    photos: [],
    listingUrl: null,
    listAgentName: null,
    listOfficeName: "Demonstration brokerage",
    sourceSystemName: "Strelva demo",
    modifiedAt: DEMO_UPDATED_AT,
  },
  {
    id: "demo-hamburg-04",
    mlsNumber: null,
    status: "active-under-contract",
    propertyType: "house",
    address: {
      line: "404 Prototype Road",
      city: "Hamburg",
      state: "NY",
      postalCode: "14075",
      latitude: 42.7159,
      longitude: -78.8295,
    },
    price: 549_000,
    bedrooms: 4,
    bathrooms: 3,
    livingAreaSqFt: 2_610,
    lotSizeAcres: 0.42,
    yearBuilt: 1998,
    publicRemarks: "Demonstration home in Hamburg.",
    photos: [],
    listingUrl: null,
    listAgentName: null,
    listOfficeName: "Demonstration brokerage",
    sourceSystemName: "Strelva demo",
    modifiedAt: DEMO_UPDATED_AT,
  },
];

function includes(value: string, search: string) {
  return value.toLocaleLowerCase("en-US").includes(search);
}

export class DemoMlsProvider implements MlsProvider {
  readonly source = DEMO_SOURCE;

  constructor(private readonly now: () => Date = () => new Date()) {}

  async searchListings(query: ListingSearchQuery): Promise<ListingSearchResult> {
    const search = query.q?.toLocaleLowerCase("en-US");
    const city = query.city?.toLocaleLowerCase("en-US");

    const listings = DEMO_LISTINGS.filter((listing) => {
      const searchable = `${listing.address.line} ${listing.address.city} ${listing.address.postalCode}`;
      return (
        (!search || includes(searchable, search)) &&
        (!city || listing.address.city.toLocaleLowerCase("en-US") === city) &&
        (query.minPrice === undefined || listing.price >= query.minPrice) &&
        (query.maxPrice === undefined || listing.price <= query.maxPrice) &&
        (query.minBeds === undefined ||
          (listing.bedrooms !== null && listing.bedrooms >= query.minBeds)) &&
        (query.minBaths === undefined ||
          (listing.bathrooms !== null && listing.bathrooms >= query.minBaths))
      );
    })
      .sort((left, right) => left.id.localeCompare(right.id))
      .slice(0, query.limit);

    return {
      source: this.source,
      query,
      fetchedAt: this.now().toISOString(),
      latestListingModifiedAt: DEMO_UPDATED_AT,
      count: listings.length,
      listings: listings.map((listing) => structuredClone(listing)),
    };
  }
}
