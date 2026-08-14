import { describe, expect, it } from "vitest";
import {
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
      freshnessWindowMinutes: 60,
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
      freshnessWindowMinutes: 60,
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
      freshnessWindowMinutes: 60,
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
      freshnessWindowMinutes: 60,
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

describe("approving-MLS freshness policy", () => {
  it("uses the configured window and fails closed without one", () => {
    const exactlyOneHourAgo = new Date(NOW.getTime() - 60 * 60 * 1_000);
    const justOverOneHourAgo = new Date(exactlyOneHourAgo.getTime() - 1);

    expect(assessIdxStaleness(exactlyOneHourAgo, 60, NOW).status).toBe(
      "current",
    );
    expect(assessIdxStaleness(justOverOneHourAgo, 60, NOW).status).toBe(
      "stale",
    );
    expect(assessIdxStaleness(exactlyOneHourAgo, null, NOW).status).toBe(
      "policy-missing",
    );
  });

  it("does not treat missing, invalid, or future timestamps as fresh", () => {
    expect(assessIdxStaleness(null, 60, NOW).status).toBe("missing");
    expect(assessIdxStaleness("not-a-date", 60, NOW).status).toBe("invalid");
    expect(
      assessIdxStaleness("2026-08-11T16:00:00.001Z", 60, NOW).status,
    ).toBe("future");
  });

  it("withholds live display when the approving-MLS rule is absent", () => {
    const result = assessIdxDisplay({
      dataMode: "live",
      sourceName: "NYSAMLS via WNYREIS",
      sourceCheckedAt: "2026-08-11T15:59:00.000Z",
      listingBrokerage: "Example Realty LLC",
      freshnessWindowMinutes: null,
      now: NOW,
    });

    expect(result.displayReady).toBe(false);
    expect(result.staleness.status).toBe("policy-missing");
  });
});

describe("feed health assessment", () => {
  it("reports a recent successful sync as healthy", () => {
    const result = assessFeedHealth({
      lastSuccessfulSyncAt: "2026-08-11T15:00:00.000Z",
      freshnessWindowMinutes: 60,
      now: NOW,
    });

    expect(result.status).toBe("healthy");
  });

  it("reports a newer failed attempt as degraded while data is current", () => {
    const result = assessFeedHealth({
      lastSuccessfulSyncAt: "2026-08-11T15:00:00.000Z",
      freshnessWindowMinutes: 60,
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
      freshnessWindowMinutes: 60,
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
      assessFeedHealth({
        lastSuccessfulSyncAt: null,
        freshnessWindowMinutes: 60,
        now: NOW,
      }).status,
    ).toBe("unknown");
    expect(
      assessFeedHealth({
        lastSuccessfulSyncAt: "2026-08-12T15:00:00.000Z",
        freshnessWindowMinutes: 60,
        now: NOW,
      }).status,
    ).toBe("unknown");
  });
});
