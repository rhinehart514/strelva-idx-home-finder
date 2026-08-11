import type {
  InquiryInput,
  InquiryResult,
  InquiryWebhookPayload,
} from "./types";

const DELIVERY_TIMEOUT_MS = 5_000;

export type InquiryDeliveryConfig =
  | { mode: "preview" }
  | { mode: "live"; webhookUrl?: string };

type DeliveryOptions = {
  config?: InquiryDeliveryConfig;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  requestId?: string;
  timeoutMs?: number;
};

export function getInquiryDeliveryConfig(
  env: NodeJS.ProcessEnv = process.env,
): InquiryDeliveryConfig {
  if (env.AGENCY_LEAD_DELIVERY_MODE !== "live") {
    return { mode: "preview" };
  }

  return { mode: "live", webhookUrl: env.AGENCY_LEAD_WEBHOOK_URL };
}

function unavailable(requestId: string): InquiryResult {
  return {
    status: "unavailable",
    message:
      "The agency could not receive this inquiry right now. Your information was not delivered.",
    requestId,
  };
}

export async function deliverInquiry(
  inquiry: InquiryInput,
  options: DeliveryOptions = {},
): Promise<InquiryResult> {
  const config = options.config ?? getInquiryDeliveryConfig();
  const requestId = options.requestId ?? crypto.randomUUID();

  // The honeypot is intentionally acknowledged without forwarding buyer data.
  if (inquiry.website) {
    return {
      status: "preview",
      message: "This inquiry was not sent.",
      requestId,
    };
  }

  if (config.mode === "preview") {
    return {
      status: "preview",
      message:
        "Preview only — this inquiry was not sent to an agency. Live lead delivery is not configured.",
      requestId,
    };
  }

  if (!config.webhookUrl) return unavailable(requestId);

  let webhookUrl: URL;
  try {
    webhookUrl = new URL(config.webhookUrl);
  } catch {
    return unavailable(requestId);
  }

  if (webhookUrl.protocol !== "https:") return unavailable(requestId);

  const payload: InquiryWebhookPayload = {
    listing: inquiry.listing,
    buyer: inquiry.buyer,
    ...(inquiry.message ? { message: inquiry.message } : {}),
    ...(inquiry.criteria ? { criteria: inquiry.criteria } : {}),
    consent: true,
    agency: inquiry.agency,
    requestId,
    submittedAt: (options.now ?? (() => new Date()))().toISOString(),
  };
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DELIVERY_TIMEOUT_MS,
  );

  try {
    const response = await (options.fetchImpl ?? fetch)(webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "Strelva-Agency-Inquiry/1.0",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });

    if (!response.ok) return unavailable(requestId);

    return {
      status: "delivered",
      message: `Your inquiry was delivered to ${inquiry.agency.name}.`,
      requestId,
    };
  } catch {
    return unavailable(requestId);
  } finally {
    clearTimeout(timeout);
  }
}
