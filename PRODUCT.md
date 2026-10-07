# IDX Home Finder

IDX Home Finder is a brokerage-branded home search that an Agency Partner embeds on a Brokerage Account's existing website. A buyer searches inventory the brokerage is authorized to display, opens a home, and knowingly sends a listing inquiry to the brokerage's verified destination. The Agency Partner receives content-free evidence of the attempt and its eventual delivery state.

The product's job is narrower than a portal or CRM: make a compliant brokerage search useful on the site the brokerage already owns, route consented interest to the right place, and make delivery failure visible without disclosing buyer content to the Agency Partner.

## People and result

- The **buyer** gets a fast branded search and an explicit inquiry action.
- The **Brokerage Account** receives the inquiry at its verified destination and owns the buyer relationship.
- The **Agency Partner** buys and supports the installation for its brokerage client and receives a content-free receipt.
- **Strelva** owns the bounded installation, provider integration, delivery workflow, failure handling, and proof within an accepted pilot.

A successful installation is not merely embedded. It uses permitted data and display rules on the real brokerage origin, and a consented inquiry reaches a provider-confirmed delivered state with the expected receipt.

## Boundaries

- Brokerage, agency, and Strelva branding do not mix inside the embed: the buyer-facing surface is the brokerage's.
- There is no SEO or indexing promise; embed routes are non-indexed.
- Installation and routing configuration is server-owned. Browser input cannot choose a recipient, brokerage identity, MLS rule, or framing origin.
- The candidate does not provide an agency CRM, brokerage back office, automated follow-up, lead scoring, listing management, or general website platform.
- `/ops` is a separate Labs page-check experiment, not a bundled promise or evidence of IDX compliance.
- Trestle connectivity and live-mode implementation do not grant provider or MLS permission.
- Pilot terms and proof gates live in [`HOME-FINDER-PILOT.md`](./HOME-FINDER-PILOT.md). Until those proofs exist, keep the system manual and pilot-sized.

The repository and a verified live installation outrank this file when behavior changes. Rewrite this file when the durable product boundary changes; keep dated evidence in [`STATE.md`](./STATE.md).
