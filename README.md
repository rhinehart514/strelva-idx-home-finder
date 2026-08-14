# IDX Home Finder

IDX Home Finder is a brokerage-branded home search that an Agency Partner embeds
on a Brokerage Account's existing website. A buyer searches authorized IDX
inventory, opens one home, and sends a consented Listing Inquiry to the verified
brokerage email destination. The Agency Partner receives a content-free Delivery
Receipt after the recipient mail server confirms delivery.

The embed shows the Brokerage Account's brand and required MLS attribution. It
does not show Strelva or agency branding and makes no SEO or indexing promise.
The separate Strelva Labs IDX Page Check remains available at `/ops`.

## Run the synthetic preview

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000/embed/agency-preview`. The default installation uses
visibly synthetic homes. Its inquiry preview never posts or stores buyer data.

## Put it on a brokerage site

Configure the installation's exact brokerage origin, then add this iframe to the
brokerage site:

```html
<iframe
  src="https://home-finder.example/embed/buffalo-pilot"
  title="Example Realty home search"
  width="100%"
  height="900"
  loading="lazy"
  style="border:0"
></iframe>
```

Each installation is server-configured in `HOME_FINDER_INSTALLATIONS_JSON`.
`allowedOrigins` becomes the route's `frame-ancestors` Content Security Policy;
an unlisted site cannot frame it. Brokerage and agency routing fields never come
from the browser.

## Live configuration

Copy `.env.example` to `.env.local`. A live installation fails closed unless all
of these are present:

- a participating broker's MLS authorization and approved display rules;
- Trestle client credentials;
- installation-specific source attribution and refresh interval;
- a verified Brokerage Account inquiry email and Agency Partner receipt email;
- Resend sender/API/webhook credentials, a signing key, and a 32-byte content
  encryption key;
- durable storage for `INQUIRY_DB_PATH` and a scheduled worker call.

The listing API queries Trestle on each search. Display freshness uses the
provider-confirmed source-response time against the configured approving-MLS
rule, not browser request time, record modification age, or a hard-coded rule.
The API removes non-displayable records before returning or signing them. If the
feed-level evidence cannot be proven, the entire live result fails closed.

Resend must send `email.delivered`, `email.bounced`, and `email.failed` events to
`POST /api/webhooks/resend`. Provider acceptance leaves the inquiry pending;
only `email.delivered` produces a delivered state. A content-free attempt receipt
is emailed to the Agency Partner after every attempt. Bounces and failures retry
up to five attempts while encrypted Inquiry Content is still within its seven-day
retention window.

Browser retries reuse a submission UUID, preventing the same interaction from
creating a second brokerage delivery. Pending jobs retain an encrypted snapshot
of their original verified routing, so configuration edits cannot redirect buyer
data.

Schedule `POST /api/internal/inquiries/process` with
`Authorization: Bearer $INQUIRY_WORKER_SECRET`. The worker retries due mail,
fails expired inquiries without resending their content, and purges expired
content-free receipts after 12 months. The same bearer can read one receipt at
`GET /api/internal/inquiries/{requestId}`.

SQLite is intentionally the cheapest pilot store. Deploy it only on a persistent
single-writer Node filesystem with backups; serverless ephemeral filesystems are
not a safe live target.

The routing-snapshot schema migration adds the Agency Partner destination to old
receipt rows. It deletes any pre-snapshot pending jobs because their original
verified routing cannot be recovered safely; it never retries them against new
configuration.

See `TRESTLE-ONBOARDING.md` for the human approval boundary and
`HOME-FINDER-PILOT.md` for the commercial proof gate.

When any installation is live, server startup validates the complete
installation, Trestle, mail, signing, encryption, storage, and worker-secret
configuration before serving traffic.

## Verify

```bash
pnpm exec tsc --noEmit
pnpm test
pnpm test:e2e
pnpm build
```

The `/ops` checker only inspects one public HTML response. It does not authenticate
with an IDX vendor, prove feed freshness, save results, or monitor continuously.
