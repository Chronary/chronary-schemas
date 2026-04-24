/**
 * `@chronary/schemas` — Zod schemas + types for the Chronary calendar API.
 *
 * Subsets the internal `@chronary/shared` schemas for external consumers,
 * plus new per-event-type webhook payload schemas for runtime validation
 * of incoming webhooks.
 *
 * See {@link ./events | `./events`} for webhook-specific exports.
 */

// Webhook payload schemas + discriminator.
export * from './events';

// Re-export the request schemas that make sense for external consumers.
// These come from `@chronary/shared`, which is a private workspace package;
// tsup bundles the schema definitions into the published output so
// consumers have no runtime dependency on `@chronary/shared`.

export {
  // Calendars
  CreateCalendarSchema,
  UpdateCalendarSchema,
  ListCalendarsQuerySchema,
  type CreateCalendarInput,
  type UpdateCalendarInput,
  type ListCalendarsQuery,

  // Events
  EVENT_STATUSES,
  CreateEventSchema,
  UpdateEventSchema,
  ListEventsQuerySchema,
  type EventStatus,
  type CreateEventInput,
  type UpdateEventInput,
  type ListEventsQuery,

  // Availability
  WorkingHoursSchema,
  UpdateAvailabilityRulesSchema,
  AvailabilityQuerySchema,
  CrossAgentAvailabilityQuerySchema,
  type WorkingHours,
  type UpdateAvailabilityRules,
  type AvailabilityQuery,
  type CrossAgentAvailabilityQuery,

  // Webhook subscriptions (management) — event payload schemas are in ./events
  CreateWebhookSchema,
  UpdateWebhookSchema,
  ListWebhooksQuerySchema,
  ListDeliveriesQuerySchema,
  WebhookDeliveryStatusSchema,
  WEBHOOK_DELIVERY_STATUSES,
  type CreateWebhookInput,
  type UpdateWebhookInput,
  type ListWebhooksQuery,
  type ListDeliveriesQuery,
  type WebhookDeliveryStatus,

  // iCal subscriptions
  CreateICalSubscriptionSchema,
  UpdateICalSubscriptionSchema,
  ListICalSubscriptionsQuerySchema,
  type CreateICalSubscriptionInput,
  type UpdateICalSubscriptionInput,
  type ListICalSubscriptionsQuery,

  // Agents
  CreateAgentSchema,
  UpdateAgentSchema,
  ListAgentsQuerySchema,
  type CreateAgentInput,
  type UpdateAgentInput,
  type ListAgentsQuery,

  // Scheduling / proposals
  CreateProposalSchema,
  RespondToProposalSchema,
  type CreateProposalInput,
  type RespondToProposalInput,
} from '@chronary/shared';
