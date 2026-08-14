import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HomeFinderInstallation } from "../installations";
import {
  createInMemoryInquiryStore,
  createInquiryWorkflow,
  createSqliteInquiryStore,
  type InquirySubmission,
  type OutboundEmail,
} from "./workflow";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

const installation: HomeFinderInstallation = {
  id: "buffalo-pilot",
  mode: "live",
  allowedOrigins: ["https://brokerage.example"],
  brokerage: {
    name: "Example Realty",
    logoUrl: null,
    primaryColor: "#123456",
  },
  agencyPartner: {
    name: "Example Web Agency",
    receiptEmail: "support@agency.example",
  },
  inquiryDestination: "homes@brokerage.example",
  defaultSearch: { location: "Buffalo" },
  mls: {
    sourceName: "NYSAMLS via WNYREIS",
    refreshIntervalMinutes: 60,
    featuredOfficeName: "Example Realty",
  },
};

const submission = {
  installationId: "buffalo-pilot",
  listing: { id: "listing-1", address: "10 Main Street, Buffalo, NY" },
  buyer: { name: "A Buyer", email: "buyer@example.com" },
  message: "Can I see this home on Saturday?",
  consent: true,
} satisfies InquirySubmission;

describe("Listing Inquiry workflow", () => {
  it("opens the prior pilot schema safely without retrying jobs that lack immutable routing", async () => {
    const directory = await mkdtemp(join(tmpdir(), "home-finder-migration-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "inquiries.sqlite");
    const legacy = new DatabaseSync(databasePath);
    legacy.exec(`
      CREATE TABLE inquiry_jobs (
        request_id TEXT PRIMARY KEY,
        encrypted_submission TEXT NOT NULL,
        attempts INTEGER NOT NULL,
        next_attempt_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        provider_message_id TEXT
      );
      CREATE TABLE delivery_receipts (
        request_id TEXT PRIMARY KEY,
        installation_id TEXT NOT NULL,
        listing_id TEXT NOT NULL,
        listing_address TEXT NOT NULL,
        destination TEXT NOT NULL,
        state TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        provider_message_id TEXT,
        notification_state TEXT NOT NULL,
        notification_attempts INTEGER NOT NULL,
        next_notification_at TEXT
      );
      INSERT INTO inquiry_jobs VALUES (
        'legacy-job', 'legacy-encrypted-content', 1,
        '2026-08-14T16:00:00.000Z', '2026-08-21T16:00:00.000Z', NULL
      );
    `);
    legacy.close();

    const store = createSqliteInquiryStore({
      databasePath,
      encryptionKey: Buffer.alloc(32, 7),
    });
    await expect(
      store.listPending(new Date("2026-08-15T16:00:00.000Z")),
    ).resolves.toEqual([]);
  });

  it("delivers buyer content only to the Brokerage Account and sends a content-free receipt to the Agency Partner", async () => {
    const sent: OutboundEmail[] = [];
    const sendEmail = vi.fn(async (email: OutboundEmail) => {
      sent.push(email);
      return { providerMessageId: `mail-${sent.length}` };
    });
    const workflow = createInquiryWorkflow({
      store: createInMemoryInquiryStore(),
      resolveInstallation: (id) => (id === installation.id ? installation : null),
      sendEmail,
      now: () => new Date("2026-08-14T16:00:00.000Z"),
      createRequestId: () => "request-1",
    });

    await expect(workflow.submit(submission)).resolves.toEqual({
      status: "pending",
      message: "Your inquiry is queued for delivery. Keep this request ID for reference.",
      requestId: "request-1",
    });

    expect(sent).toHaveLength(2);
    expect(sent[0]).toMatchObject({
      to: "homes@brokerage.example",
      idempotencyKey: "request-1:inquiry:1",
    });
    expect(sent[0]?.text).toContain("buyer@example.com");
    expect(sent[0]?.text).toContain("Can I see this home on Saturday?");
    expect(sent[1]).toMatchObject({
      to: "support@agency.example",
      idempotencyKey: expect.stringContaining("request-1:receipt:pending:"),
    });
    expect(sent[1]?.text).not.toContain("buyer@example.com");
    await workflow.handleProviderEvent("mail-1", "delivered");
    expect(sent).toHaveLength(3);
    expect(sent[2]).toMatchObject({
      to: "support@agency.example",
      idempotencyKey: expect.stringContaining("request-1:receipt:delivered:"),
    });
    expect(sent[2]?.text).toContain("listing-1");
    expect(sent[2]?.text).not.toContain("buyer@example.com");
    expect(sent[2]?.text).not.toContain("Can I see this home on Saturday?");

    await expect(workflow.getReceipt("request-1")).resolves.toMatchObject({
      requestId: "request-1",
      installationId: "buffalo-pilot",
      listingId: "listing-1",
      state: "delivered",
    });
  });

  it("returns pending after a transient failure and completes from the durable queue without duplicate delivery", async () => {
    const directory = await mkdtemp(join(tmpdir(), "home-finder-inquiries-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "inquiries.sqlite");
    const encryptionKey = Buffer.alloc(32, 7);
    const store = createSqliteInquiryStore({ databasePath, encryptionKey });
    const successfulInquiryKeys: string[] = [];
    const successfulInquiryDestinations: string[] = [];
    let failInquiry = true;
    const sendEmail = vi.fn(async (email: OutboundEmail) => {
      if (email.idempotencyKey.includes(":inquiry:") && failInquiry) {
        failInquiry = false;
        throw new Error("mail provider unavailable");
      }
      if (email.idempotencyKey.includes(":inquiry:")) {
        successfulInquiryKeys.push(email.idempotencyKey);
        successfulInquiryDestinations.push(email.to);
      }
      return { providerMessageId: email.idempotencyKey };
    });
    let currentTime = new Date("2026-08-14T16:00:00.000Z");
    const workflow = createInquiryWorkflow({
      store,
      resolveInstallation: () => installation,
      sendEmail,
      now: () => currentTime,
      createRequestId: () => "request-retry",
    });

    await expect(workflow.submit(submission)).resolves.toMatchObject({
      status: "pending",
      requestId: "request-retry",
    });

    currentTime = new Date("2026-08-14T16:05:00.000Z");
    const restartedWorkflow = createInquiryWorkflow({
      store: createSqliteInquiryStore({ databasePath, encryptionKey }),
      resolveInstallation: () => ({
        ...installation,
        inquiryDestination: "changed-routing@example.com",
      }),
      sendEmail,
      now: () => currentTime,
      createRequestId: () => "unused",
    });
    await restartedWorkflow.processPending();
    await restartedWorkflow.handleProviderEvent(
      "request-retry:inquiry:2",
      "delivered",
    );

    await expect(
      restartedWorkflow.getReceipt("request-retry"),
    ).resolves.toMatchObject({
      state: "delivered",
    });
    expect(successfulInquiryKeys).toEqual(["request-retry:inquiry:2"]);
    expect(successfulInquiryDestinations).toEqual(["homes@brokerage.example"]);
  });

  it("returns the existing state when the browser repeats the same submission", async () => {
    const inquiryDeliveries: string[] = [];
    const workflow = createInquiryWorkflow({
      store: createInMemoryInquiryStore(),
      resolveInstallation: () => installation,
      sendEmail: async (email) => {
        if (email.idempotencyKey.includes(":inquiry:")) {
          inquiryDeliveries.push(email.idempotencyKey);
        }
        return { providerMessageId: email.idempotencyKey };
      },
      now: () => new Date("2026-08-14T16:00:00.000Z"),
    });
    const repeated = {
      ...submission,
      submissionId: "123e4567-e89b-42d3-a456-426614174000",
    };

    await Promise.all([
      workflow.submit(repeated),
      workflow.submit({
        ...repeated,
        message: "A changed duplicate must not replace the stored inquiry.",
      }),
    ]);

    expect(inquiryDeliveries).toEqual([
      "123e4567-e89b-42d3-a456-426614174000:inquiry:1",
    ]);
  });

  it("retries a bounced provider message and records delivery only after confirmation", async () => {
    const sent: OutboundEmail[] = [];
    const workflow = createInquiryWorkflow({
      store: createInMemoryInquiryStore(),
      resolveInstallation: () => installation,
      sendEmail: async (email) => {
        sent.push(email);
        return { providerMessageId: `provider-${sent.length}` };
      },
      now: () => new Date("2026-08-14T16:00:00.000Z"),
      createRequestId: () => "request-bounce",
    });

    await workflow.submit(submission);
    await workflow.handleProviderEvent("provider-1", "bounced");
    expect(sent.filter(({ to }) => to === "homes@brokerage.example")).toHaveLength(2);
    expect(
      sent.some(
        ({ to, text }) =>
          to === "support@agency.example" && text.includes("State: bounced"),
      ),
    ).toBe(true);
    await expect(workflow.getReceipt("request-bounce")).resolves.toMatchObject({
      state: "pending",
      providerMessageId: "provider-4",
    });

    await workflow.handleProviderEvent("provider-4", "delivered");
    await expect(workflow.getReceipt("request-bounce")).resolves.toMatchObject({
      state: "delivered",
      providerMessageId: "provider-4",
    });
  });

  it("durably retries the Agency Partner's content-free receipt notification", async () => {
    let currentTime = new Date("2026-08-14T16:00:00.000Z");
    let receiptAttempts = 0;
    let allowReceipt = false;
    const workflow = createInquiryWorkflow({
      store: createInMemoryInquiryStore(),
      resolveInstallation: () => installation,
      sendEmail: async (email) => {
        if (email.idempotencyKey.includes(":receipt:")) {
          receiptAttempts += 1;
          if (!allowReceipt) throw new Error("mail provider unavailable");
        }
        return { providerMessageId: email.idempotencyKey };
      },
      now: () => currentTime,
      createRequestId: () => "request-receipt-retry",
    });

    await workflow.submit(submission);
    await workflow.handleProviderEvent(
      "request-receipt-retry:inquiry:1",
      "delivered",
    );
    await expect(workflow.getReceipt("request-receipt-retry")).resolves.toMatchObject({
      state: "delivered",
      notificationState: "pending",
    });

    allowReceipt = true;
    currentTime = new Date("2026-08-14T16:05:00.000Z");
    await workflow.processPending();
    expect(receiptAttempts).toBe(3);
    await expect(workflow.getReceipt("request-receipt-retry")).resolves.toMatchObject({
      notificationState: "sent",
    });
  });

  it("never sends expired Inquiry Content and removes an expired Delivery Receipt through maintenance", async () => {
    const store = createInMemoryInquiryStore();
    const inquiryAttempts: string[] = [];
    let currentTime = new Date("2026-08-14T16:00:00.000Z");
    const workflow = createInquiryWorkflow({
      store,
      resolveInstallation: () => installation,
      sendEmail: async (email) => {
        if (email.idempotencyKey.includes(":inquiry:")) {
          inquiryAttempts.push(email.idempotencyKey);
          throw new Error("mail provider unavailable");
        }
        return { providerMessageId: email.idempotencyKey };
      },
      now: () => currentTime,
      createRequestId: () => "request-expiring",
    });

    await workflow.submit(submission);
    expect(inquiryAttempts).toHaveLength(1);

    currentTime = new Date("2026-08-22T16:00:00.000Z");
    await workflow.processPending();
    expect(inquiryAttempts).toHaveLength(1);
    await expect(workflow.getReceipt("request-expiring")).resolves.toMatchObject({
      state: "failed",
    });

    currentTime = new Date("2027-08-23T16:00:00.000Z");
    await workflow.performMaintenance();
    await expect(workflow.getReceipt("request-expiring")).resolves.toBeNull();
  });
});
