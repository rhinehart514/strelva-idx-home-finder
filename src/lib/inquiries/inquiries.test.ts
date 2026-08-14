import { describe, expect, it } from "vitest";
import { InMemoryRateLimiter } from "./rate-limit";
import {
  InquiryValidationError,
  parseInquiryInput,
  parseInquirySubmission,
} from "./validation";

const validInput = {
  listing: {
    id: "R1623456",
    address: "123 Elmwood Ave, Buffalo, NY",
    inquiryToken: "signed-listing-token",
  },
  buyer: { email: "Buyer@Example.com", phone: "+1 (716) 555-0100" },
  message: "Can I tour this Saturday?",
  consent: true,
  agency: { id: "agency-1", name: "Example Realty" },
};

describe("inquiry validation", () => {
  it("accepts an installation ID but never accepts browser-supplied brokerage routing", () => {
    expect(
      parseInquirySubmission({
        ...validInput,
        installationId: "buffalo-pilot",
        submissionId: "123e4567-e89b-42d3-a456-426614174000",
        agency: { id: "attacker", name: "Redirected Brokerage" },
      }),
    ).toEqual({
      installationId: "buffalo-pilot",
      submissionId: "123e4567-e89b-42d3-a456-426614174000",
      listing: validInput.listing,
      buyer: { email: "buyer@example.com", phone: "+1 (716) 555-0100" },
      message: validInput.message,
      consent: true,
    });
  });

  it("normalizes a valid inquiry while keeping the buyer name optional", () => {
    expect(parseInquiryInput(validInput)).toEqual({
      ...validInput,
      listing: {
        id: validInput.listing.id,
        address: validInput.listing.address,
      },
      buyer: { email: "buyer@example.com", phone: "+1 (716) 555-0100" },
    });
  });

  it("requires consent, a reply method, and a message or criteria", () => {
    expect(() =>
      parseInquiryInput({
        listing: { id: "R1", address: "1 Main St" },
        buyer: {},
        consent: false,
        agency: { id: "a1", name: "Agency" },
      }),
    ).toThrow(InquiryValidationError);

    try {
      parseInquiryInput({
        listing: { id: "R1", address: "1 Main St" },
        buyer: {},
        consent: false,
        agency: { id: "a1", name: "Agency" },
      });
    } catch (error) {
      expect(error).toBeInstanceOf(InquiryValidationError);
      expect((error as InquiryValidationError).issues.map(({ field }) => field)).toEqual(
        expect.arrayContaining(["buyer", "message", "consent"]),
      );
    }
  });
});

describe("in-process rate limiting", () => {
  it("blocks requests over the limit until the window resets", () => {
    const limiter = new InMemoryRateLimiter(2, 1_000);

    expect(limiter.consume("buyer", 0).allowed).toBe(true);
    expect(limiter.consume("buyer", 100).allowed).toBe(true);
    expect(limiter.consume("buyer", 200)).toMatchObject({
      allowed: false,
      retryAfterSeconds: 1,
    });
    expect(limiter.consume("buyer", 1_000).allowed).toBe(true);
  });
});
