# Strelva agency search product design

## Primary product truth

The root experience is an agency-owned WNY home search. A buyer arrives with a
place or price in mind, searches permitted inventory, sees the source, update
time, listing brokerage, and reliability disclaimer, then sends a consented
inquiry about one selected home to the named agency. The finished result is a
specific listing inquiry with an explicit delivery state.

Until Trestle credentials and the participating broker's MLS authorization are
present, the product runs in demo mode. Demo homes are synthetic, visibly
labeled, and inquiry submissions are validated locally without transmission.
The interface must never make sample data look live or make previewed delivery
look sent.

Live results are displayable only when source name, valid update time, and
listing brokerage evidence are present and the feed timestamp is no more than
12 hours old. This is a display guard, not a claim of continuous monitoring.

## Operations tool

IDX page check is a Strelva Labs micro-product for real-estate web agencies. It
turns one public IDX page into a timestamped evidence receipt and names the next
manual action. Without it, an operator opens the page, inspects the response,
and rewrites the findings into a vendor or developer ticket.

The first useful result is a public-site check. It reports only what the server
observed on the requested public page. It does not claim MLS access, feed-level
freshness, continuous monitoring, or vendor-side approval status.

At `/ops`, the primary object is a **page check**. The primary action is **check page**.
Evidence states the requested hostname, response status, observation time, and
scope. The check is not saved.

## Operations experience

The opening surface is one Strelva command bar followed by one evidence receipt.
A public URL can be checked without an account. There are no seeded sites,
sample checks, fabricated queues, monitoring claims, or empty dashboard chrome.

Normal results are issue found, IDX signals found, and IDX not confirmed.
Unknown means the page responded but the public check could not confirm IDX
signals. Errors state what failed, preserve the entered URL, and do not remove a
previous usable receipt.

## Shared visual system

Creative north star: **Strelva field instrument**. Both surfaces use the Strelva
cairn, editorial display type, restrained graphite surfaces, and one sage action.
The buyer experience is an editorial listing ledger; the operations experience
centers its proof receipt.

- Tokens inherit the Strelva dark palette in `app/globals.css`.
- Display: Fraunces. Body and UI: DM Sans.
- The cairn, command bar, status, and proof receipt are the official components.
- Radius: 16px surfaces, 10px inputs, 999px primary actions.
- Motion: one 360ms receipt entrance, disabled under reduced motion.

## Stack and constraints

Next.js 16, React 19, TypeScript, and owned token CSS. The live checker runs on
the server, rejects local/private destinations, limits redirects and response
size, and records no result. The current workspace has no authentication,
database, billing, or continuous scheduler. The server includes a Trestle OAuth
and RESO Web API adapter, but a real feed exists only after provider credentials
and MLS/broker approval. The interface must not imply capabilities that are not
configured.
