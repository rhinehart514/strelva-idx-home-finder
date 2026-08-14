import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  DeliveryReceipt,
  InquiryStore,
  StoredInquiryJob,
} from "./workflow";

type SqliteStoreOptions = {
  databasePath: string;
  encryptionKey: Uint8Array;
};

type JobRow = {
  request_id: string;
  encrypted_submission: string;
  attempts: number;
  next_attempt_at: string;
  expires_at: string;
  provider_message_id: string | null;
};

type ReceiptRow = {
  request_id: string;
  installation_id: string;
  listing_id: string;
  listing_address: string;
  destination: string;
  agency_receipt_destination: string;
  state: DeliveryReceipt["state"];
  occurred_at: string;
  expires_at: string;
  provider_message_id: string | null;
  notification_state: DeliveryReceipt["notificationState"];
  notification_attempts: number;
  next_notification_at: string | null;
};

function encrypt(value: unknown, encryptionKey: Uint8Array) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), ciphertext]
    .map((part) => part.toString("base64url"))
    .join(".");
}

function decrypt<T>(value: string, encryptionKey: Uint8Array): T {
  const [ivValue, tagValue, ciphertextValue] = value.split(".");
  if (!ivValue || !tagValue || !ciphertextValue) {
    throw new Error("Stored Inquiry Content is unreadable.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey,
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}

export function createSqliteInquiryStore({
  databasePath,
  encryptionKey,
}: SqliteStoreOptions): InquiryStore {
  if (encryptionKey.byteLength !== 32) {
    throw new Error("Inquiry Content encryption requires a 32-byte key.");
  }
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS inquiry_jobs (
      request_id TEXT PRIMARY KEY,
      encrypted_submission TEXT NOT NULL,
      attempts INTEGER NOT NULL,
      next_attempt_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      provider_message_id TEXT
    );
    CREATE TABLE IF NOT EXISTS delivery_receipts (
      request_id TEXT PRIMARY KEY,
      installation_id TEXT NOT NULL,
      listing_id TEXT NOT NULL,
      listing_address TEXT NOT NULL,
      destination TEXT NOT NULL,
      agency_receipt_destination TEXT NOT NULL,
      state TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      provider_message_id TEXT,
      notification_state TEXT NOT NULL,
      notification_attempts INTEGER NOT NULL,
      next_notification_at TEXT
    );
  `);
  const receiptColumns = database
    .prepare("PRAGMA table_info(delivery_receipts)")
    .all() as Array<{ name: string }>;
  if (
    !receiptColumns.some(({ name }) => name === "agency_receipt_destination")
  ) {
    database.exec(`
      ALTER TABLE delivery_receipts
        ADD COLUMN agency_receipt_destination TEXT NOT NULL DEFAULT '';
      DELETE FROM inquiry_jobs;
    `);
  }

  const saveJob = database.prepare(`
    INSERT INTO inquiry_jobs (
      request_id, encrypted_submission, attempts, next_attempt_at, expires_at,
      provider_message_id
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(request_id) DO UPDATE SET
      encrypted_submission = excluded.encrypted_submission,
      attempts = excluded.attempts,
      next_attempt_at = excluded.next_attempt_at,
      expires_at = excluded.expires_at,
      provider_message_id = excluded.provider_message_id
  `);
  const createJob = database.prepare(`
    INSERT INTO inquiry_jobs (
      request_id, encrypted_submission, attempts, next_attempt_at, expires_at,
      provider_message_id
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(request_id) DO NOTHING
  `);
  const listPending = database.prepare(`
    SELECT request_id, encrypted_submission, attempts, next_attempt_at, expires_at,
      provider_message_id
    FROM inquiry_jobs
    WHERE next_attempt_at <= ?
    ORDER BY next_attempt_at ASC
    LIMIT 50
  `);
  const deleteJob = database.prepare(
    "DELETE FROM inquiry_jobs WHERE request_id = ?",
  );
  const saveReceipt = database.prepare(`
    INSERT INTO delivery_receipts (
      request_id, installation_id, listing_id, listing_address, destination,
      agency_receipt_destination, state, occurred_at, expires_at,
      provider_message_id, notification_state,
      notification_attempts, next_notification_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(request_id) DO UPDATE SET
      state = excluded.state,
      occurred_at = excluded.occurred_at,
      expires_at = excluded.expires_at,
      provider_message_id = excluded.provider_message_id,
      notification_state = excluded.notification_state,
      notification_attempts = excluded.notification_attempts,
      next_notification_at = excluded.next_notification_at
  `);
  const getReceipt = database.prepare(`
    SELECT request_id, installation_id, listing_id, listing_address,
      destination, agency_receipt_destination, state, occurred_at, expires_at,
      provider_message_id,
      notification_state, notification_attempts, next_notification_at
    FROM delivery_receipts WHERE request_id = ?
  `);
  const purgeExpiredJobs = database.prepare(
    "DELETE FROM inquiry_jobs WHERE expires_at <= ?",
  );
  const purgeExpiredReceipts = database.prepare(
    "DELETE FROM delivery_receipts WHERE expires_at <= ?",
  );
  const findJobByProviderMessageId = database.prepare(`
    SELECT request_id, encrypted_submission, attempts, next_attempt_at, expires_at,
      provider_message_id
    FROM inquiry_jobs WHERE provider_message_id = ?
  `);
  const listReceiptsPendingNotification = database.prepare(`
    SELECT request_id, installation_id, listing_id, listing_address,
      destination, agency_receipt_destination, state, occurred_at, expires_at,
      provider_message_id,
      notification_state, notification_attempts, next_notification_at
    FROM delivery_receipts
    WHERE notification_state = 'pending'
      AND agency_receipt_destination <> ''
      AND next_notification_at <= ?
    ORDER BY next_notification_at ASC
    LIMIT 50
  `);

  return {
    async createJob(job) {
      return (
        Number(createJob.run(
          job.requestId,
          encrypt(
            { submission: job.submission, routing: job.routing },
            encryptionKey,
          ),
          job.attempts,
          job.nextAttemptAt,
          job.expiresAt,
          job.providerMessageId,
        ).changes) === 1
      );
    },
    async saveJob(job) {
      saveJob.run(
        job.requestId,
        encrypt(
          { submission: job.submission, routing: job.routing },
          encryptionKey,
        ),
        job.attempts,
        job.nextAttemptAt,
        job.expiresAt,
        job.providerMessageId,
      );
    },
    async listPending(now) {
      return (listPending.all(now.toISOString()) as JobRow[]).map((row) => {
        const encrypted = decrypt<
          Pick<StoredInquiryJob, "submission" | "routing">
        >(row.encrypted_submission, encryptionKey);
        return {
          requestId: row.request_id,
          ...encrypted,
          attempts: row.attempts,
          nextAttemptAt: row.next_attempt_at,
          expiresAt: row.expires_at,
          providerMessageId: row.provider_message_id,
        };
      });
    },
    async deleteJob(requestId) {
      deleteJob.run(requestId);
    },
    async saveReceipt(receipt) {
      saveReceipt.run(
        receipt.requestId,
        receipt.installationId,
        receipt.listingId,
        receipt.listingAddress,
        receipt.destination,
        receipt.agencyReceiptDestination,
        receipt.state,
        receipt.occurredAt,
        receipt.expiresAt,
        receipt.providerMessageId,
        receipt.notificationState,
        receipt.notificationAttempts,
        receipt.nextNotificationAt,
      );
    },
    async getReceipt(requestId) {
      const row = getReceipt.get(requestId) as ReceiptRow | undefined;
      if (!row) return null;
      return {
        requestId: row.request_id,
        installationId: row.installation_id,
        listingId: row.listing_id,
        listingAddress: row.listing_address,
        destination: row.destination,
        agencyReceiptDestination: row.agency_receipt_destination,
        state: row.state,
        occurredAt: row.occurred_at,
        expiresAt: row.expires_at,
        providerMessageId: row.provider_message_id,
        notificationState: row.notification_state,
        notificationAttempts: row.notification_attempts,
        nextNotificationAt: row.next_notification_at,
      };
    },
    async findJobByProviderMessageId(providerMessageId) {
      const row = findJobByProviderMessageId.get(providerMessageId) as
        | JobRow
        | undefined;
      if (!row) return null;
      const encrypted = decrypt<
        Pick<StoredInquiryJob, "submission" | "routing">
      >(row.encrypted_submission, encryptionKey);
      return {
        requestId: row.request_id,
        ...encrypted,
        attempts: row.attempts,
        nextAttemptAt: row.next_attempt_at,
        expiresAt: row.expires_at,
        providerMessageId: row.provider_message_id,
      };
    },
    async listReceiptsPendingNotification(now) {
      return (
        listReceiptsPendingNotification.all(now.toISOString()) as ReceiptRow[]
      ).map((row) => ({
        requestId: row.request_id,
        installationId: row.installation_id,
        listingId: row.listing_id,
        listingAddress: row.listing_address,
        destination: row.destination,
        agencyReceiptDestination: row.agency_receipt_destination,
        state: row.state,
        occurredAt: row.occurred_at,
        expiresAt: row.expires_at,
        providerMessageId: row.provider_message_id,
        notificationState: row.notification_state,
        notificationAttempts: row.notification_attempts,
        nextNotificationAt: row.next_notification_at,
      }));
    },
    async purgeExpired(now) {
      const timestamp = now.toISOString();
      return {
        jobs: Number(purgeExpiredJobs.run(timestamp).changes),
        receipts: Number(purgeExpiredReceipts.run(timestamp).changes),
      };
    },
  };
}
