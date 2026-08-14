import { describe, expect, it } from "vitest";
import {
  createListingInquiryToken,
  isValidListingInquiryToken,
} from "./listing-token";

const env = { INQUIRY_SIGNING_KEY: "a-secret-key-that-is-at-least-32-bytes" };

describe("listing inquiry token", () => {
  it("binds the chosen listing to the server installation and address", () => {
    const identity = {
      installationId: "pilot",
      listingId: "listing-1",
      address: "10 Main Street, Buffalo, NY",
    };
    const issuedAt = new Date("2026-08-14T16:00:00.000Z");
    const token = createListingInquiryToken(identity, env, issuedAt);
    expect(isValidListingInquiryToken({ ...identity, token }, env, issuedAt)).toBe(true);
    expect(
      isValidListingInquiryToken(
        { ...identity, address: "20 Main Street", token },
        env,
        issuedAt,
      ),
    ).toBe(false);
    expect(
      isValidListingInquiryToken(
        { ...identity, token },
        env,
        new Date("2026-08-14T16:31:00.000Z"),
      ),
    ).toBe(false);
  });
});
