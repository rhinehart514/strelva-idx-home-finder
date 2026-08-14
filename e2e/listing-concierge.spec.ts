import { expect, test } from "@playwright/test";
import { Webhook } from "svix";
import { createListingInquiryToken } from "../src/lib/inquiries/listing-token";

const inquirySigningEnv = {
  INQUIRY_SIGNING_KEY: "browser-test-signing-key-at-least-32-bytes",
};
const webhookSecret = `whsec_${Buffer.from("browser-test-webhook-secret").toString("base64")}`;

test("buyer can search and preview an inquiry without a network handoff", async ({
  page,
}) => {
  const inquiryPosts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/api/inquiries")) {
      inquiryPosts.push(request.url());
    }
  });

  const response = await page.goto("/embed/agency-preview");
  expect(response?.headers()["content-security-policy"]).toContain(
    "frame-ancestors 'self' http://127.0.0.1:3100 http://localhost:3100",
  );
  await expect(page).toHaveTitle("Agency preview Home Finder");
  await expect(page.getByText(/Strelva/i)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "IDX page check" })).toHaveCount(0);
  await expect(page.getByText("Demonstration listings only.")).toBeVisible();

  await page.locator("#listing-query").fill("14216");
  await page.getByRole("button", { name: "Find homes" }).click();
  await expect(page.getByRole("heading", { name: "1 home" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "202 Example Avenue" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "View 202 Example Avenue" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Demonstration North Buffalo home.",
  );
  await expect(
    page.getByRole("img", { name: "Synthetic preview of 202 Example Avenue" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ask about this home" }).click();
  await expect(page.getByRole("dialog")).toContainText("Browser-only preview");
  await page.getByLabel("Email").fill("demo@example.com");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Preview inquiry" }).click();
  await expect(
    page.getByRole("heading", { name: "Inquiry previewed" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("stayed in your browser");
  expect(inquiryPosts).toEqual([]);
});

test("agency can embed the configured Home Finder on a brokerage host page", async ({
  page,
}) => {
  await page.route("**/brokerage-host-test", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `
    <main>
      <h1>Brokerage website</h1>
      <iframe
        src="http://127.0.0.1:3100/embed/agency-preview"
        title="Agency preview home search"
        width="100%"
        height="900"
      ></iframe>
    </main>
  `,
    }),
  );
  await page.goto("/brokerage-host-test");

  const homeFinder = page.frameLocator(
    'iframe[title="Agency preview home search"]',
  );
  await expect(
    homeFinder.getByRole("heading", { name: "Find the home you mean." }),
  ).toBeVisible();
  await expect(homeFinder.getByText("Demonstration listings only.")).toBeVisible();
  await expect(homeFinder.getByText(/Strelva/i)).toHaveCount(0);
});

test("live inquiry reaches the brokerage and returns an agency receipt", async ({
  page,
  request,
}, testInfo) => {
  const fetchedAt = new Date().toISOString();
  const sourceUpdatedAt = new Date(Date.now() - 30 * 60 * 1_000).toISOString();
  const buyerEmail = `buyer-${testInfo.project.name}@example.com`;
  const inquiryToken = createListingInquiryToken(
    {
      installationId: "pilot-browser-test",
      listingId: "live-listing-1",
      address: "10 Main Street, Buffalo, NY, 14202",
    },
    inquirySigningEnv,
  );
  await page.route("**/api/listings?**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        source: {
          id: "trestle",
          name: "Approved MLS",
          mode: "live",
          isLive: true,
          description: "Live approved inventory",
          freshnessWindowMinutes: 60,
        },
        query: { q: "Buffalo", limit: 12 },
        fetchedAt,
        sourceCheckedAt: fetchedAt,
        latestListingModifiedAt: sourceUpdatedAt,
        count: 1,
        listings: [
          {
            id: "live-listing-1",
            inquiryToken,
            mlsNumber: "B123",
            status: "active",
            propertyType: "house",
            address: {
              line: "10 Main Street",
              city: "Buffalo",
              state: "NY",
              postalCode: "14202",
              latitude: null,
              longitude: null,
            },
            price: 325000,
            bedrooms: 3,
            bathrooms: 2,
            livingAreaSqFt: 1500,
            lotSizeAcres: null,
            yearBuilt: 1920,
            publicRemarks: "A live test listing.",
            photos: [],
            listingUrl: null,
            listAgentName: null,
            listOfficeName: "Listing Brokerage",
            sourceSystemName: "Approved MLS",
            modifiedAt: sourceUpdatedAt,
          },
        ],
      }),
    }),
  );
  await page.goto("/embed/pilot-browser-test");
  await page.getByRole("button", { name: "View 10 Main Street" }).click();
  await page.getByRole("button", { name: "Ask about this home" }).click();
  await page.getByLabel("Email").fill(buyerEmail);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Send inquiry" }).click();
  await expect(page.getByRole("heading", { name: "Inquiry queued" })).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("Request ID");
  const requestText = await page.locator(".inquiry-result__request").textContent();
  const requestId = requestText?.replace("Request ID ", "");
  expect(requestId).toBeTruthy();

  type CapturedEmail = { id: string; to: string[]; text: string };
  let brokerageEmail: CapturedEmail | undefined;
  await expect
    .poll(async () => {
      const emails = (await (
        await request.get("http://127.0.0.1:3101/emails")
      ).json()) as CapturedEmail[];
      brokerageEmail = emails.find(
        ({ to, text }) =>
          to.includes("brokerage@example.com") && text.includes(buyerEmail),
      );
      return brokerageEmail?.id;
    })
    .toBeTruthy();

  const webhookBody = JSON.stringify({
    type: "email.delivered",
    data: { email_id: brokerageEmail!.id },
  });
  const webhookId = `webhook-${requestId}`;
  const webhookTime = new Date();
  const webhookResponse = await request.post(
    "http://127.0.0.1:3100/api/webhooks/resend",
    {
      data: webhookBody,
      headers: {
        "Content-Type": "application/json",
        "svix-id": webhookId,
        "svix-timestamp": String(Math.floor(webhookTime.getTime() / 1_000)),
        "svix-signature": new Webhook(webhookSecret).sign(
          webhookId,
          webhookTime,
          webhookBody,
        ),
      },
    },
  );
  expect(webhookResponse.ok()).toBe(true);

  let agencyReceiptEmail: CapturedEmail | undefined;
  await expect
    .poll(async () => {
      const emails = (await (
        await request.get("http://127.0.0.1:3101/emails")
      ).json()) as CapturedEmail[];
      agencyReceiptEmail = emails.find(
        ({ to, text }) =>
          to.includes("agency@example.com") &&
          text.includes(`Request ID: ${requestId}`) &&
          text.includes("State: delivered"),
      );
      return agencyReceiptEmail?.id;
    })
    .toBeTruthy();
  expect(agencyReceiptEmail!.text).not.toContain(buyerEmail);

  const receiptResponse = await request.get(
    `http://127.0.0.1:3100/api/internal/inquiries/${requestId}`,
    { headers: { Authorization: "Bearer browser-test-worker" } },
  );
  expect(receiptResponse.ok()).toBe(true);
  await expect(receiptResponse.json()).resolves.toMatchObject({
    requestId,
    state: "delivered",
    installationId: "pilot-browser-test",
  });
});
