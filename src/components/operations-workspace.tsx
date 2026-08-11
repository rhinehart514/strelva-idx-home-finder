"use client";

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { StrelvaLogo, StrelvaMark } from "@/src/components/strelva-logo";
import type {
  CheckStatus,
  PublicSiteCheck,
  SiteObservation,
} from "@/src/lib/site-check";

function formatCheckedAt(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

function statusCopy(status: CheckStatus) {
  if (status === "pass") return "Observed";
  if (status === "fail") return "Issue found";
  return "Not confirmed";
}

function verdictCopy(verdict: PublicSiteCheck["verdict"]) {
  if (verdict === "attention") {
    return {
      label: "Issue found",
      heading: "This page needs review.",
      next: "Copy this check into the vendor or developer ticket.",
    };
  }

  if (verdict === "healthy") {
    return {
      label: "IDX signals found",
      heading: "The public response contains IDX signals.",
      next: "Test search and lead delivery in a browser before closing the check.",
    };
  }

  return {
    label: "IDX not confirmed",
    heading: "This response is inconclusive.",
    next: "Confirm this is the public search page, then test the rendered experience manually.",
  };
}

function isSiteObservation(value: unknown): value is SiteObservation {
  if (typeof value !== "object" || value === null) return false;
  const observation = value as Partial<SiteObservation>;
  return (
    typeof observation.id === "string" &&
    typeof observation.label === "string" &&
    typeof observation.evidence === "string" &&
    ["pass", "warn", "fail"].includes(observation.status ?? "")
  );
}

function isPublicSiteCheck(value: unknown): value is PublicSiteCheck {
  if (typeof value !== "object" || value === null) return false;
  const check = value as Partial<PublicSiteCheck>;
  return (
    typeof check.url === "string" &&
    typeof check.hostname === "string" &&
    (typeof check.title === "string" || check.title === null) &&
    typeof check.checkedAt === "string" &&
    typeof check.responseMs === "number" &&
    typeof check.responseStatus === "number" &&
    ["healthy", "attention", "unknown"].includes(check.verdict ?? "") &&
    typeof check.summary === "string" &&
    Array.isArray(check.observations) &&
    check.observations.every(isSiteObservation)
  );
}

function ResultStatus({ verdict }: { verdict: PublicSiteCheck["verdict"] }) {
  const copy = verdictCopy(verdict);
  return (
    <span className={`status status--${verdict}`}>
      <span className="status__dot" aria-hidden="true" />
      {copy.label}
    </span>
  );
}

function ObservationStatus({ status }: { status: CheckStatus }) {
  return (
    <span className={`observation-status observation-status--${status}`}>
      <span aria-hidden="true">
        {status === "pass" ? "✓" : status === "fail" ? "!" : "?"}
      </span>
      {statusCopy(status)}
    </span>
  );
}

export function OperationsWorkspace() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<PublicSiteCheck | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  const evidencePacket = useMemo(() => {
    if (!result) return "";
    const verdict = verdictCopy(result.verdict);

    return [
      `${result.title || result.hostname}`,
      result.url,
      `${verdict.label} · ${formatCheckedAt(result.checkedAt)}`,
      `HTTP ${result.responseStatus} · ${result.responseMs.toLocaleString()} ms`,
      "",
      ...result.observations.map(
        ({ label, status, evidence }) =>
          `${label} · ${statusCopy(status)}\n${evidence}`,
      ),
      "",
      `Next: ${verdict.next}`,
      "",
      "Scope: one public HTML response. No JavaScript behavior, form delivery, listing freshness, vendor account, MLS feed, or compliance review.",
    ].join("\n");
  }, [result]);

  async function handleCheck(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!url.trim() || isChecking) return;

    setIsChecking(true);
    setCheckError(null);
    setCopyState("idle");

    try {
      const response = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const payload: unknown = await response.json();

      if (!response.ok) {
        const message =
          typeof payload === "object" && payload !== null && "error" in payload
            ? String((payload as { error: unknown }).error)
            : "The public page could not be checked.";
        throw new Error(message);
      }

      if (!isPublicSiteCheck(payload)) {
        throw new Error("The checker returned an unreadable result. Try the page again.");
      }

      setResult(payload);
    } catch (error) {
      setCheckError(
        error instanceof Error
          ? error.message
          : "The public page could not be checked. Your URL was preserved.",
      );
    } finally {
      setIsChecking(false);
    }
  }

  async function copyEvidence() {
    try {
      await navigator.clipboard.writeText(evidencePacket);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  const verdict = result ? verdictCopy(result.verdict) : null;

  return (
    <main className="app-shell">
      <header className="product-nav">
        <a href="https://strelva.com" aria-label="Strelva home">
          <StrelvaLogo />
        </a>
        <a className="labs-link" href="https://strelva.com/labs">
          Labs
        </a>
      </header>

      <section className="instrument" aria-labelledby="page-title">
        <header className="instrument__intro">
          <p className="series-mark">Strelva Labs / IDX page check</p>
          <h1 id="page-title">
            See what an IDX page exposes <em>right now.</em>
          </h1>
          <p className="instrument__lede">
            Paste the public search page your clients use. Get a timestamped
            record of what the server returned.
          </p>
        </header>

        <form className="check-command" onSubmit={handleCheck}>
          <label htmlFor="site-url">Public IDX page</label>
          <div className="check-command__control">
            <input
              id="site-url"
              name="site-url"
              type="text"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck="false"
              placeholder="agency.com/property-search"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              aria-describedby="site-check-scope site-check-error"
            />
            <button type="submit" disabled={!url.trim() || isChecking}>
              {isChecking ? "Checking page" : "Check page"}
            </button>
          </div>
          <div className="check-command__footer">
            <p id="site-check-scope">
              Reads one public HTML response. Nothing is saved.
            </p>
            {checkError ? (
              <p id="site-check-error" className="check-error" role="alert">
                {checkError} Your URL is still here.
              </p>
            ) : null}
          </div>
        </form>

        <section
          className={`result-region ${result ? "result-region--ready" : ""}`}
          aria-label="Page check result"
          aria-live="polite"
          aria-busy={isChecking}
        >
          {!result ? (
            <div className="result-empty">
              <span className="result-empty__line" aria-hidden="true" />
              <div>
                <h2>{isChecking ? "Checking the public response" : "No page checked"}</h2>
                <p>
                  {isChecking
                    ? "The checker is requesting the URL you entered."
                    : "Your evidence receipt will appear here."}
                </p>
              </div>
            </div>
          ) : (
            <article className="receipt">
              <header className={`receipt__status receipt__status--${result.verdict}`}>
                <ResultStatus verdict={result.verdict} />
                <time dateTime={result.checkedAt}>{formatCheckedAt(result.checkedAt)}</time>
              </header>

              <div className="receipt__body">
                <div className="receipt__summary">
                  <div>
                    <p className="receipt__host">{result.hostname}</p>
                    <h2>{verdict?.heading}</h2>
                    <p>{result.summary}</p>
                  </div>
                  <dl className="response-facts">
                    <div>
                      <dt>Response</dt>
                      <dd>HTTP {result.responseStatus}</dd>
                    </div>
                    <div>
                      <dt>Time</dt>
                      <dd>{result.responseMs.toLocaleString()} ms</dd>
                    </div>
                    <div>
                      <dt>Checks</dt>
                      <dd>{result.observations.length}</dd>
                    </div>
                  </dl>
                </div>

                <div className="observations">
                  <div className="observations__heading">
                    <h3>Public evidence</h3>
                    <span>Observed from returned HTML</span>
                  </div>
                  <ol>
                    {result.observations.map((observation) => (
                      <li key={observation.id}>
                        <div className="observation__heading">
                          <h4>{observation.label}</h4>
                          <ObservationStatus status={observation.status} />
                        </div>
                        <p>{observation.evidence}</p>
                      </li>
                    ))}
                  </ol>
                </div>

                <footer className="receipt__next">
                  <div>
                    <p className="receipt__next-label">Next action</p>
                    <p>{verdict?.next}</p>
                  </div>
                  <button type="button" onClick={copyEvidence}>
                    {copyState === "copied"
                      ? "Check copied"
                      : copyState === "failed"
                        ? "Copy failed"
                        : "Copy check"}
                  </button>
                </footer>

                <p className="receipt__scope">
                  This checks one public HTML response. It does not test
                  JavaScript search behavior, form delivery, listing freshness,
                  vendor account state, MLS feeds, or compliance.
                </p>
              </div>
            </article>
          )}
        </section>
      </section>

      <footer className="product-footer">
        <StrelvaMark />
        <span>A public experiment from Strelva Labs.</span>
      </footer>
    </main>
  );
}
