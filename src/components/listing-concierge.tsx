"use client";

import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { assessIdxDisplay, assessIdxStaleness } from "@/src/lib/idx";
import { ListingAttribution, IdxDisclosure } from "./idx-attribution";
import type { PublicHomeFinderInstallation } from "@/src/lib/installations";
import type {
  Listing,
  ListingSearchResult,
} from "@/src/lib/mls";

type SearchFields = {
  q: string;
  maxPrice: string;
  beds: string;
  baths: string;
};

type InquiryFields = {
  name: string;
  email: string;
  phone: string;
  message: string;
  consent: boolean;
  website: string;
};

type InquiryState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "delivered" | "pending" | "preview" | "unavailable"; message: string; requestId?: string }
  | { kind: "error"; message: string };

const INITIAL_SEARCH: SearchFields = {
  q: "",
  maxPrice: "",
  beds: "",
  baths: "",
};

const INITIAL_INQUIRY: InquiryFields = {
  name: "",
  email: "",
  phone: "",
  message: "I would like to learn more about this home.",
  consent: false,
  website: "",
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatUpdatedAt(value: string | null) {
  if (!value) return "Update time unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Update time unavailable";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function formatStatus(value: Listing["status"]) {
  return value
    .split("-")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function formatAddress(listing: Listing) {
  return [
    listing.address.line,
    listing.address.city,
    listing.address.state,
    listing.address.postalCode,
  ]
    .filter(Boolean)
    .join(", ");
}

function isListingSearchResult(value: unknown): value is ListingSearchResult {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ListingSearchResult>;
  return (
    !!candidate.source &&
    typeof candidate.source === "object" &&
    (candidate.source.mode === "demo" || candidate.source.mode === "live") &&
    typeof candidate.source.name === "string" &&
    (typeof candidate.source.freshnessWindowMinutes === "number" ||
      candidate.source.freshnessWindowMinutes === null) &&
    typeof candidate.fetchedAt === "string" &&
    (typeof candidate.sourceCheckedAt === "string" ||
      candidate.sourceCheckedAt === null) &&
    (typeof candidate.latestListingModifiedAt === "string" ||
      candidate.latestListingModifiedAt === null) &&
    typeof candidate.count === "number" &&
    Array.isArray(candidate.listings)
  );
}

function readApiError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  if ("error" in payload) {
    const error = (payload as { error: unknown }).error;
    if (typeof error === "string") return error;
    if (error && typeof error === "object" && "message" in error) {
      return String((error as { message: unknown }).message);
    }
  }
  return fallback;
}

function ListingFacts({ listing }: { listing: Listing }) {
  return (
    <dl className="listing-facts">
      <div>
        <dt>Beds</dt>
        <dd>{listing.bedrooms ?? "—"}</dd>
      </div>
      <div>
        <dt>Baths</dt>
        <dd>{listing.bathrooms ?? "—"}</dd>
      </div>
      <div>
        <dt>Interior</dt>
        <dd>
          {listing.livingAreaSqFt
            ? `${listing.livingAreaSqFt.toLocaleString()} sq ft`
            : "—"}
        </dd>
      </div>
      <div>
        <dt>Built</dt>
        <dd>{listing.yearBuilt ?? "—"}</dd>
      </div>
    </dl>
  );
}

function BrokerageMark({ name }: { name: string }) {
  return <span className="brokerage-mark" aria-hidden="true">{name.slice(0, 1)}</span>;
}

export function ListingConcierge({
  installation,
}: {
  installation: PublicHomeFinderInstallation;
}) {
  const brokerage = installation.brokerage;
  const initialSearch = useMemo(
    () => ({ ...INITIAL_SEARCH, q: installation.defaultSearch.location }),
    [installation.defaultSearch.location],
  );
  const [search, setSearch] = useState(initialSearch);
  const [result, setResult] = useState<ListingSearchResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Listing | null>(null);
  const [isInquiryFormOpen, setIsInquiryFormOpen] = useState(false);
  const [inquiry, setInquiry] = useState(INITIAL_INQUIRY);
  const [inquiryState, setInquiryState] = useState<InquiryState>({ kind: "idle" });
  const [submissionId, setSubmissionId] = useState("");

  async function loadListings(fields: SearchFields) {
    setIsLoading(true);
    setSearchError(null);

    const params = new URLSearchParams({
      installationId: installation.id,
      limit: "12",
    });
    if (fields.q.trim()) params.set("q", fields.q.trim());
    if (fields.maxPrice) params.set("maxPrice", fields.maxPrice);
    if (fields.beds) params.set("beds", fields.beds);
    if (fields.baths) params.set("baths", fields.baths);

    try {
      const response = await fetch(`/api/listings?${params.toString()}`, {
        cache: "no-store",
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(readApiError(payload, "Listings could not be loaded."));
      }
      if (!isListingSearchResult(payload)) {
        throw new Error("The listing source returned an unreadable response.");
      }
      setResult(payload);
    } catch (error) {
      setSearchError(
        error instanceof Error ? error.message : "Listings could not be loaded.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadListings(initialSearch);
  }, [initialSearch]);

  useEffect(() => {
    if (!selected) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setSelected(null);
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [selected]);

  const displayableListings = useMemo(() => {
    if (!result) return [];
    return result.listings.filter((listing) =>
      assessIdxDisplay({
        dataMode: result.source.mode,
        sourceName: result.source.name,
        sourceCheckedAt: result.sourceCheckedAt,
        listingBrokerage: listing.listOfficeName,
        listingAttributionContact: listing.attributionContact,
        mlsNumber: listing.mlsNumber,
        freshnessWindowMinutes: result.source.freshnessWindowMinutes,
      }).displayReady,
    );
  }, [result]);

  useEffect(() => {
    if (result?.source.mode !== "live" || !result.sourceCheckedAt || !result.source.freshnessWindowMinutes) return;
    if (assessIdxStaleness(result.sourceCheckedAt, result.source.freshnessWindowMinutes).status !== "current") return;
    const expiresAt = Date.parse(result.sourceCheckedAt) + Math.min(result.source.freshnessWindowMinutes, 720) * 60_000;
    function refreshInventory() {
      setSelected(null);
      setResult(null);
      void loadListings(search);
    }
    const timer = setTimeout(refreshInventory, Math.max(0, expiresAt - Date.now()));
    function onVisible() {
      if (document.visibilityState === "visible" && Date.now() >= expiresAt) refreshInventory();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [result, search]);

  const blockedLiveListings =
    result?.source.mode === "live" &&
    result.listings.length > 0 &&
    displayableListings.length !== result.listings.length;

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadListings(search);
  }

  function openListing(listing: Listing) {
    setSelected(listing);
    setIsInquiryFormOpen(false);
    setInquiry(INITIAL_INQUIRY);
    setInquiryState({ kind: "idle" });
    setSubmissionId(crypto.randomUUID());
  }

  async function submitInquiry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || inquiryState.kind === "sending") return;

    if (result?.source.mode === "demo") {
      setInquiryState({
        kind: "preview",
        message:
          "The handoff is ready. This preview stayed in your browser; no contact details were sent or stored.",
      });
      return;
    }

    setInquiryState({ kind: "sending" });

    try {
      const response = await fetch("/api/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listing: {
            id: selected.id,
            address: formatAddress(selected),
            inquiryToken: selected.inquiryToken,
          },
          buyer: {
            name: inquiry.name,
            email: inquiry.email,
            phone: inquiry.phone,
          },
          message: inquiry.message,
          criteria: search.q,
          consent: inquiry.consent,
          installationId: installation.id,
          submissionId,
          website: inquiry.website,
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(
          readApiError(payload, "Your inquiry was not delivered. Please try again."),
        );
      }
      if (
        !payload ||
        typeof payload !== "object" ||
        !("status" in payload) ||
        !("message" in payload)
      ) {
        throw new Error("The inquiry service returned an unreadable response.");
      }
      const status = String((payload as { status: unknown }).status);
      const message = String((payload as { message: unknown }).message);
      if (
        status !== "delivered" &&
        status !== "pending" &&
        status !== "preview" &&
        status !== "unavailable"
      ) {
        throw new Error("The inquiry service returned an unknown status.");
      }
      const requestId =
        "requestId" in payload ? String((payload as { requestId: unknown }).requestId) : undefined;
      setInquiryState({ kind: status, message, requestId });
    } catch (error) {
      setInquiryState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Your inquiry was not delivered. Please try again.",
      });
    }
  }

  return (
    <main
      className="listing-shell"
      style={{ "--accent": brokerage.primaryColor } as CSSProperties}
    >
      <header className="listing-nav">
        <div className="brokerage-identity">
          {brokerage.logoUrl ? (
            <img src={brokerage.logoUrl} alt={`${brokerage.name} logo`} />
          ) : (
            <BrokerageMark name={brokerage.name} />
          )}
          <strong>{brokerage.name}</strong>
        </div>
      </header>

      <section className="listing-hero" aria-labelledby="listing-title">
        <div>
          <p className="series-mark">Home search</p>
          <h1 id="listing-title">
            Find the home<br />
            <em>you mean.</em>
          </h1>
        </div>
        <p>
          Search by city, ZIP code, or address. Refine by the facts
          that matter, then ask {brokerage.name} about a specific home.
        </p>
      </section>

      <form className="listing-command" onSubmit={handleSearch}>
        <div className="listing-command__query">
          <label htmlFor="listing-query">Where do you want to look?</label>
          <input
            id="listing-query"
            value={search.q}
            onChange={(event) => setSearch({ ...search, q: event.target.value })}
            placeholder="Buffalo, 14216, or an address"
            autoComplete="off"
          />
        </div>
        <div className="listing-command__filters">
          <label>
            <span>Max price</span>
            <select
              value={search.maxPrice}
              onChange={(event) =>
                setSearch({ ...search, maxPrice: event.target.value })
              }
            >
              <option value="">Any price</option>
              <option value="300000">$300k</option>
              <option value="400000">$400k</option>
              <option value="500000">$500k</option>
              <option value="750000">$750k</option>
              <option value="1000000">$1m</option>
            </select>
          </label>
          <label>
            <span>Bedrooms</span>
            <select
              value={search.beds}
              onChange={(event) => setSearch({ ...search, beds: event.target.value })}
            >
              <option value="">Any beds</option>
              <option value="2">2+</option>
              <option value="3">3+</option>
              <option value="4">4+</option>
              <option value="5">5+</option>
            </select>
          </label>
          <label>
            <span>Bathrooms</span>
            <select
              value={search.baths}
              onChange={(event) => setSearch({ ...search, baths: event.target.value })}
            >
              <option value="">Any baths</option>
              <option value="1">1+</option>
              <option value="2">2+</option>
              <option value="3">3+</option>
            </select>
          </label>
          <button type="submit" disabled={isLoading}>
            {isLoading ? "Searching" : "Find homes"}
          </button>
        </div>
      </form>

      <section className="listing-results" aria-live="polite" aria-busy={isLoading}>
        <header className="listing-results__header">
          <div>
            <p className="listing-results__eyebrow">Available matches</p>
            <h2>
              {isLoading && !result
                ? "Reading the listing source"
                : `${displayableListings.length} home${displayableListings.length === 1 ? "" : "s"}`}
            </h2>
          </div>
          {result ? (
            <div className={`source-proof source-proof--${result.source.mode}`}>
              <span>{result.source.mode === "live" ? "Live feed" : "Demo data"}</span>
              <strong>{result.source.name}</strong>
              <time dateTime={result.fetchedAt}>
                Queried {formatUpdatedAt(result.fetchedAt)}
              </time>
              <time dateTime={result.sourceCheckedAt ?? undefined}>
                Source checked {formatUpdatedAt(result.sourceCheckedAt)}
              </time>
            </div>
          ) : null}
        </header>

        {result?.source.mode === "demo" ? (
          <p className="data-notice">
            Demonstration listings only. They are not available properties and
            no MLS connection is being claimed.
          </p>
        ) : null}

        {searchError ? (
          <div className="listing-state listing-state--error" role="alert">
            <div>
              <h3>Listings could not be read</h3>
              <p>{searchError}</p>
            </div>
            <button type="button" onClick={() => void loadListings(search)}>
              Try again
            </button>
          </div>
        ) : blockedLiveListings ? (
          <div className="listing-state listing-state--error" role="alert">
            <div>
              <h3>Live display evidence is incomplete</h3>
              <p>
                Results are withheld until the source, update time, and listing
                brokerage attribution can be confirmed.
              </p>
            </div>
          </div>
        ) : !isLoading && displayableListings.length === 0 ? (
          <div className="listing-state">
            <div>
              <h3>No homes match this search</h3>
              <p>Try a broader location, budget, or fewer minimum features.</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSearch(initialSearch);
                void loadListings(initialSearch);
              }}
            >
              Clear search
            </button>
          </div>
        ) : (
          <ol className={`listing-ledger ${isLoading ? "listing-ledger--loading" : ""}`}>
            {displayableListings.map((listing, index) => {
              return (
                <li key={listing.id} className="listing-row">
                  <div className="listing-plate" aria-hidden="true">
                    {listing.photos[0] ? (
                      <img src={listing.photos[0].url} alt="" />
                    ) : (
                      <span>Property image unavailable</span>
                    )}
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <small>{listing.address.postalCode || "WNY"}</small>
                  </div>
                  <div className="listing-row__body">
                    <div className="listing-row__status">
                      <span>{formatStatus(listing.status)}</span>
                      <span>{listing.propertyType.replace("-", " ")}</span>
                    </div>
                    <h3>{listing.address.line || "Address available on request"}</h3>
                    <p className="listing-row__location">
                      {[listing.address.city, listing.address.state, listing.address.postalCode]
                        .filter(Boolean)
                        .join(" ")}
                    </p>
                    <ListingFacts listing={listing} />
                    <ListingAttribution live={result?.source.mode === "live"} brokerage={listing.listOfficeName} coBrokerage={listing.coListOfficeName} contact={listing.attributionContact} mlsNumber={listing.mlsNumber ?? listing.id} />
                  </div>
                  <div className="listing-row__action">
                    <strong>{formatCurrency(listing.price)}</strong>
                    <button type="button" onClick={() => openListing(listing)}>
                      View {listing.address.line || "home"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <footer className="listing-footer">
        <IdxDisclosure live={installation.mode === "live"} sourceName={result?.source.name} sourceCheckedAt={result?.sourceCheckedAt} />
        <p>
          Search provided for {brokerage.name}. Live inventory requires an
          approved MLS data agreement.
        </p>
      </footer>

      {selected ? (
        <div className="inquiry-layer">
          <button
            className="inquiry-layer__backdrop"
            type="button"
            aria-label="Close inquiry"
            onClick={() => setSelected(null)}
          />
          <aside
            className="inquiry-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="inquiry-title"
          >
            <header>
              <div>
                <p>Home details</p>
                <h2 id="inquiry-title">{selected.address.line}</h2>
                <span>{formatCurrency(selected.price)}</span>
                <ListingAttribution live={result?.source.mode === "live"} brokerage={selected.listOfficeName} coBrokerage={selected.coListOfficeName} contact={selected.attributionContact} mlsNumber={selected.mlsNumber ?? selected.id} />
              </div>
              <button type="button" onClick={() => setSelected(null)}>
                Close
              </button>
            </header>
            <IdxDisclosure live={installation.mode === "live"} sourceName={result?.source.name} sourceCheckedAt={result?.sourceCheckedAt} />

            {inquiryState.kind === "delivered" ||
            inquiryState.kind === "pending" ||
            inquiryState.kind === "preview" ||
            inquiryState.kind === "unavailable" ? (
              <div className={`inquiry-result inquiry-result--${inquiryState.kind}`}>
                <BrokerageMark name={brokerage.name} />
                <h3>
                  {inquiryState.kind === "delivered"
                    ? "Inquiry delivered"
                    : inquiryState.kind === "pending"
                      ? "Inquiry queued"
                    : inquiryState.kind === "preview"
                      ? "Inquiry previewed"
                      : "Delivery unavailable"}
                </h3>
                <p>{inquiryState.message}</p>
                {inquiryState.requestId ? (
                  <p className="inquiry-result__request">
                    Request ID {inquiryState.requestId}
                  </p>
                ) : null}
                <button type="button" onClick={() => setSelected(null)}>
                  Return to listings
                </button>
              </div>
            ) : !isInquiryFormOpen ? (
              <div>
                <section className="listing-detail" aria-label="Listing details">
                  {selected.photos.length > 0 ? (
                    <div className="listing-detail__photos">
                      {selected.photos.slice(0, 3).map((photo) => (
                        <img key={`${photo.url}-${photo.order}`} src={photo.url} alt={photo.alt} />
                      ))}
                    </div>
                  ) : null}
                  <ListingFacts listing={selected} />
                  {selected.publicRemarks ? <p>{selected.publicRemarks}</p> : null}
                </section>
                <button
                  className="listing-detail__inquiry"
                  type="button"
                  onClick={() => setIsInquiryFormOpen(true)}
                >
                  Ask about this home
                </button>
              </div>
            ) : (
              <form className="inquiry-form" onSubmit={submitInquiry}>
                {result?.source.mode === "demo" ? (
                  <p className="inquiry-preview-note">
                    Browser-only preview: use any contact details. Nothing in
                    this form will be sent or stored.
                  </p>
                ) : null}
                <label>
                  <span>Name</span>
                  <input
                    autoFocus
                    value={inquiry.name}
                    onChange={(event) =>
                      setInquiry({ ...inquiry, name: event.target.value })
                    }
                    autoComplete="name"
                  />
                </label>
                <div className="inquiry-form__contacts">
                  <label>
                    <span>Email</span>
                    <input
                      type="email"
                      value={inquiry.email}
                      onChange={(event) =>
                        setInquiry({ ...inquiry, email: event.target.value })
                      }
                      autoComplete="email"
                    />
                  </label>
                  <label>
                    <span>Phone</span>
                    <input
                      type="tel"
                      value={inquiry.phone}
                      onChange={(event) =>
                        setInquiry({ ...inquiry, phone: event.target.value })
                      }
                      autoComplete="tel"
                    />
                  </label>
                </div>
                <p className="inquiry-form__hint">Enter an email or phone number.</p>
                <label>
                  <span>Message</span>
                  <textarea
                    value={inquiry.message}
                    onChange={(event) =>
                      setInquiry({ ...inquiry, message: event.target.value })
                    }
                    rows={4}
                  />
                </label>
                <label className="inquiry-form__consent">
                  <input
                    type="checkbox"
                    checked={inquiry.consent}
                    onChange={(event) =>
                      setInquiry({ ...inquiry, consent: event.target.checked })
                    }
                  />
                  <span>
                    I agree that {brokerage.name} may contact me about this home.
                  </span>
                </label>
                <label className="inquiry-form__honeypot" aria-hidden="true">
                  Website
                  <input
                    tabIndex={-1}
                    value={inquiry.website}
                    onChange={(event) =>
                      setInquiry({ ...inquiry, website: event.target.value })
                    }
                    autoComplete="off"
                  />
                </label>
                {inquiryState.kind === "error" ? (
                  <p className="inquiry-form__error" role="alert">
                    {inquiryState.message}
                  </p>
                ) : null}
                <button
                  className="inquiry-form__submit"
                  type="submit"
                  disabled={
                    inquiryState.kind === "sending" ||
                    !inquiry.consent ||
                    (!inquiry.email.trim() && !inquiry.phone.trim())
                  }
                >
                  {inquiryState.kind === "sending"
                    ? "Preparing inquiry"
                    : result?.source.mode === "demo"
                      ? "Preview inquiry"
                      : "Send inquiry"}
                </button>
              </form>
            )}
          </aside>
        </div>
      ) : null}
    </main>
  );
}
