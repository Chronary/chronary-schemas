/**
 * Webhook event payload schemas and discriminator.
 *
 * The Chronary webhook wire format puts the event type in the
 * `X-Chronary-Event-Type` header and a raw payload object in the body.
 * Use {@link parseWebhookEvent} to combine the two into a typed,
 * discriminated object.
 */

import { z } from 'zod';

import { WEBHOOK_EVENT_TYPES, type WebhookEventType } from './shared';

export { WEBHOOK_EVENT_TYPES } from './shared';
export type { WebhookEventType } from './shared';

// Each payload schema uses .passthrough() so forward-compatible field
// additions on the API side don't break consumers. Known fields are
// validated strictly; unknown fields are preserved.

const AgentCreatedPayloadSchema = z
  .object({
    agent: z.object({}).passthrough(),
  })
  .passthrough();

const AgentUpdatedPayloadSchema = z
  .object({
    agent: z.object({}).passthrough(),
  })
  .passthrough();

const EventCreatedPayloadSchema = z
  .object({
    event: z.object({}).passthrough(),
    // Present when the event was created through a public booking page
    // (#1036). Lets consumers correlate an inbound booking to the page that
    // produced it. Absent for events created via the normal API/MCP paths.
    booking_page_id: z.string().optional(),
  })
  .passthrough();

const EventUpdatedPayloadSchema = z
  .object({
    event: z.object({}).passthrough(),
  })
  .passthrough();

const EventDeletedPayloadSchema = z
  .object({
    event_id: z.string(),
    calendar_id: z.string(),
  })
  .passthrough();

const EventLifecyclePayloadSchema = z
  .object({
    event_id: z.string(),
    calendar_id: z.string(),
    title: z.string(),
    start_time: z.string(),
    end_time: z.string(),
    // Present when the fire is for one occurrence of a recurring series (#996).
    // The ISO start of that occurrence; start_time/end_time are the occurrence's
    // own times, and event_id is the series master's id.
    occurrence_start: z.string().optional(),
  })
  .passthrough();

const EventHoldCreatedPayloadSchema = EventLifecyclePayloadSchema;
const EventStartedPayloadSchema = EventLifecyclePayloadSchema;
const EventEndedPayloadSchema = EventLifecyclePayloadSchema;
const EventReminderPayloadSchema = z
  .object({
    event_id: z.string(),
    calendar_id: z.string(),
    title: z.string(),
    start_time: z.string(),
    end_time: z.string(),
    reminder_minutes: z.number().int(),
    // See EventLifecyclePayloadSchema — set for recurring-occurrence reminders.
    occurrence_start: z.string().optional(),
  })
  .passthrough();
const EventHoldExpiredPayloadSchema = z
  .object({
    event_id: z.string(),
  })
  .passthrough();
const EventHoldReleasedPayloadSchema = z
  .object({
    event_id: z.string(),
  })
  .passthrough();
const EventHoldConfirmedPayloadSchema = z
  .object({
    event_id: z.string(),
  })
  .passthrough();

const ProposalCreatedPayloadSchema = z
  .object({
    proposal: z.object({}).passthrough(),
  })
  .passthrough();

const ProposalRespondedPayloadSchema = z
  .object({
    proposal_id: z.string(),
    agent_id: z.string(),
    response: z.string(),
  })
  .passthrough();

const ProposalConfirmedPayloadSchema = z
  .object({
    proposal_id: z.string(),
  })
  .passthrough();

const ProposalCancelledPayloadSchema = z
  .object({
    proposal_id: z.string(),
    reason: z.string().optional(),
  })
  .passthrough();

const ProposalExpiredPayloadSchema = z
  .object({
    proposal_id: z.string(),
  })
  .passthrough();

const WebhookDeactivatedPayloadSchema = z
  .object({
    webhook_id: z.string(),
    url: z.string(),
    reason: z.string(),
  })
  .passthrough();

const PAYLOAD_SCHEMAS = {
  'agent.created': AgentCreatedPayloadSchema,
  'agent.updated': AgentUpdatedPayloadSchema,
  'event.created': EventCreatedPayloadSchema,
  'event.updated': EventUpdatedPayloadSchema,
  'event.deleted': EventDeletedPayloadSchema,
  'event.started': EventStartedPayloadSchema,
  'event.ended': EventEndedPayloadSchema,
  'event.reminder': EventReminderPayloadSchema,
  'event.hold_created': EventHoldCreatedPayloadSchema,
  'event.hold_expired': EventHoldExpiredPayloadSchema,
  'event.hold_released': EventHoldReleasedPayloadSchema,
  'event.hold_confirmed': EventHoldConfirmedPayloadSchema,
  'proposal.created': ProposalCreatedPayloadSchema,
  'proposal.responded': ProposalRespondedPayloadSchema,
  'proposal.confirmed': ProposalConfirmedPayloadSchema,
  'proposal.expired': ProposalExpiredPayloadSchema,
  'proposal.cancelled': ProposalCancelledPayloadSchema,
  'webhook.deactivated': WebhookDeactivatedPayloadSchema,
} satisfies Record<WebhookEventType, z.ZodType>;

export {
  AgentCreatedPayloadSchema,
  AgentUpdatedPayloadSchema,
  EventCreatedPayloadSchema,
  EventUpdatedPayloadSchema,
  EventDeletedPayloadSchema,
  EventStartedPayloadSchema,
  EventEndedPayloadSchema,
  EventReminderPayloadSchema,
  EventHoldCreatedPayloadSchema,
  EventHoldExpiredPayloadSchema,
  EventHoldReleasedPayloadSchema,
  EventHoldConfirmedPayloadSchema,
  ProposalCreatedPayloadSchema,
  ProposalRespondedPayloadSchema,
  ProposalConfirmedPayloadSchema,
  ProposalCancelledPayloadSchema,
  ProposalExpiredPayloadSchema,
  WebhookDeactivatedPayloadSchema,
};

/**
 * A webhook event combines the event type (from the
 * `X-Chronary-Event-Type` header) with the parsed payload body.
 *
 * Use discriminated narrowing on `type`:
 * ```ts
 * const event = parseWebhookEvent(
 *   req.header('x-chronary-event-type'),
 *   req.body,
 * );
 * if (event.type === 'event.created') {
 *   //     ^ narrowed to { type: 'event.created'; data: EventCreatedPayload }
 * }
 * ```
 */
export type WebhookEvent = {
  [K in WebhookEventType]: {
    type: K;
    data: z.infer<(typeof PAYLOAD_SCHEMAS)[K]>;
  };
}[WebhookEventType];

/**
 * Parse an incoming webhook into a typed, discriminated event.
 *
 * Returns a Zod-style `SafeParseReturnType`-shaped object for ergonomic
 * handling of unknown event types + invalid payloads.
 */
export function parseWebhookEvent(
  eventType: string | null | undefined,
  body: unknown,
):
  | { success: true; event: WebhookEvent }
  | { success: false; error: string } {
  if (!eventType) {
    return {
      success: false,
      error: 'Missing X-Chronary-Event-Type header.',
    };
  }

  if (!WEBHOOK_EVENT_TYPES.includes(eventType as WebhookEventType)) {
    return {
      success: false,
      error: `Unknown event type: ${eventType}`,
    };
  }

  const schema = PAYLOAD_SCHEMAS[eventType as WebhookEventType];
  const result = schema.safeParse(body);
  if (!result.success) {
    return {
      success: false,
      error: `Invalid payload for ${eventType}: ${result.error.message}`,
    };
  }

  return {
    success: true,
    event: { type: eventType, data: result.data } as WebhookEvent,
  };
}
