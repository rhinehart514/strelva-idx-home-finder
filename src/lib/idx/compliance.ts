export const IDX_MAX_UPDATE_AGE_MS = 12 * 60 * 60 * 1_000;

export const IDX_RELIABILITY_DISCLAIMER =
  "Information is deemed reliable but is not guaranteed.";

export type IdxDataMode = "demo" | "live";

export type IdxStalenessStatus =
  | "current"
  | "stale"
  | "missing"
  | "invalid"
  | "future";

export type IdxStaleness = {
  status: IdxStalenessStatus;
  /** Whole milliseconds since the assessed event. Null when age is unknowable. */
  ageMs: number | null;
  thresholdMs: number;
};

export type IdxDisplayEvidenceKey =
  | "data-source"
  | "source-checked"
  | "listing-brokerage"
  | "reliability-disclaimer"
  | "data-truth";

export type IdxDisplayEvidenceItem = {
  key: IdxDisplayEvidenceKey;
  label: string;
  text: string | null;
  status: "present" | "missing" | "invalid";
};

export type IdxDisplayInput = {
  dataMode: IdxDataMode;
  sourceName: string | null | undefined;
  sourceCheckedAt: Date | string | null | undefined;
  listingBrokerage: string | null | undefined;
  /** Injected by callers and tests so the assessment remains deterministic. */
  now?: Date;
};

export type IdxDisplayAssessment = {
  dataMode: IdxDataMode;
  displayReady: boolean;
  evidence: Record<IdxDisplayEvidenceKey, IdxDisplayEvidenceItem>;
  missingOrInvalid: IdxDisplayEvidenceKey[];
  staleness: IdxStaleness;
};

export type FeedHealthInput = {
  lastSuccessfulSyncAt: Date | string | null | undefined;
  lastAttempt?: {
    completedAt: Date | string;
    outcome: "success" | "failure";
  } | null;
  now?: Date;
};

export type FeedHealthAssessment = {
  status: "healthy" | "degraded" | "stale" | "unknown";
  summary: string;
  lastSuccessfulSyncAt: string | null;
  staleness: IdxStaleness;
};

function nonEmpty(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function parseTimestamp(value: Date | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return { status: "missing" as const, date: null };
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { status: "invalid" as const, date: null };
  }

  return { status: "valid" as const, date };
}

export function assessIdxStaleness(
  updatedAt: Date | string | null | undefined,
  now = new Date(),
): IdxStaleness {
  const parsed = parseTimestamp(updatedAt);
  if (parsed.status !== "valid") {
    return {
      status: parsed.status,
      ageMs: null,
      thresholdMs: IDX_MAX_UPDATE_AGE_MS,
    };
  }

  const ageMs = now.getTime() - parsed.date.getTime();
  if (ageMs < 0) {
    return {
      status: "future",
      ageMs,
      thresholdMs: IDX_MAX_UPDATE_AGE_MS,
    };
  }

  return {
    // At exactly 12 hours, the feed has not yet exceeded the policy window.
    status: ageMs <= IDX_MAX_UPDATE_AGE_MS ? "current" : "stale",
    ageMs,
    thresholdMs: IDX_MAX_UPDATE_AGE_MS,
  };
}

export function assessIdxDisplay({
  dataMode,
  sourceName,
  sourceCheckedAt,
  listingBrokerage,
  now = new Date(),
}: IdxDisplayInput): IdxDisplayAssessment {
  const source = nonEmpty(sourceName);
  const brokerage = nonEmpty(listingBrokerage);
  const parsedUpdate = parseTimestamp(sourceCheckedAt);
  const staleness = assessIdxStaleness(sourceCheckedAt, now);
  const updatedAt = parsedUpdate.date?.toISOString() ?? null;

  const evidence: Record<IdxDisplayEvidenceKey, IdxDisplayEvidenceItem> = {
    "data-source": {
      key: "data-source",
      label: "Data source",
      text: source ? `Data source: ${source}` : null,
      status: source ? "present" : "missing",
    },
    "source-checked": {
      key: "source-checked",
      label: "Source checked",
      text: updatedAt ? `Source checked: ${updatedAt}` : null,
      status:
        parsedUpdate.status === "valid" ? "present" : parsedUpdate.status,
    },
    "listing-brokerage": {
      key: "listing-brokerage",
      label: "Listing brokerage",
      text: brokerage ? `Listing courtesy of ${brokerage}` : null,
      status: brokerage ? "present" : "missing",
    },
    "reliability-disclaimer": {
      key: "reliability-disclaimer",
      label: "Reliability disclaimer",
      text: IDX_RELIABILITY_DISCLAIMER,
      status: "present",
    },
    "data-truth": {
      key: "data-truth",
      label: "Data mode",
      text:
        dataMode === "live"
          ? "Live listing data"
          : "Demo listing data — not live MLS inventory",
      status: "present",
    },
  };

  const missingOrInvalid = (
    Object.keys(evidence) as IdxDisplayEvidenceKey[]
  ).filter((key) => evidence[key].status !== "present");

  return {
    dataMode,
    displayReady:
      missingOrInvalid.length === 0 &&
      (staleness.status === "current" || dataMode === "demo"),
    evidence,
    missingOrInvalid,
    staleness,
  };
}

export function assessFeedHealth({
  lastSuccessfulSyncAt,
  lastAttempt,
  now = new Date(),
}: FeedHealthInput): FeedHealthAssessment {
  const parsedSuccess = parseTimestamp(lastSuccessfulSyncAt);
  const lastSuccessfulSyncAtIso = parsedSuccess.date?.toISOString() ?? null;
  const staleness = assessIdxStaleness(lastSuccessfulSyncAt, now);

  if (
    staleness.status === "missing" ||
    staleness.status === "invalid" ||
    staleness.status === "future"
  ) {
    return {
      status: "unknown",
      summary: "A valid completed feed sync has not been confirmed.",
      lastSuccessfulSyncAt: lastSuccessfulSyncAtIso,
      staleness,
    };
  }

  if (staleness.status === "stale") {
    return {
      status: "stale",
      summary: "The last confirmed feed sync is older than 12 hours.",
      lastSuccessfulSyncAt: lastSuccessfulSyncAtIso,
      staleness,
    };
  }

  const parsedAttempt = parseTimestamp(lastAttempt?.completedAt);
  const hasNewerFailedAttempt =
    lastAttempt?.outcome === "failure" &&
    parsedAttempt.date !== null &&
    parsedSuccess.date !== null &&
    parsedAttempt.date.getTime() > parsedSuccess.date.getTime() &&
    parsedAttempt.date.getTime() <= now.getTime();

  if (hasNewerFailedAttempt) {
    return {
      status: "degraded",
      summary:
        "The feed is within the 12-hour window, but the latest completed attempt failed.",
      lastSuccessfulSyncAt: lastSuccessfulSyncAtIso,
      staleness,
    };
  }

  return {
    status: "healthy",
    summary: "The last confirmed feed sync is within the 12-hour window.",
    lastSuccessfulSyncAt: lastSuccessfulSyncAtIso,
    staleness,
  };
}
