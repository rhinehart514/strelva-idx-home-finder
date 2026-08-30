# IDX Home Finder

Reviewed: 2026-08-30
Kind: Pilot-scale product candidate

## Role

Test whether an Agency Partner will buy and renew a brokerage-branded IDX home-search installation that delivers consented listing inquiries with verifiable receipts.

## Evidence state

- **Implemented** means present and verified in this repository.
- **Live** requires a real deployed installation with permitted provider data and working production operations.
- **Used** requires a buyer search or consented delivery test on a participating brokerage site.
- **Commercially proven** requires the paid and renewal evidence defined in [`HOME-FINDER-PILOT.md`](./HOME-FINDER-PILOT.md).

The current repository establishes implementation only. It does not establish a participating brokerage, MLS/provider approval, deployment, use, delivery, renewal, or revenue.

## Owns

- Brokerage-branded embedded home search, installation configuration, IDX display controls, and inquiry delivery evidence.
- Pilot-sized Trestle, Resend, worker, retention, and SQLite implementation.
- The separate `/ops` public-page checker experiment.

## Does not own

- Brokerage or MLS authority, display-rule approval, credentials, or consent that has not been explicitly obtained.
- Agency CRM, lead management, listing syndication, SEO/indexing outcomes, or an entire real-estate operating system.
- A company-wide Operations product; `/ops` remains a separate experiment.
- Production status or product proof merely because live-mode code exists.

## Current attention

The next meaningful result is not more platform breadth. It is one properly authorized, paid WNY pilot on a real brokerage site with a consented inquiry whose provider delivery event produces the expected content-free receipt.

## Verify before consequential action

```bash
pnpm exec tsc --noEmit
pnpm test
pnpm test:e2e
pnpm build
```

## Context map

| Need | Read |
| --- | --- |
| Durable purpose and boundaries | [`PRODUCT.md`](./PRODUCT.md) |
| Current implementation and evidence gaps | [`STATE.md`](./STATE.md) |
| Execution and authority rules | [`AGENTS.md`](./AGENTS.md) |
| Setup and architecture summary | [`README.md`](./README.md) |
| Paid pilot and product-proof gates | [`HOME-FINDER-PILOT.md`](./HOME-FINDER-PILOT.md) |
| MLS/provider onboarding boundary | [`TRESTLE-ONBOARDING.md`](./TRESTLE-ONBOARDING.md) |
| Visual direction | [`DESIGN.md`](./DESIGN.md) |
| Company truth | [`../CONTEXT.md`](../CONTEXT.md) |
