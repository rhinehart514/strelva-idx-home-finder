import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_REDIRECTS = 3;
const MAX_RESPONSE_BYTES = 1_000_000;
const REQUEST_TIMEOUT_MS = 8_000;

export type CheckStatus = "pass" | "warn" | "fail";

export type SiteObservation = {
  id: string;
  label: string;
  status: CheckStatus;
  evidence: string;
};

export type PublicSiteCheck = {
  url: string;
  hostname: string;
  title: string | null;
  checkedAt: string;
  responseMs: number;
  responseStatus: number;
  verdict: "healthy" | "attention" | "unknown";
  summary: string;
  observations: SiteObservation[];
};

export class SiteCheckError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function isPrivateV4(address: string) {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some(Number.isNaN)) return true;
  const [a, b] = octets;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

export function isPrivateAddress(address: string) {
  if (isIP(address) === 4) return isPrivateV4(address);
  if (isIP(address) !== 6) return true;

  const normalized = address.toLowerCase();
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (/^fe[89ab]/.test(normalized)) return true;

  const mappedV4 = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  return mappedV4 ? isPrivateV4(mappedV4) : false;
}

async function validateDestination(url: URL) {
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new SiteCheckError("Use an http or https website URL.", 400);
  }

  if (url.username || url.password) {
    throw new SiteCheckError("Remove the username or password from the URL.", 400);
  }

  if (url.port && !["80", "443"].includes(url.port)) {
    throw new SiteCheckError("Only standard public website ports can be checked.", 400);
  }

  if (url.hostname === "localhost" || url.hostname.endsWith(".localhost")) {
    throw new SiteCheckError("Enter a public website URL, not a local address.", 400);
  }

  const addresses = await lookup(url.hostname, { all: true, verbatim: true }).catch(
    () => [],
  );
  if (addresses.length === 0) {
    throw new SiteCheckError("That hostname could not be resolved.", 422);
  }

  if (addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new SiteCheckError("Private or local network addresses cannot be checked.", 400);
  }
}

async function readLimitedText(response: Response) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new SiteCheckError(
        "The page was larger than this early checker can inspect safely.",
        422,
      );
    }
    text += decoder.decode(value, { stream: true });
  }

  return text + decoder.decode();
}

async function fetchPublicPage(initialUrl: URL) {
  let currentUrl = initialUrl;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await validateDestination(currentUrl);
    const response = await fetch(currentUrl, {
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "Strelva-IDX-Check/0.1 (+public-page-observation)",
      },
    }).catch((error: unknown) => {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new SiteCheckError("The public page did not respond within 8 seconds.", 504);
      }
      throw new SiteCheckError("The public page could not be reached.", 422);
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) {
        throw new SiteCheckError("The page redirected without a destination.", 422);
      }
      currentUrl = new URL(location, currentUrl);
      continue;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      throw new SiteCheckError("The URL did not return a public HTML page.", 422);
    }

    return { response, html: await readLimitedText(response), finalUrl: currentUrl };
  }

  throw new SiteCheckError("The page redirected too many times.", 422);
}

function extractFirst(html: string, pattern: RegExp) {
  return html.match(pattern)?.[1]?.replace(/\s+/g, " ").trim() ?? null;
}

export function summarizeHtml(
  html: string,
  responseStatus: number,
  url: URL,
): Omit<PublicSiteCheck, "url" | "hostname" | "checkedAt" | "responseMs"> {
  const lower = html.toLowerCase();
  const title = extractFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const canonical = extractFirst(
    html,
    /<link[^>]+rel=["'][^"']*canonical[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>/i,
  );
  const formCount = html.match(/<form\b/gi)?.length ?? 0;
  const hasNoIndex = /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(
    html,
  );
  const hasIdxSignal = [
    "idx",
    "homes for sale",
    "property search",
    "listing search",
    "mls",
  ].some((signal) => lower.includes(signal));
  const visibleError = [
    "sorry, we are experiencing system issues",
    "error communicating with",
    "critical error on this website",
    "service unavailable",
  ].find((signal) => lower.includes(signal));
  const reachable = responseStatus >= 200 && responseStatus < 400;

  const observations: SiteObservation[] = [
    {
      id: "reachability",
      label: "Public page",
      status: reachable ? "pass" : "fail",
      evidence: reachable
        ? `Returned HTTP ${responseStatus}.`
        : `Returned HTTP ${responseStatus}; visitors may not receive the page.`,
    },
    {
      id: "visible-error",
      label: "Visible failure language",
      status: visibleError ? "fail" : "pass",
      evidence: visibleError
        ? `The response contains “${visibleError}”.`
        : "No known public IDX or website error phrase was found.",
    },
    {
      id: "idx-signal",
      label: "IDX signal",
      status: hasIdxSignal ? "pass" : "warn",
      evidence: hasIdxSignal
        ? "The public HTML contains real-estate search or MLS language."
        : "No IDX, MLS, listing-search, or homes-for-sale language was confirmed on this page.",
    },
    {
      id: "forms",
      label: "Forms in page HTML",
      status: formCount > 0 ? "pass" : "warn",
      evidence:
        formCount > 0
          ? `${formCount} form${formCount === 1 ? " was" : "s were"} present in the returned HTML.`
          : "No form was present in the returned HTML; JavaScript-rendered forms are not observed by this check.",
    },
    {
      id: "indexing",
      label: "Indexing instruction",
      status: hasNoIndex ? "warn" : "pass",
      evidence: hasNoIndex
        ? "The page asks search engines not to index it."
        : "No page-level noindex instruction was found.",
    },
    {
      id: "canonical",
      label: "Canonical URL",
      status: canonical ? "pass" : "warn",
      evidence: canonical
        ? `Canonical points to ${canonical}.`
        : "No canonical URL was confirmed in the returned HTML.",
    },
  ];

  const verdict = !reachable || visibleError
    ? "attention"
    : hasIdxSignal
      ? "healthy"
      : "unknown";

  const summary =
    verdict === "attention"
      ? "The public page returned evidence that needs review."
      : verdict === "healthy"
        ? "The public page responded and exposed recognizable IDX signals."
        : "The page responded, but this check could not confirm an IDX experience.";

  return {
    title,
    responseStatus,
    verdict,
    summary,
    observations,
  };
}

export async function checkPublicSite(input: string): Promise<PublicSiteCheck> {
  const normalized = /^https?:\/\//i.test(input.trim())
    ? input.trim()
    : `https://${input.trim()}`;

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new SiteCheckError("Enter a complete public website URL.", 400);
  }

  const startedAt = performance.now();
  const { response, html, finalUrl } = await fetchPublicPage(url);
  const responseMs = Math.round(performance.now() - startedAt);

  return {
    url: finalUrl.toString(),
    hostname: finalUrl.hostname,
    checkedAt: new Date().toISOString(),
    responseMs,
    ...summarizeHtml(html, response.status, finalUrl),
  };
}
