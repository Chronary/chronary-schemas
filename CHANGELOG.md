# Changelog

All notable changes to `@chronary/schemas` will be documented in this file starting with the soft-launch release.

## 0.4.1 — 2026-10-18

- `CreateICalSubscriptionSchema.url` and `UpdateICalSubscriptionSchema.url` emit `format: "uri"` in JSON Schema again. Under zod 4, the HTTPS `.startsWith()` check had overwritten the format with a non-standard `starts_with`. HTTPS is now enforced with `.refine`, with the same validation and the same `URL must use HTTPS` message (#1117).

## 0.4.0 — 2026-07-14

- Add optional `booking_page_id` to the `event.created` webhook payload so consumers can correlate an inbound booking to the public booking page that produced it (#1036).

## 0.1.3 — 2026-05-20

- First OIDC + Sigstore provenance release. Published via npm Trusted Publishing from `Chronary/chronary-schemas`'s `release-artifact.yml`. No behavioral change vs 0.1.2 — bootstrap 0.1.2 was published manually with a classic token before Trusted Publisher could be registered (npm has no Pending Publisher flow).

## 0.1.2 — 2026-05-18

- Add `CONTRIBUTING.md` to the public mirror documenting that this repo is generated from a private monorepo; PRs are welcome as proof-of-concept but can't be merged directly. No behavioral change.
