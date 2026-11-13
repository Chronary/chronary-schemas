# Changelog

All notable changes to `@chronary/schemas` will be documented in this file starting with the soft-launch release.

## 0.7.1 — 2026-11-12

- Request date-times accept an RFC 3339 numeric offset (`+00:00`, `-08:00`, `+05:30`) as well as `Z`, matching the API. An offset value is normalised to the same instant in UTC (`2026-11-20T09:00:00-08:00` → `2026-11-20T17:00:00.000Z`); a `Z` value is unchanged. Applies to `CreateEventSchema`, `UpdateEventSchema`, `ListEventsQuerySchema`, `AvailabilityQuerySchema`, `CrossAgentAvailabilityQuerySchema`, `ListDeliveriesQuerySchema`, `ProposalSlotSchema` and `CreateProposalSchema` (#1989).

## 0.7.0 — 2026-11-04

- `WEBHOOK_DELIVERY_STATUSES` gains `dropped`: a Free-plan delivery the monthly limit stopped, recorded with `last_error_code: 'quota_exceeded'` instead of disappearing. `ListDeliveriesQuerySchema` gains `event_type` (exact, or a prefix ending in a dot such as `event.`), `created_after`, `created_before`, `delivery_id`, `is_test` and `cursor`, and rejects a cursor combined with a non-zero offset (#1200).
- Request schemas gain length limits: event `description` at most 10,000 characters, agent `description` at most 5,000, webhook and iCal subscription `url` at most 2,048, and calendar `timezone` at most 64 (#1672).

## 0.6.1 — 2026-11-04

- Fix `WebhookDeactivatedPayloadSchema`: real `webhook.deactivated` deliveries carry `webhook_origin` and `webhook_path` (the endpoint with its query string removed), not `url`, so `parseWebhookEvent` rejected every one. `webhook_origin` and `webhook_path` are now optional fields, and `url` is optional and deprecated (#1200).

## 0.6.0 — 2026-11-01

- Add the `calendar_connection.reauthorization_required` webhook event type and `CalendarConnectionReauthorizationRequiredPayloadSchema` (`connection_id`, `provider`, `reauthorization_reason`, `impacted_agent_count`, `occurred_at`). It fires once when a connected human calendar stops accepting access, so agents learn their availability now fails closed (#1196).

## 0.5.0 — 2026-10-20

- Add the `org.plan_changed` webhook event type and `OrgPlanChangedPayloadSchema` (`org_id`, `previous_plan`, `plan`, `source`, `subscription_status`, `interval`, `upgrade_request_id`) (#1130).

## 0.4.1 — 2026-10-18

- `CreateICalSubscriptionSchema.url` and `UpdateICalSubscriptionSchema.url` emit `format: "uri"` in JSON Schema again. Under zod 4, the HTTPS `.startsWith()` check had overwritten the format with a non-standard `starts_with`. HTTPS is now enforced with `.refine`, with the same validation and the same `URL must use HTTPS` message (#1117).

## 0.4.0 — 2026-07-14

- Add optional `booking_page_id` to the `event.created` webhook payload so consumers can correlate an inbound booking to the public booking page that produced it (#1036).

## 0.1.3 — 2026-05-20

- First OIDC + Sigstore provenance release. Published via npm Trusted Publishing from `Chronary/chronary-schemas`'s `release-artifact.yml`. No behavioral change vs 0.1.2 — bootstrap 0.1.2 was published manually with a classic token before Trusted Publisher could be registered (npm has no Pending Publisher flow).

## 0.1.2 — 2026-05-18

- Add `CONTRIBUTING.md` to the public mirror documenting that this repo is generated from a private monorepo; PRs are welcome as proof-of-concept but can't be merged directly. No behavioral change.
