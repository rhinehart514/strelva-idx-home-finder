import type { OutboundEmail } from "./workflow";

type ResendMailOptions = {
  apiKey: string;
  from: string;
  apiUrl?: string;
  fetchImpl?: typeof fetch;
};

export function createResendMailGateway({
  apiKey,
  from,
  apiUrl = "https://api.resend.com/emails",
  fetchImpl = fetch,
}: ResendMailOptions) {
  return async (email: OutboundEmail) => {
    const response = await fetchImpl(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": email.idempotencyKey,
        "User-Agent": "Strelva-Home-Finder/1.0",
      },
      body: JSON.stringify({
        from,
        to: [email.to],
        subject: email.subject,
        text: email.text,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`The mail provider rejected delivery (${response.status}).`);
    }
    const payload: unknown = await response.json();
    if (
      !payload ||
      typeof payload !== "object" ||
      !("id" in payload) ||
      typeof payload.id !== "string"
    ) {
      throw new Error("The mail provider returned an unreadable response.");
    }
    return { providerMessageId: payload.id };
  };
}
