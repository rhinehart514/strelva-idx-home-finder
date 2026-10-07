# Trestle and NYSAMLS activation handoff

The software is ready for credentials. Live inventory is intentionally blocked
until Strelva and a participating broker complete the provider and MLS approval
steps below. Do not put credentials in client-side variables or commit them.

## Prepared product record

- Product name: `IDX Home Finder`
- Product type: Web
- Status: In development
- Intended connection: NYSAMLS RESO IDX Web API
- Initial coverage: Excludes Ithaca unless a signed customer requires it
- Description: Agency Partner-operated, brokerage-branded public home search for
  WNY Brokerage Accounts. It
  displays MLS-authorized IDX fields and media, lets consumers search inventory,
  and routes a selected-listing inquiry to the participating brokerage. Strelva
  operates as the brokerage's technology provider; the brokerage controls its
  branding, display, and inquiry destination. The product does not resell,
  syndicate, or expose raw MLS data.

Use the real deployed product URL when the form requests a URL. A local address
is not a valid provider record.

## Information Jacob must provide at the signup boundary

- Strelva legal company name, incorporation type/state, and business address
- Primary contact name, title, phone, and email
- Authorized contract signatory
- Payment card for Trestle charges
- Product logo if desired

Submitting the wizard accepts provider terms and may start billing, so it is an
authority boundary rather than a software task.

## Information the participating broker must provide

- One WNYREIS/NYSAMLS designated broker participant with IDX rights
- Brokerage legal/display name and office identifiers
- Broker signatory and, where required, the associated agent
- Approved listing statuses, fields, media, attribution, disclaimer, refresh,
  sold-data, and VOW rules for this connection
- A verified brokerage email that should receive consented Listing Inquiries
- The exact brokerage website origin that will embed the installation

Trestle's connection flow may route the three-party agreement through
Authentisign. A sample feed can prove the adapter but is not evidence of
WNYREIS/NYSAMLS authorization.

## Activation sequence

1. Create the Technology Provider account in the Trestle subscription wizard.
2. Add the prepared product and associate the RESO IDX Web API.
3. Select the New York State Alliance of MLSs connection and review the exact
   local fees and contract terms shown in the dashboard.
4. Have the participating broker and any required agent sign the MLS agreement.
5. Store `TRESTLE_CLIENT_ID` and `TRESTLE_CLIENT_SECRET` only in server
   environment variables. Put the MLS-approved display attribution and refresh
   rule in the server-side installation record.
6. Confirm real records, media, permitted statuses, listing-firm and co-listing-firm
   attribution, the participant-provided `AttributionContact`, IDX mark/disclosures,
   and source update timestamps in staging before public release.
7. Verify the Brokerage Account inquiry email and Agency Partner receipt email.
8. Configure Resend delivery/bounce events, encrypted durable storage, and the
   scheduled inquiry worker described in `README.md`.
9. Embed the installation on the allowed brokerage origin, submit a consented
   test inquiry, and retain the confirmed Delivery Receipt.

## Current implementation boundary

The live adapter calls Cotality Trestle's OAuth client-credentials endpoint and
Property RESO Web API from the server. It caches tokens, retries one unauthorized
request after refreshing, applies request timeouts, escapes filters, selects a
fixed field set, normalizes the response, and rejects unsafe media URLs.

It currently queries Trestle per buyer request. For a higher-volume production
launch, add an owned search index with incremental modification timestamps,
withdrawal/tombstone handling, retry/backoff, and source-update evidence rather
than sending each keystroke or request upstream.

## Official starting points

- Trestle subscription wizard: https://trestle.corelogic.com/SubscriptionWizard/
- Cotality Trestle Web API docs: https://trestle-documentation.corelogic.com/webapi.html
- GRAR IDX data-feed overview: https://www.grar.org/idx-data-feed-overview/

Contacts discovered in the currently published local guide should be rechecked
before relying on them: WNYREIS/BNAR at 716-636-9000 option 3, plus
`trestlesupport@cotality.com` for the provider platform.
