import { describe, expect, it } from "vitest";
import {
  IDX_MAX_UPDATE_AGE_MS,
  IDX_RELIABILITY_DISCLAIMER,
  assessFeedHealth,
  assessIdxDisplay,
  assessIdxStaleness,
} from "./compliance";

const NOW = new Date("2026-08-11T16:00:00.000Z");

describe("IDX display evidence", () => {
  it("derives complete live-listing display text", () => {
    const result = assessIdxDisplay({
      dataMode: "live",
      sourceName: "NYSAMLS via WNYREIS",
      sourceCheckedAt: "2026-08-11T15:30:00.000Z",
      listingBrokerage: "Example Realty LLC",
      now: NOW,
    });

    expect(result.displayReady).toBe(true);
    expect(result.missingOrInvalid).toEqual([]);
    expect(result.evidence["data-source"].text).toBe(
      "Data source: NYSAMLS via WNYREIS",
    );
    expect(result.evidence["source-checked"].text).toBe(
      "Source checked: 2026-08-11T15:30:00.000Z",
    );
    expect(result.evidence["listing-brokerage"].text).toBe(
      "Listing courtesy of Example Realty LLC",
    );
    expect(result.evidence["reliability-disclaimer"].text).toBe(
      IDX_RELIABILITY_DISCLAIMER,
    );
    expect(result.evidence["data-truth"].text).toBe("Live listing data");
  });

  it("labels demo inventory explicitly even when its timestamp is stale", () => {
    const result = assessIdxDisplay({
      dataMode: "demo",
      sourceName: "Trestle sample feed",
      sourceCheckedAt: "2026-08-01T12:00:00.000Z",
      listingBrokerage: "Sample Brokerage",
      now: NOW,
    });

    expect(result.displayReady).toBe(true);
    expect(result.staleness.status).toBe("stale");
    expect(result.evidence["data-truth"].text).toBe(
      "Demo listing data — not live MLS inventory",
    );
  });

  it("does not mark stale live inventory as display ready", () => {
    const result = assessIdxDisplay({
      dataMode: "live",
      sourceName: "NYSAMLS via WNYREIS",
      sourceCheckedAt: "2026-08-10T12:00:00.000Z",
      listingBrokerage: "Example Realty LLC",
      now: NOW,
    });

    expect(result.displayReady).toBe(false);
    expect(result.staleness.status).toBe("stale");
  });

  it("fails closed when required listing evidence is absent or malformed", () => {
    const result = assessIdxDisplay({
      dataMode: "live",
      sourceName: "  ",
      sourceCheckedAt: "not-a-timestamp",
      listingBrokerage: null,
      now: NOW,
    });

    expect(result.displayReady).toBe(false);
    expect(result.missingOrInvalid).toEqual([
      "data-source",
      "source-checked",
      "listing-brokerage",
    ]);
    expect(result.evidence["source-checked"].status).toBe("invalid");
    expect(result.staleness.status).toBe("invalid");
  });
});

describe("12-hour staleness policy", () => {
  it("treats exactly 12 hours as current and anything older as stale", () => {
    const exactlyTwelveHoursAgo = new Date(
      NOW.getTime() - IDX_MAX_UPDATE_AGE_MS,
    );
    const justOverTwelveHoursAgo = new Date(
      exactlyTwelveHoursAgo.getTime() - 1,
    );

    expect(assessIdxStaleness(exactlyTwelveHoursAgo, NOW).status).toBe(
      "current",
    );
    expect(assessIdxStaleness(justOverTwelveHoursAgo, NOW).status).toBe(
      "stale",
    );
  });

  it("does not treat missing, invalid, or future timestamps as fresh", () => {
    expect(assessIdxStaleness(null, NOW).status).toBe("missing");
    expect(assessIdxStaleness("not-a-date", NOW).status).toBe("invalid");
    expect(
      assessIdxStaleness("2026-08-11T16:00:00.001Z", NOW).status,
    ).toBe("future");
  });
});

describe("feed health assessment", () => {
  it("reports a recent successful sync as healthy", () => {
    const result = assessFeedHealth({
      lastSuccessfulSyncAt: "2026-08-11T15:00:00.000Z",
      now: NOW,
    });

    expect(result.status).toBe("healthy");
  });

  it("reports a newer failed attempt as degraded while data is current", () => {
    const result = assessFeedHealth({
      lastSuccessfulSyncAt: "2026-08-11T15:00:00.000Z",
      lastAttempt: {
        completedAt: "2026-08-11T15:30:00.000Z",
        outcome: "failure",
      },
      now: NOW,
    });

    expect(result.status).toBe("degraded");
    expect(result.staleness.status).toBe("current");
  });

  it("prioritizes stale data over an attempt result", () => {
    const result = assessFeedHealth({
      lastSuccessfulSyncAt: "2026-08-10T15:00:00.000Z",
      lastAttempt: {
        completedAt: "2026-08-11T15:30:00.000Z",
        outcome: "failure",
      },
      now: NOW,
    });

    expect(result.status).toBe("stale");
  });

  it("reports unknown without a trustworthy success timestamp", () => {
    expect(
      assessFeedHealth({ lastSuccessfulSyncAt: null, now: NOW }).status,
    ).toBe("unknown");
    expect(
      assessFeedHealth({
        lastSuccessfulSyncAt: "2026-08-12T15:00:00.000Z",
        now: NOW,
      }).status,
    ).toBe("unknown");
  });
});
