import { describe, expect, it, vi } from "vitest";
import { createResendMailGateway } from "./resend-mail";

describe("Resend mail boundary", () => {
  it("sends a plain-text email with provider idempotency", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ id: "email-1" }),
    );
    const sendEmail = createResendMailGateway({
      apiKey: "re_test",
      from: "Home Finder <homes@example.com>",
      fetchImpl,
    });

    await expect(
      sendEmail({
        to: "brokerage@example.com",
        subject: "A home inquiry",
        text: "Inquiry content",
        idempotencyKey: "request-1:inquiry",
      }),
    ).resolves.toEqual({ providerMessageId: "email-1" });

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe("https://api.resend.com/emails");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer re_test",
      "Idempotency-Key": "request-1:inquiry",
      "User-Agent": "Strelva-Home-Finder/1.0",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      from: "Home Finder <homes@example.com>",
      to: ["brokerage@example.com"],
      subject: "A home inquiry",
      text: "Inquiry content",
    });
  });
});
