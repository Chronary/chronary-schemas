# Changelog

All notable changes to `@chronary/schemas` will be documented in this file.

## 0.1.0

- Initial public package release — per-event-type Zod schemas for all 17 Chronary webhook event types, plus `parseWebhookEvent` discriminator keyed on the `X-Chronary-Event-Type` header.
- Re-exports request schemas from `@chronary/shared` (Create/Update/List for calendars, events, agents, webhooks, iCal subscriptions, proposals, availability).
- Ships with bundled `@chronary/shared` code — consumers only need `zod` at runtime.
