import { createHmac, timingSafeEqual } from "node:crypto";

type ListingIdentity = {
  installationId: string;
  listingId: string;
  address: string;
};

function signingKey(env: Record<string, string | undefined>) {
  const key = env.INQUIRY_SIGNING_KEY?.trim();
  if (!key || Buffer.byteLength(key) < 32) {
    throw new Error("Live inquiries require an INQUIRY_SIGNING_KEY of at least 32 bytes.");
  }
  return key;
}

function payload(identity: ListingIdentity, expiresAt: number) {
  return [
    identity.installationId,
    identity.listingId,
    identity.address,
    expiresAt,
  ].join("\u0000");
}

export function createListingInquiryToken(
  identity: ListingIdentity,
  env: Record<string, string | undefined> = process.env,
  now = new Date(),
) {
  const expiresAt = Math.floor(now.getTime() / 1_000) + 30 * 60;
  const signature = createHmac("sha256", signingKey(env))
    .update(payload(identity, expiresAt))
    .digest("base64url");
  return `${expiresAt}.${signature}`;
}

export function isValidListingInquiryToken(
  identity: ListingIdentity & { token: string },
  env: Record<string, string | undefined> = process.env,
  now = new Date(),
) {
  const [expiresAtValue, signature] = identity.token.split(".");
  const expiresAt = Number(expiresAtValue);
  if (!signature || !Number.isInteger(expiresAt) || expiresAt < now.getTime() / 1_000) {
    return false;
  }
  const expected = createHmac("sha256", signingKey(env))
    .update(payload(identity, expiresAt))
    .digest("base64url");
  const supplied = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  return (
    supplied.byteLength === expectedBytes.byteLength &&
    timingSafeEqual(supplied, expectedBytes)
  );
}
