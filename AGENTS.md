# IDX Home Finder execution guide

Start with [`CONTEXT.md`](./CONTEXT.md), then read [`PRODUCT.md`](./PRODUCT.md), [`STATE.md`](./STATE.md), [`HOME-FINDER-PILOT.md`](./HOME-FINDER-PILOT.md), and [`TRESTLE-ONBOARDING.md`](./TRESTLE-ONBOARDING.md). Read [`../CONTEXT.md`](../CONTEXT.md) and the accepted company ADRs before changing product meaning. The implementation, tests, provider rules, and live systems outrank descriptive docs.

## Before changing anything

- Run `git status --short --branch` and preserve unrelated work.
- Keep the synthetic `agency-preview` path safe: it must not post, persist, or imply delivery of buyer data.
- Treat every installation as a distinct authority boundary. Brokerage identity, embedding origin, inquiry destination, Agency Partner receipt destination, MLS source, and freshness rule come from validated server configuration, never browser input.

## Live-mode gates

Do not configure, deploy, or describe a live installation without all of the following:

- a participating brokerage and documented MLS/provider authorization;
- approved attribution, display, filtering, and freshness rules for that source;
- server-only Trestle, signing, encryption, mail, webhook, and worker credentials;
- exact verified inquiry and Agency Partner receipt destinations;
- an HTTPS brokerage origin in the installation's `frame-ancestors` allowlist;
- persistent single-writer Node storage with backups and a scheduled worker; and
- a consented end-to-end delivery test.

Production deployment, credentials, provider enrollment, real email, scheduled work, brokerage-site changes, buyer-data handling, or commercial promises require Jacob's explicit authority.

## Trust boundaries

- Filter non-displayable inventory and prove feed freshness before returning or signing a live listing. If feed-level evidence is insufficient, fail the entire live result closed.
- A signed listing token binds the inquiry to a current installation, listing ID, and address. Do not accept a browser-supplied destination or unsigned listing identity.
- Provider acceptance is pending, not delivered. Only a verified `email.delivered` webhook produces delivered state.
- Preserve idempotent submission IDs, encrypted routing snapshots, retry limits, seven-day inquiry-content retention, and content-free receipts. Configuration changes must not redirect an already accepted job.
- SQLite is pilot infrastructure only. Do not place it on an ephemeral or multi-writer target.
- `/ops` inspects one public HTML response. It does not prove vendor access, feed freshness, authenticated behavior, persistence, monitoring, or compliance.

## Change routing

| Concern | Primary owners |
| --- | --- |
| Installation identity and public configuration | `src/lib/installations/` |
| Provider query, mapping, freshness, displayability | `src/lib/mls/`, `src/lib/idx/`, `app/api/listings/` |
| Inquiry validation, tokens, delivery, receipts, retention | `src/lib/inquiries/`, inquiry API routes |
| Embed behavior | `app/embed/`, `src/components/listing-concierge.tsx`, `proxy.ts` |
| Startup fail-closed validation | `instrumentation.ts`, `src/lib/startup.ts` |
| Page checker experiment | `app/ops/`, `app/api/check/`, `src/lib/site-check.ts` |

## Proof

Run the focused tests for the changed boundary plus `pnpm exec tsc --noEmit`. Run `pnpm test`, `pnpm test:e2e`, and `pnpm build` for cross-route, configuration, inquiry, or release work. Test success and failure paths for live gates, stale or forbidden listings, invalid tokens, duplicate submission, provider failure, webhook verification, retry, expiry, and purge behavior. Inspect the embed in demo mode at desktop and mobile sizes. Never report local evidence as a live delivery or commercial result.

Documentation-only changes require valid relative links, `git diff --check`, and review of the complete diff.
