# Strelva agency listing concierge

An agency-owned home search with an honest demo mode, a server-only Trestle
adapter for approved MLS data, per-listing attribution evidence, and a consented
buyer-to-agency inquiry handoff. The original public IDX page checker remains
available at `/ops`.

## Run

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

The app starts in demo mode. Demo homes are synthetic, visibly labeled, and no
MLS connection or external lead delivery is claimed.

## Configuration

Copy `.env.example` to `.env.local`.

- `MLS_PROVIDER=demo` keeps the synthetic listing source.
- `MLS_PROVIDER=trestle` requires an approved Trestle connection plus
  `TRESTLE_CLIENT_ID` and `TRESTLE_CLIENT_SECRET`.
- Live mode also requires the MLS-approved display attribution in
  `IDX_SOURCE_NAME`; the transport name is not substituted for the local MLS.
- `AGENCY_LEAD_DELIVERY_MODE=preview` validates inquiries without sending them.
- Live inquiry delivery requires `AGENCY_LEAD_DELIVERY_MODE=live` and an HTTPS
  `AGENCY_LEAD_WEBHOOK_URL` owned by the agency.

See `TRESTLE-ONBOARDING.md` for the provider and broker activation handoff.

## Verify

```bash
pnpm test
pnpm test:e2e
pnpm build
```

The browser suite runs the buyer journey in desktop and mobile Chromium and
asserts that demo inquiry details remain client-side.

The listing API reads directly from Trestle at request time in live mode; it is
not yet a durable sync/indexing service. Before public launch, confirm the
connection-specific fields, statuses, media, refresh interval, attribution,
disclaimer, sold-data, and VOW rules with the approving MLS.

The `/ops` checker inspects one public HTML response. It does not authenticate
with an IDX vendor, prove feed freshness, save results, or monitor continuously.
