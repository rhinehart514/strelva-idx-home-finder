import { defineConfig, devices } from "@playwright/test";

const testInstallations = [
  {
    id: "agency-preview",
    mode: "demo",
    allowedOrigins: ["http://127.0.0.1:3100", "http://localhost:3100"],
    brokerage: { name: "Agency preview", logoUrl: null, primaryColor: "#d65a31" },
    agencyPartner: { name: "Agency preview", receiptEmail: null },
    inquiryDestination: null,
    defaultSearch: { location: "" },
    mls: { sourceName: null, refreshIntervalMinutes: null, featuredOfficeName: null },
  },
  {
    id: "pilot-browser-test",
    mode: "live",
    allowedOrigins: ["http://127.0.0.1:3100"],
    brokerage: { name: "Example Realty", logoUrl: null, primaryColor: "#123456" },
    agencyPartner: { name: "Example Agency", receiptEmail: "agency@example.com" },
    inquiryDestination: "brokerage@example.com",
    defaultSearch: { location: "Buffalo" },
    mls: {
      sourceName: "Approved MLS",
      refreshIntervalMinutes: 60,
      featuredOfficeName: "Example Realty",
    },
  },
];
const webhookSecret = `whsec_${Buffer.from("browser-test-webhook-secret").toString("base64")}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:3100",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["iPhone 15 Pro"], browserName: "chromium" } },
  ],
  webServer: [
    {
      command: "node e2e/support-server.mjs",
      url: "http://127.0.0.1:3101/emails",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "pnpm dev --port 3100",
      url: "http://127.0.0.1:3100",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        HOME_FINDER_INSTALLATIONS_JSON: JSON.stringify(testInstallations),
        TRESTLE_CLIENT_ID: "browser-test",
        TRESTLE_CLIENT_SECRET: "browser-test",
        INQUIRY_SIGNING_KEY: "browser-test-signing-key-at-least-32-bytes",
        RESEND_API_KEY: "re_browser_test",
        RESEND_API_URL: "http://127.0.0.1:3101/emails",
        RESEND_WEBHOOK_SECRET: webhookSecret,
        HOME_FINDER_FROM_EMAIL: "sender@example.com",
        INQUIRY_CONTENT_KEY_BASE64: Buffer.alloc(32, 2).toString("base64"),
        INQUIRY_DB_PATH: ".data/e2e-home-finder.sqlite",
        INQUIRY_WORKER_SECRET: "browser-test-worker",
      },
    },
  ],
});
