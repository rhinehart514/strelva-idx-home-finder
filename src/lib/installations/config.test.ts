import { describe, expect, it } from "vitest";
import { getHomeFinderInstallation } from "./config";

const validLiveInstallation = {
  id: "buffalo-pilot",
  mode: "live",
  allowedOrigins: ["https://brokerage.example"],
  brokerage: {
    name: "Example Realty",
    logoUrl: "https://brokerage.example/logo.svg",
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

describe("Home Finder Installation configuration", () => {
  it("accepts a complete live installation", () => {
    expect(
      getHomeFinderInstallation("buffalo-pilot", {
        HOME_FINDER_INSTALLATIONS_JSON: JSON.stringify([
          validLiveInstallation,
        ]),
      }),
    ).toEqual(validLiveInstallation);
  });

  it.each([
    ["an invalid origin", { allowedOrigins: ["brokerage.example"] }],
    ["an invalid color", { brokerage: { ...validLiveInstallation.brokerage, primaryColor: "red" } }],
    ["a missing inquiry destination", { inquiryDestination: null }],
    ["a refresh interval exceeding NYSAMLSs' 12-hour maximum", { mls: { ...validLiveInstallation.mls, refreshIntervalMinutes: 721 } }],
    ["a missing MLS freshness rule", { mls: { ...validLiveInstallation.mls, refreshIntervalMinutes: null } }],
  ])("fails closed for a live installation with %s", (_label, replacement) => {
    const configured = { ...validLiveInstallation, ...replacement };
    expect(() =>
      getHomeFinderInstallation("buffalo-pilot", {
        HOME_FINDER_INSTALLATIONS_JSON: JSON.stringify([configured]),
      }),
    ).toThrow(/HOME_FINDER_INSTALLATIONS_JSON/);
  });

  it("rejects duplicate installation IDs", () => {
    expect(() =>
      getHomeFinderInstallation("buffalo-pilot", {
        HOME_FINDER_INSTALLATIONS_JSON: JSON.stringify([
          validLiveInstallation,
          validLiveInstallation,
        ]),
      }),
    ).toThrow(/unique/);
  });
});
