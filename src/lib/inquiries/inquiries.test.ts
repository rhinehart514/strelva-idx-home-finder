import { describe, expect, it, vi } from "vitest";
import { deliverInquiry } from "./delivery";
import { InMemoryRateLimiter } from "./rate-limit";
import { InquiryValidationError, parseInquiryInput } from "./validation";

const validInput = {
  listing: { id: "R1623456", address: "123 Elmwood Ave, Buffalo, NY" },
  buyer: { email: "Buyer@Example.com", phone: "+1 (716) 555-0100" },
  message: "Can I tour this Saturday?",
  consent: true,
  agency: { id: "agency-1", name: "Example Realty" },
};

describe("inquiry validation", () => {
  it("normalizes a valid inquiry while keeping the buyer name optional", () => {
    expect(parseInquiryInput(validInput)).toEqual({
      ...validInput,
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

describe("inquiry delivery", () => {
  it("does not transmit in the default preview mode", async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(
      deliverInquiry(parseInquiryInput(validInput), {
        config: { mode: "preview" },
        fetchImpl,
        requestId: "request-preview",
      }),
    ).resolves.toMatchObject({
      status: "preview",
      message: expect.stringContaining("not sent"),
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("posts the consented inquiry to a configured HTTPS webhook", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, { status: 204 }),
    );

    const result = await deliverInquiry(parseInquiryInput(validInput), {
      config: { mode: "live", webhookUrl: "https://agency.example/leads" },
      fetchImpl,
      now: () => new Date("2026-08-11T12:00:00.000Z"),
      requestId: "request-live",
    });

    expect(result.status).toBe("delivered");
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe("https://agency.example/leads");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      listing: validInput.listing,
      buyer: { email: "buyer@example.com" },
      consent: true,
      requestId: "request-live",
      submittedAt: "2026-08-11T12:00:00.000Z",
    });
  });

  it("reports unavailable when live delivery is not usable", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const inquiry = parseInquiryInput(validInput);

    await expect(
      deliverInquiry(inquiry, {
        config: { mode: "live" },
        fetchImpl,
        requestId: "request-missing",
      }),
    ).resolves.toMatchObject({ status: "unavailable" });
    await expect(
      deliverInquiry(inquiry, {
        config: { mode: "live", webhookUrl: "http://agency.example/leads" },
        fetchImpl,
        requestId: "request-insecure",
      }),
    ).resolves.toMatchObject({ status: "unavailable" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("stops a webhook that exceeds the delivery timeout", async () => {
    const fetchImpl = vi.fn<typeof fetch>((_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      }),
    );

    await expect(
      deliverInquiry(parseInquiryInput(validInput), {
        config: { mode: "live", webhookUrl: "https://agency.example/leads" },
        fetchImpl,
        requestId: "request-timeout",
        timeoutMs: 5,
      }),
    ).resolves.toMatchObject({ status: "unavailable" });
  });

  it("never forwards a honeypot submission", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const inquiry = parseInquiryInput({ ...validInput, website: "spam.example" });

    await expect(
      deliverInquiry(inquiry, {
        config: { mode: "live", webhookUrl: "https://agency.example/leads" },
        fetchImpl,
      }),
    ).resolves.toMatchObject({ status: "preview" });
    expect(fetchImpl).not.toHaveBeenCalled();
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
