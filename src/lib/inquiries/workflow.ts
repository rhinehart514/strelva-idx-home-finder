import type { HomeFinderInstallation } from "../installations";
import type { InquiryResult } from "./types";

export type InquirySubmission = {
  submissionId?: string;
  installationId: string;
  listing: { id: string; address: string; inquiryToken?: string };
  buyer: { name?: string; email?: string; phone?: string };
  message?: string;
  criteria?: string;
  consent: true;
  website?: string;
};

export type OutboundEmail = {
  to: string;
  subject: string;
  text: string;
  idempotencyKey: string;
};

export type DeliveryReceipt = {
  requestId: string;
  installationId: string;
  listingId: string;
  listingAddress: string;
  destination: string;
  agencyReceiptDestination: string;
  state: "pending" | "delivered" | "bounced" | "failed";
  occurredAt: string;
  expiresAt: string;
  providerMessageId: string | null;
  notificationState: "pending" | "sent";
  notificationAttempts: number;
  nextNotificationAt: string | null;
};

export type InquiryStore = {
  createJob(job: StoredInquiryJob): Promise<boolean>;
  saveJob(job: StoredInquiryJob): Promise<void>;
  listPending(now: Date): Promise<StoredInquiryJob[]>;
  deleteJob(requestId: string): Promise<void>;
  saveReceipt(receipt: DeliveryReceipt): Promise<void>;
  getReceipt(requestId: string): Promise<DeliveryReceipt | null>;
  findJobByProviderMessageId(
    providerMessageId: string,
  ): Promise<StoredInquiryJob | null>;
  listReceiptsPendingNotification(now: Date): Promise<DeliveryReceipt[]>;
  purgeExpired(now: Date): Promise<{ jobs: number; receipts: number }>;
};

export type StoredInquiryJob = {
  requestId: string;
  submission: InquirySubmission;
  attempts: number;
  nextAttemptAt: string;
  expiresAt: string;
  providerMessageId: string | null;
  routing: {
    brokerageName: string;
    inquiryDestination: string;
    agencyReceiptDestination: string;
  };
};

type WorkflowDependencies = {
  store: InquiryStore;
  resolveInstallation(id: string): HomeFinderInstallation | null;
  sendEmail(
    email: OutboundEmail,
  ): Promise<{ providerMessageId: string }>;
  now?: () => Date;
  createRequestId?: () => string;
};

export function createInMemoryInquiryStore(): InquiryStore {
  const receipts = new Map<string, DeliveryReceipt>();
  const jobs = new Map<string, StoredInquiryJob>();
  return {
    async createJob(job) {
      if (jobs.has(job.requestId)) return false;
      jobs.set(job.requestId, structuredClone(job));
      return true;
    },
    async saveJob(job) {
      jobs.set(job.requestId, structuredClone(job));
    },
    async listPending(now) {
      return [...jobs.values()]
        .filter((job) => new Date(job.nextAttemptAt) <= now)
        .map((job) => structuredClone(job));
    },
    async deleteJob(requestId) {
      jobs.delete(requestId);
    },
    async saveReceipt(receipt) {
      receipts.set(receipt.requestId, structuredClone(receipt));
    },
    async getReceipt(requestId) {
      const receipt = receipts.get(requestId);
      return receipt ? structuredClone(receipt) : null;
    },
    async findJobByProviderMessageId(providerMessageId) {
      const job = [...jobs.values()].find(
        (candidate) => candidate.providerMessageId === providerMessageId,
      );
      return job ? structuredClone(job) : null;
    },
    async listReceiptsPendingNotification(now) {
      return [...receipts.values()]
        .filter(
          (receipt) =>
            receipt.notificationState === "pending" &&
            receipt.nextNotificationAt !== null &&
            new Date(receipt.nextNotificationAt) <= now,
        )
        .map((receipt) => structuredClone(receipt));
    },
    async purgeExpired(now) {
      let expiredJobs = 0;
      let expiredReceipts = 0;
      for (const [requestId, job] of jobs) {
        if (new Date(job.expiresAt) <= now) {
          jobs.delete(requestId);
          expiredJobs += 1;
        }
      }
      for (const [requestId, receipt] of receipts) {
        if (new Date(receipt.expiresAt) <= now) {
          receipts.delete(requestId);
          expiredReceipts += 1;
        }
      }
      return { jobs: expiredJobs, receipts: expiredReceipts };
    },
  };
}

export { createSqliteInquiryStore } from "./sqlite-store";

function inquiryEmail(
  submission: InquirySubmission,
  routing: StoredInquiryJob["routing"],
  requestId: string,
  attempt: number,
): OutboundEmail {
  const buyer = [
    submission.buyer.name ? `Name: ${submission.buyer.name}` : null,
    submission.buyer.email ? `Email: ${submission.buyer.email}` : null,
    submission.buyer.phone ? `Phone: ${submission.buyer.phone}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return {
    to: routing.inquiryDestination,
    subject: `Home inquiry: ${submission.listing.address}`,
    text: [
      `A buyer asked ${routing.brokerageName} about a home.`,
      "",
      `Listing: ${submission.listing.address}`,
      `Listing ID: ${submission.listing.id}`,
      buyer,
      submission.message ? `Message: ${submission.message}` : null,
      submission.criteria ? `Search criteria: ${submission.criteria}` : null,
      "",
      `Request ID: ${requestId}`,
      "Consent to contact: yes",
    ]
      .filter((line) => line !== null)
      .join("\n"),
    idempotencyKey: `${requestId}:inquiry:${attempt}`,
  };
}

function receiptEmail(
  receipt: DeliveryReceipt,
): OutboundEmail {
  return {
    to: receipt.agencyReceiptDestination,
    subject: `Home Finder delivery ${receipt.state}: ${receipt.requestId}`,
    text: [
      `Installation: ${receipt.installationId}`,
      `Listing ID: ${receipt.listingId}`,
      `Listing: ${receipt.listingAddress}`,
      `Destination: ${receipt.destination}`,
      `State: ${receipt.state}`,
      `Time: ${receipt.occurredAt}`,
      `Request ID: ${receipt.requestId}`,
    ].join("\n"),
    idempotencyKey: `${receipt.requestId}:receipt:${receipt.state}:${receipt.occurredAt}`,
  };
}

export function createInquiryWorkflow(dependencies: WorkflowDependencies) {
  const now = dependencies.now ?? (() => new Date());
  const createRequestId =
    dependencies.createRequestId ?? (() => crypto.randomUUID());

  async function notifyReceipt(
    receipt: DeliveryReceipt,
  ) {
    try {
      await dependencies.sendEmail(receiptEmail(receipt));
      await dependencies.store.saveReceipt({
        ...receipt,
        notificationState: "sent",
        notificationAttempts: receipt.notificationAttempts + 1,
        nextNotificationAt: null,
      });
    } catch {
      const attempts = receipt.notificationAttempts + 1;
      await dependencies.store.saveReceipt({
        ...receipt,
        notificationAttempts: attempts,
        nextNotificationAt: new Date(
          now().getTime() + Math.min(60 * 2 ** attempts, 60 * 60) * 1_000,
        ).toISOString(),
      });
    }
  }

  async function attemptDelivery(job: StoredInquiryJob) {
    const attemptedAt = now();
    if (attemptedAt >= new Date(job.expiresAt) || job.attempts >= 5) {
      const receipt: DeliveryReceipt = {
        requestId: job.requestId,
        installationId: job.submission.installationId,
        listingId: job.submission.listing.id,
        listingAddress: job.submission.listing.address,
        destination: job.routing.inquiryDestination,
        agencyReceiptDestination: job.routing.agencyReceiptDestination,
        state: "failed",
        occurredAt: attemptedAt.toISOString(),
        expiresAt: new Date(
          attemptedAt.getTime() + 365 * 24 * 60 * 60 * 1_000,
        ).toISOString(),
        providerMessageId: job.providerMessageId,
        notificationState: "pending",
        notificationAttempts: 0,
        nextNotificationAt: attemptedAt.toISOString(),
      };
      await dependencies.store.deleteJob(job.requestId);
      await dependencies.store.saveReceipt(receipt);
      await notifyReceipt(receipt);
      return receipt;
    }

    try {
      const sent = await dependencies.sendEmail(
        inquiryEmail(
          job.submission,
          job.routing,
          job.requestId,
          job.attempts + 1,
        ),
      );
      const receipt: DeliveryReceipt = {
        requestId: job.requestId,
        installationId: job.submission.installationId,
        listingId: job.submission.listing.id,
        listingAddress: job.submission.listing.address,
        destination: job.routing.inquiryDestination,
        agencyReceiptDestination: job.routing.agencyReceiptDestination,
        state: "pending",
        occurredAt: attemptedAt.toISOString(),
        expiresAt: new Date(
          attemptedAt.getTime() + 365 * 24 * 60 * 60 * 1_000,
        ).toISOString(),
        providerMessageId: sent.providerMessageId,
        notificationState: "pending",
        notificationAttempts: 0,
        nextNotificationAt: null,
      };
      await dependencies.store.saveJob({
        ...job,
        attempts: job.attempts + 1,
        nextAttemptAt: job.expiresAt,
        providerMessageId: sent.providerMessageId,
      });
      await dependencies.store.saveReceipt(receipt);
      await notifyReceipt(receipt);
      return receipt;
    } catch {
      const attempts = job.attempts + 1;
      const expired = attemptedAt >= new Date(job.expiresAt);
      const state = expired || attempts >= 5 ? "failed" : "pending";
      const receipt: DeliveryReceipt = {
        requestId: job.requestId,
        installationId: job.submission.installationId,
        listingId: job.submission.listing.id,
        listingAddress: job.submission.listing.address,
        destination: job.routing.inquiryDestination,
        agencyReceiptDestination: job.routing.agencyReceiptDestination,
        state,
        occurredAt: attemptedAt.toISOString(),
        expiresAt: new Date(
          attemptedAt.getTime() + 365 * 24 * 60 * 60 * 1_000,
        ).toISOString(),
        providerMessageId: null,
        notificationState: "pending",
        notificationAttempts: 0,
        nextNotificationAt: attemptedAt.toISOString(),
      };
      if (state === "failed") {
        await dependencies.store.deleteJob(job.requestId);
      } else {
        await dependencies.store.saveJob({
          ...job,
          attempts,
          providerMessageId: null,
          nextAttemptAt: new Date(
            attemptedAt.getTime() + Math.min(60 * 2 ** attempts, 60 * 60) * 1_000,
          ).toISOString(),
        });
      }
      await dependencies.store.saveReceipt(receipt);
      await notifyReceipt(receipt);
      return receipt;
    }
  }

  return {
    async submit(submission: InquirySubmission): Promise<InquiryResult> {
      const installation = dependencies.resolveInstallation(
        submission.installationId,
      );
      const requestId = submission.submissionId ?? createRequestId();

      if (submission.website || installation?.mode === "demo") {
        return {
          status: "preview",
          message: "This preview was not sent or stored.",
          requestId,
        };
      }

      if (
        !installation ||
        !installation.inquiryDestination ||
        !installation.agencyPartner.receiptEmail
      ) {
        return {
          status: "unavailable",
          message:
            "The brokerage could not receive this inquiry right now. Your information was not delivered.",
          requestId,
        };
      }

      const existingReceipt = await dependencies.store.getReceipt(requestId);
      if (existingReceipt) {
        return {
          status:
            existingReceipt.state === "failed"
              ? "unavailable"
              : existingReceipt.state === "bounced"
                ? "pending"
                : existingReceipt.state,
          message:
            existingReceipt.state === "delivered"
              ? `Your inquiry was delivered to ${installation.brokerage.name}.`
              : existingReceipt.state === "pending" ||
                  existingReceipt.state === "bounced"
                ? "Your inquiry is queued for delivery. Keep this request ID for reference."
                : "The brokerage could not receive this inquiry. Your information was not delivered.",
          requestId,
        };
      }
      const submittedAt = now();
      const job: StoredInquiryJob = {
        requestId,
        submission,
        attempts: 0,
        nextAttemptAt: submittedAt.toISOString(),
        expiresAt: new Date(
          submittedAt.getTime() + 7 * 24 * 60 * 60 * 1_000,
        ).toISOString(),
        providerMessageId: null,
        routing: {
          brokerageName: installation.brokerage.name,
          inquiryDestination: installation.inquiryDestination,
          agencyReceiptDestination: installation.agencyPartner.receiptEmail,
        },
      };
      if (!(await dependencies.store.createJob(job))) {
        return {
          status: "pending",
          message:
            "Your inquiry is queued for delivery. Keep this request ID for reference.",
          requestId,
        };
      }
      const receipt = await attemptDelivery(job);
      if (!receipt) {
        return {
          status: "unavailable",
          message:
            "The brokerage could not receive this inquiry right now. Your information was not delivered.",
          requestId,
        };
      }

      if (receipt.state === "pending") {
        return {
          status: "pending",
          message:
            "Your inquiry is queued for delivery. Keep this request ID for reference.",
          requestId,
        };
      }

      if (receipt.state === "failed") {
        return {
          status: "unavailable",
          message:
            "The brokerage could not receive this inquiry. Your information was not delivered.",
          requestId,
        };
      }

      return {
        status: "delivered",
        message: `Your inquiry was delivered to ${installation.brokerage.name}.`,
        requestId,
      };
    },

    getReceipt(requestId: string) {
      return dependencies.store.getReceipt(requestId);
    },

    async handleProviderEvent(
      providerMessageId: string,
      event: "delivered" | "bounced" | "failed",
    ) {
      const job = await dependencies.store.findJobByProviderMessageId(
        providerMessageId,
      );
      if (!job) return null;
      if (event !== "delivered") {
        const occurredAt = now();
        const attemptReceipt: DeliveryReceipt = {
          requestId: job.requestId,
          installationId: job.submission.installationId,
          listingId: job.submission.listing.id,
          listingAddress: job.submission.listing.address,
          destination: job.routing.inquiryDestination,
          agencyReceiptDestination: job.routing.agencyReceiptDestination,
          state: event === "bounced" ? "bounced" : "failed",
          occurredAt: occurredAt.toISOString(),
          expiresAt: new Date(
            occurredAt.getTime() + 365 * 24 * 60 * 60 * 1_000,
          ).toISOString(),
          providerMessageId,
          notificationState: "pending",
          notificationAttempts: 0,
          nextNotificationAt: occurredAt.toISOString(),
        };
        await dependencies.store.saveReceipt(attemptReceipt);
        await notifyReceipt(attemptReceipt);
        await dependencies.store.saveJob({
          ...job,
          providerMessageId: null,
          nextAttemptAt: now().toISOString(),
        });
        return attemptDelivery({
          ...job,
          providerMessageId: null,
          nextAttemptAt: now().toISOString(),
        });
      }
      const occurredAt = now();
      const receipt: DeliveryReceipt = {
        requestId: job.requestId,
        installationId: job.submission.installationId,
        listingId: job.submission.listing.id,
        listingAddress: job.submission.listing.address,
        destination: job.routing.inquiryDestination,
        agencyReceiptDestination: job.routing.agencyReceiptDestination,
        state: "delivered",
        occurredAt: occurredAt.toISOString(),
        expiresAt: new Date(
          occurredAt.getTime() + 365 * 24 * 60 * 60 * 1_000,
        ).toISOString(),
        providerMessageId,
        notificationState: "pending",
        notificationAttempts: 0,
        nextNotificationAt: occurredAt.toISOString(),
      };
      await dependencies.store.deleteJob(job.requestId);
      await dependencies.store.saveReceipt(receipt);
      await notifyReceipt(receipt);
      return receipt;
    },

    async processPending() {
      const jobs = await dependencies.store.listPending(now());
      for (const job of jobs) await attemptDelivery(job);
      const receipts = await dependencies.store.listReceiptsPendingNotification(
        now(),
      );
      for (const receipt of receipts) {
        await notifyReceipt(receipt);
      }
      return { inquiries: jobs.length, receipts: receipts.length };
    },

    performMaintenance() {
      return dependencies.store.purgeExpired(now());
    },
  };
}
