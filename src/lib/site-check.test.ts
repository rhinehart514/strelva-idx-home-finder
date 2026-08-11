import { describe, expect, it } from "vitest";
import { isPrivateAddress, summarizeHtml } from "./site-check";

describe("public destination safety", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.8",
    "172.16.0.1",
    "192.168.1.4",
    "169.254.169.254",
    "::1",
    "fd00::1",
  ])("blocks %s", (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])(
    "allows public address %s",
    (address) => {
      expect(isPrivateAddress(address)).toBe(false);
    },
  );
});

describe("HTML observations", () => {
  it("reports a recognizable public IDX page without inventing feed health", () => {
    const result = summarizeHtml(
      `<!doctype html><html><head><title>Homes for sale</title><link rel="canonical" href="https://example.com/search"><meta name="description" content="MLS property search"></head><body><form></form></body></html>`,
      200,
      new URL("https://example.com/search"),
    );

    expect(result.verdict).toBe("healthy");
    expect(result.observations.find(({ id }) => id === "idx-signal")?.status).toBe(
      "pass",
    );
  });

  it("surfaces known public error language", () => {
    const result = summarizeHtml(
      "<html><title>Search</title><body>Sorry, we are experiencing system issues</body></html>",
      200,
      new URL("https://example.com"),
    );

    expect(result.verdict).toBe("attention");
    expect(
      result.observations.find(({ id }) => id === "visible-error")?.status,
    ).toBe("fail");
  });
});
