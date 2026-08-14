import { describe, expect, it } from "vitest";
import { validateHomeFinderStartup } from "./startup";

const liveInstallation = {
  id: "pilot",
  mode: "live",
  allowedOrigins: ["https://brokerage.example"],
  brokerage: { name: "Brokerage", logoUrl: null, primaryColor: "#123456" },
  agencyPartner: { name: "Agency", receiptEmail: "agency@example.com" },
  inquiryDestination: "brokerage@example.com",
  defaultSearch: { location: "Buffalo" },
  mls: {
    sourceName: "Approved MLS",
    refreshIntervalMinutes: 60,
    featuredOfficeName: null,
  },
};

describe("Home Finder startup gate", () => {
  it("does nothing for synthetic preview and fails a partially configured live process", () => {
    expect(() => validateHomeFinderStartup({})).not.toThrow();
    expect(() =>
      validateHomeFinderStartup({
        HOME_FINDER_INSTALLATIONS_JSON: JSON.stringify([liveInstallation]),
      }),
    ).toThrow();
  });

  it("accepts a complete live pilot configuration", () => {
    expect(() =>
      validateHomeFinderStartup({
        HOME_FINDER_INSTALLATIONS_JSON: JSON.stringify([liveInstallation]),
        TRESTLE_CLIENT_ID: "client",
        TRESTLE_CLIENT_SECRET: "secret",
        INQUIRY_SIGNING_KEY: "a-signing-key-with-at-least-32-bytes",
        RESEND_API_KEY: "re_test",
        RESEND_WEBHOOK_SECRET: "whsec_test",
        HOME_FINDER_FROM_EMAIL: "sender@example.com",
        INQUIRY_CONTENT_KEY_BASE64: Buffer.alloc(32, 1).toString("base64"),
        INQUIRY_DB_PATH: ".data/test.sqlite",
        INQUIRY_WORKER_SECRET: "worker-secret",
      }),
    ).not.toThrow();
  });
});
