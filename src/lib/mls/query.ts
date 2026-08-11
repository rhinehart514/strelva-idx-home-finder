import { invalidQuery } from "./errors";
import type { ListingSearchQuery } from "./types";

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 50;
const MAX_TEXT_LENGTH = 80;

function readSingle(params: URLSearchParams, names: string[]) {
  for (const name of names) {
    const values = params.getAll(name);
    if (values.length > 1) {
      throw invalidQuery(`Use ${name} only once.`);
    }
    if (values.length === 1) return values[0];
  }
  return undefined;
}

function readText(params: URLSearchParams, name: string) {
  const raw = readSingle(params, [name]);
  if (raw === undefined) return undefined;

  const value = raw.trim().replace(/\s+/g, " ");
  if (!value) return undefined;
  if (value.length > MAX_TEXT_LENGTH) {
    throw invalidQuery(`${name} must be ${MAX_TEXT_LENGTH} characters or fewer.`);
  }
  return value;
}

function readNumber(
  params: URLSearchParams,
  names: string[],
  options: { min: number; max: number; integer?: boolean },
) {
  const raw = readSingle(params, names);
  if (raw === undefined || raw.trim() === "") return undefined;

  const value = Number(raw);
  const valid =
    Number.isFinite(value) &&
    value >= options.min &&
    value <= options.max &&
    (!options.integer || Number.isInteger(value));

  if (!valid) {
    throw invalidQuery(
      `${names[0]} must be ${options.integer ? "a whole number" : "a number"} between ${options.min} and ${options.max}.`,
    );
  }

  return value;
}

export function parseListingSearchQuery(
  params: URLSearchParams,
): ListingSearchQuery {
  const query: ListingSearchQuery = {
    limit:
      readNumber(params, ["limit"], {
        min: 1,
        max: MAX_LIMIT,
        integer: true,
      }) ?? DEFAULT_LIMIT,
  };

  const q = readText(params, "q");
  const city = readText(params, "city");
  const minPrice = readNumber(params, ["minPrice"], {
    min: 0,
    max: 100_000_000,
    integer: true,
  });
  const maxPrice = readNumber(params, ["maxPrice"], {
    min: 0,
    max: 100_000_000,
    integer: true,
  });
  const minBeds = readNumber(params, ["minBeds", "beds"], {
    min: 0,
    max: 20,
  });
  const minBaths = readNumber(params, ["minBaths", "baths"], {
    min: 0,
    max: 20,
  });

  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    throw invalidQuery("minPrice cannot be greater than maxPrice.");
  }

  if (q !== undefined) query.q = q;
  if (city !== undefined) query.city = city;
  if (minPrice !== undefined) query.minPrice = minPrice;
  if (maxPrice !== undefined) query.maxPrice = maxPrice;
  if (minBeds !== undefined) query.minBeds = minBeds;
  if (minBaths !== undefined) query.minBaths = minBaths;

  return query;
}

export function escapeODataString(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

export function buildTrestleFilter(query: ListingSearchQuery) {
  const filters = [
    "StandardStatus in ('Active','ComingSoon','ActiveUnderContract','Pending')",
  ];

  if (query.q) {
    const value = escapeODataString(query.q.toLocaleLowerCase("en-US"));
    filters.push(
      `(contains(tolower(UnparsedAddress),${value}) or contains(tolower(City),${value}) or contains(PostalCode,${value}))`,
    );
  }
  if (query.city) {
    filters.push(
      `tolower(City) eq ${escapeODataString(query.city.toLocaleLowerCase("en-US"))}`,
    );
  }
  if (query.minPrice !== undefined) filters.push(`ListPrice ge ${query.minPrice}`);
  if (query.maxPrice !== undefined) filters.push(`ListPrice le ${query.maxPrice}`);
  if (query.minBeds !== undefined) {
    filters.push(`BedroomsTotal ge ${query.minBeds}`);
  }
  if (query.minBaths !== undefined) {
    filters.push(`BathroomsTotalInteger ge ${query.minBaths}`);
  }

  return filters.join(" and ");
}
