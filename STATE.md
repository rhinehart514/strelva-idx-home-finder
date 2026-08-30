# Current state

Updated: 2026-08-30 from the current working tree.

This file separates implemented capability from a live installation, actual use, and commercial proof.

## Implemented

- The Next.js app provides a brokerage-branded `/embed/[installationId]`, listing and inquiry APIs, Resend webhook handling, internal process and receipt routes, and the separate `/ops` checker.
- The default `agency-preview` installation uses synthetic inventory and returns inquiry preview responses without sending or storing buyer data.
- Live configuration validates the installation, allowed framing origins, brokerage and agency fields, MLS source and freshness rule, verified destinations, Trestle provider configuration, signed listing tokens, encryption, storage, mail, webhook, and worker secret.
- Live listing search queries Trestle, maps provider records, applies freshness and displayability checks, and signs returned listing identity. Unprovable feed evidence fails closed.
- Inquiry submission is size-limited, validated, rate-limited, token-bound, and idempotent. Pending content and its original routing snapshot are AES-256-GCM encrypted in SQLite.
- The workflow distinguishes provider acceptance from delivery, consumes signed Resend events, retries failure within the seven-day content window, sends content-free attempt receipts, and retains content-free delivery receipts for twelve months.
- SQLite is deliberately constrained to persistent, single-writer Node operation; startup rejects incomplete live configuration.
- On 2026-08-30, the current tree passed 53 Vitest tests across 11 files, 6 Playwright tests across desktop and mobile projects, TypeScript checking, and the production build.

## Live, use, and commercial evidence

- No participating Brokerage Account, MLS/provider approval, permitted production feed, production credentials, durable deployed store, scheduled production worker, or approved live display rules were established in this review.
- No real brokerage embed or consented delivery test was verified.
- The paid pilot, first renewal, second installation, retained use, and revenue remain unproven. Repository pricing and proof terms are an offer definition, not evidence of acceptance or payment.

## Current attention

- Earn the first authorized paid pilot and delivery proof before expanding architecture or scope.
- Preserve the fail-closed distinction between demo and live modes while current uncommitted interface work evolves.
- Validate actual provider semantics, MLS display rules, webhook delivery, worker scheduling, backups, and recovery on the chosen production environment before launch.
