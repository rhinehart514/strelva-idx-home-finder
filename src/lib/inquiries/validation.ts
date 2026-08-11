import type {
  InquiryInput,
  InquiryValidationIssue,
} from "./types";

const LIMITS = {
  listingId: 160,
  address: 300,
  buyerName: 120,
  email: 254,
  phone: 40,
  message: 2_000,
  criteria: 2_000,
  agencyId: 160,
  agencyName: 160,
  website: 300,
} as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class InquiryValidationError extends Error {
  readonly issues: InquiryValidationIssue[];

  constructor(issues: InquiryValidationIssue[]) {
    super("The inquiry contains invalid or missing information.");
    this.name = "InquiryValidationError";
    this.issues = issues;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(
  record: Record<string, unknown>,
  key: string,
  field: string,
  limit: number,
  issues: InquiryValidationIssue[],
  required: boolean,
): string | undefined {
  const value = record[key];

  if (value === undefined || value === null || value === "") {
    if (required) {
      issues.push({ field, message: "This field is required." });
    }
    return undefined;
  }

  if (typeof value !== "string") {
    issues.push({ field, message: "Use text for this field." });
    return undefined;
  }

  const normalized = value.trim();
  if (!normalized) {
    if (required) {
      issues.push({ field, message: "This field is required." });
    }
    return undefined;
  }

  if (normalized.length > limit) {
    issues.push({
      field,
      message: `Keep this field to ${limit.toLocaleString("en-US")} characters or fewer.`,
    });
    return undefined;
  }

  return normalized;
}

function readObject(
  record: Record<string, unknown>,
  key: string,
  issues: InquiryValidationIssue[],
): Record<string, unknown> {
  const value = record[key];
  if (!isRecord(value)) {
    issues.push({ field: key, message: "This section is required." });
    return {};
  }
  return value;
}

export function parseInquiryInput(value: unknown): InquiryInput {
  if (!isRecord(value)) {
    throw new InquiryValidationError([
      { field: "body", message: "Send the inquiry as a JSON object." },
    ]);
  }

  const issues: InquiryValidationIssue[] = [];
  const listing = readObject(value, "listing", issues);
  const buyer = readObject(value, "buyer", issues);
  const agency = readObject(value, "agency", issues);

  const listingId = readString(
    listing,
    "id",
    "listing.id",
    LIMITS.listingId,
    issues,
    true,
  );
  const address = readString(
    listing,
    "address",
    "listing.address",
    LIMITS.address,
    issues,
    true,
  );
  const buyerName = readString(
    buyer,
    "name",
    "buyer.name",
    LIMITS.buyerName,
    issues,
    false,
  );
  const email = readString(
    buyer,
    "email",
    "buyer.email",
    LIMITS.email,
    issues,
    false,
  );
  const phone = readString(
    buyer,
    "phone",
    "buyer.phone",
    LIMITS.phone,
    issues,
    false,
  );
  const message = readString(
    value,
    "message",
    "message",
    LIMITS.message,
    issues,
    false,
  );
  const criteria = readString(
    value,
    "criteria",
    "criteria",
    LIMITS.criteria,
    issues,
    false,
  );
  const agencyId = readString(
    agency,
    "id",
    "agency.id",
    LIMITS.agencyId,
    issues,
    true,
  );
  const agencyName = readString(
    agency,
    "name",
    "agency.name",
    LIMITS.agencyName,
    issues,
    true,
  );
  const website = readString(
    value,
    "website",
    "website",
    LIMITS.website,
    issues,
    false,
  );

  if (email && !EMAIL_PATTERN.test(email)) {
    issues.push({ field: "buyer.email", message: "Enter a valid email address." });
  }

  if (phone) {
    const digitCount = phone.replace(/\D/g, "").length;
    if (digitCount < 7 || digitCount > 15) {
      issues.push({ field: "buyer.phone", message: "Enter a valid phone number." });
    }
  }

  if (!email && !phone) {
    issues.push({
      field: "buyer",
      message: "Add an email address or phone number so the agency can respond.",
    });
  }

  if (!message && !criteria) {
    issues.push({
      field: "message",
      message: "Add a message or the home criteria you want help with.",
    });
  }

  if (value.consent !== true) {
    issues.push({
      field: "consent",
      message: "Consent is required before this inquiry can be shared.",
    });
  }

  if (issues.length > 0) {
    throw new InquiryValidationError(issues);
  }

  return {
    listing: { id: listingId!, address: address! },
    buyer: {
      ...(buyerName ? { name: buyerName } : {}),
      ...(email ? { email: email.toLowerCase() } : {}),
      ...(phone ? { phone } : {}),
    },
    ...(message ? { message } : {}),
    ...(criteria ? { criteria } : {}),
    consent: true,
    agency: { id: agencyId!, name: agencyName! },
    ...(website ? { website } : {}),
  };
}
