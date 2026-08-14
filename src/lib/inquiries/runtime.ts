import { resolve } from "node:path";
import {
  getHomeFinderInstallation,
  InstallationNotFoundError,
} from "../installations";
import { createResendMailGateway } from "./resend-mail";
import {
  createInquiryWorkflow,
  createSqliteInquiryStore,
} from "./workflow";

export function readInquiryRuntimeConfig(
  env: Record<string, string | undefined> = process.env,
) {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.HOME_FINDER_FROM_EMAIL?.trim();
  const encodedEncryptionKey = env.INQUIRY_CONTENT_KEY_BASE64?.trim();
  const encryptionKey = encodedEncryptionKey
    ? Buffer.from(encodedEncryptionKey, "base64")
    : null;
  if (!apiKey || !from || !encryptionKey || encryptionKey.byteLength !== 32) {
    throw new Error(
      "Live inquiry delivery requires RESEND_API_KEY, HOME_FINDER_FROM_EMAIL, and a 32-byte INQUIRY_CONTENT_KEY_BASE64.",
    );
  }
  const webhookSecret = env.RESEND_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    throw new Error("Live inquiry delivery requires RESEND_WEBHOOK_SECRET.");
  }
  const apiUrl = env.RESEND_API_URL?.trim() || "https://api.resend.com/emails";
  const parsedApiUrl = new URL(apiUrl);
  const localHttp =
    parsedApiUrl.protocol === "http:" &&
    (parsedApiUrl.hostname === "127.0.0.1" ||
      parsedApiUrl.hostname === "localhost");
  if (parsedApiUrl.protocol !== "https:" && !localHttp) {
    throw new Error("RESEND_API_URL must use HTTPS.");
  }
  return {
    apiKey,
    from,
    encryptionKey,
    webhookSecret,
    apiUrl,
    databasePath: resolve(
      /* turbopackIgnore: true */
      env.INQUIRY_DB_PATH?.trim() || ".data/home-finder-inquiries.sqlite",
    ),
  };
}

let workflow: ReturnType<typeof createInquiryWorkflow> | null = null;

export function getProductionInquiryWorkflow() {
  if (workflow) return workflow;
  const config = readInquiryRuntimeConfig();
  workflow = createInquiryWorkflow({
    store: createSqliteInquiryStore(config),
    resolveInstallation(id) {
      try {
        return getHomeFinderInstallation(id);
      } catch (error) {
        if (error instanceof InstallationNotFoundError) return null;
        throw error;
      }
    },
    sendEmail: createResendMailGateway({
      apiKey: config.apiKey,
      from: config.from,
      apiUrl: config.apiUrl,
    }),
  });
  return workflow;
}
