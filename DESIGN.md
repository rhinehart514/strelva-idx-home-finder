# IDX Home Finder product truth

## Primary journey

The product is an Agency Partner-operated, Brokerage Account-branded Home Finder
Installation on the brokerage's existing site. A buyer searches all authorized
IDX inventory, opens one listing, sees its source/update evidence and listing
brokerage, and sends a consented Listing Inquiry. The selected listing is signed
by the server. Routing is bound to the installation's verified Brokerage Account
email rather than browser input.

The buyer's finished result is a request ID and pending or delivered state. Mail
provider acceptance is pending. A confirmed recipient-mail-server delivery is
delivered. The Agency Partner receives a content-free Delivery Receipt after
every delivery attempt; it never receives buyer contact details through this
workflow.

Demo homes are synthetic and labeled. Demo inquiries stay in the browser. Live
inventory fails closed without broker authorization, Trestle credentials, source
attribution, listing brokerage, a direct source-check time, and the approving
MLS's refresh rule. This prepared NYSAMLSs display caps the configured rule at
12 hours; a tighter approved interval still wins.

## Ownership and retention

The site-owning Brokerage Account owns every Listing Inquiry, including inquiries
about another brokerage's listing. Inquiry Content is encrypted while pending,
retried after provider failures or bounces, and deleted after confirmed delivery,
terminal failure, or seven days. Routing is snapshotted with the encrypted job,
so a later configuration edit cannot redirect pending buyer data. The
content-free Delivery Receipt is retained for 12 months. There is no buyer
account, saved search, favorite, billing screen,
CRM integration, or direct-brokerage sales workflow in the pilot.

## Installation boundary

The Agency Partner supplies the brokerage brand, exact allowed site origins,
verified email destinations, default search, MLS attribution/rule, and optional
office name for featured ordering. Strelva manually configures one installation.
The iframe response uses `frame-ancestors` and `noindex`; embedding does not
promise that listings contribute SEO content to the brokerage site.

## Separate Labs experiment

`/ops` is the preserved IDX Page Check for real-estate web agencies. It turns one
public URL into an unsaved, timestamped HTML evidence receipt and next manual
action. It does not access a feed, authenticate with a vendor, prove freshness,
monitor continuously, or issue a compliance approval.

## Technical boundary

Next.js 16, React 19, TypeScript, Trestle RESO Web API, Resend delivery events,
and encrypted SQLite persistence. The pilot assumes a persistent single-writer
Node host and an external scheduler. It has no authentication, billing, owned
listing index, or continuous feed monitor. Higher-volume operation requires a
durable listing index and a multi-instance queue/store rather than this pilot
architecture.
