import { z } from 'zod';

/**
 * A request date-time: RFC 3339 with `Z` or a numeric offset (`+00:00`,
 * `-08:00`, `+05:30`), the same rule the API applies. An offset value becomes
 * the same instant in UTC (`toISOString()`); a `Z` value passes through
 * unchanged. Refines on the enclosing object compare the normalised values.
 */
const isoDateTimeInput = z
  .string()
  .datetime({ offset: true })
  .transform((v) => (v.endsWith('Z') ? v : new Date(v).toISOString()));

const metadataSchema = z
  .record(z.string(), z.unknown())
  .refine((v) => JSON.stringify(v).length <= 16_384, 'metadata exceeds 16KB');

export const CreateAgentSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(['ai', 'human', 'resource']),
  description: z.string().max(5_000).optional(),
  metadata: metadataSchema.optional(),
});

export const UpdateAgentSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().max(5_000).nullable().optional(),
    metadata: metadataSchema.optional(),
    status: z.enum(['active', 'paused']).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'request body must include at least one field');

export const ListAgentsQuerySchema = z.object({
  type: z.enum(['ai', 'human', 'resource']).optional(),
  status: z.enum(['active', 'paused', 'decommissioned']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const AgentStatusEnum = z.enum(['idle', 'working', 'waiting', 'error']);

// Reminders — minutes before an event's start_time at which an `event.reminder`
// webhook fires. The system default applies when neither the event nor its
// calendar sets a value.
export const REMINDER_MIN_MINUTES = 1;
export const REMINDER_MAX_MINUTES = 40_320; // 28 days
export const REMINDER_MAX_COUNT = 5;
export const DEFAULT_EVENT_REMINDERS: readonly number[] = [10];

// Array of "minutes before start". Deduped and sorted ascending. An empty array
// means "explicitly no reminders"; `null` (on an event/calendar) means "inherit".
export const RemindersSchema = z
  .array(z.number().int().min(REMINDER_MIN_MINUTES).max(REMINDER_MAX_MINUTES))
  .max(REMINDER_MAX_COUNT, `at most ${REMINDER_MAX_COUNT} reminders allowed`)
  .transform((arr) => Array.from(new Set(arr)).sort((a, b) => a - b));

export const CreateCalendarSchema = z.object({
  name: z.string().min(1).max(255),
  timezone: z.string().min(1).max(64),
  agent_status: AgentStatusEnum.optional(),
  // Default reminders inherited by events on this calendar that don't set their
  // own. `null` means "use the system default"; `[]` means "no reminders".
  default_reminders: RemindersSchema.nullable().optional(),
  metadata: metadataSchema.optional(),
});

export const UpdateCalendarSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    timezone: z.string().min(1).max(64).optional(),
    agent_status: AgentStatusEnum.optional(),
    default_reminders: RemindersSchema.nullable().optional(),
    metadata: metadataSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'request body must include at least one field');

export const ListCalendarsQuerySchema = z.object({
  include: z.enum(['all']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const EVENT_STATUSES = ['confirmed', 'tentative', 'cancelled', 'hold'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const HOLD_TTL_MIN_SECONDS = 30;
export const HOLD_TTL_MAX_SECONDS = 15 * 60;

export const CreateEventSchema = z
  .object({
    title: z.string().min(1).max(500),
    start_time: isoDateTimeInput,
    end_time: isoDateTimeInput,
    description: z.string().max(10_000).optional(),
    all_day: z.boolean().default(false),
    status: z.enum(EVENT_STATUSES).default('confirmed'),
    metadata: metadataSchema.optional(),
    reminders: RemindersSchema.nullable().optional(),
    hold_expires_at: isoDateTimeInput.optional(),
    hold_priority: z.number().int().min(0).max(100).optional(),
  })
  .refine((v) => new Date(v.end_time) > new Date(v.start_time), 'end_time must be after start_time')
  .superRefine((v, ctx) => {
    if (v.status === 'hold') {
      if (!v.hold_expires_at) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['hold_expires_at'],
          message: 'hold_expires_at is required when status is "hold"',
        });
        return;
      }
      const ttlMs = new Date(v.hold_expires_at).getTime() - Date.now();
      if (ttlMs < HOLD_TTL_MIN_SECONDS * 1000) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['hold_expires_at'],
          message: `hold_expires_at must be at least ${HOLD_TTL_MIN_SECONDS}s in the future`,
        });
      }
      if (ttlMs > HOLD_TTL_MAX_SECONDS * 1000) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['hold_expires_at'],
          message: `hold_expires_at must be at most ${HOLD_TTL_MAX_SECONDS}s (${HOLD_TTL_MAX_SECONDS / 60} min) in the future`,
        });
      }
    } else {
      if (v.hold_expires_at !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['hold_expires_at'],
          message: 'hold_expires_at is only valid when status is "hold"',
        });
      }
      if (v.hold_priority !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['hold_priority'],
          message: 'hold_priority is only valid when status is "hold"',
        });
      }
    }
  });

export const UpdateEventSchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    description: z.string().max(10_000).nullable().optional(),
    start_time: isoDateTimeInput.optional(),
    end_time: isoDateTimeInput.optional(),
    all_day: z.boolean().optional(),
    status: z.enum(['confirmed', 'tentative', 'cancelled']).optional(),
    metadata: metadataSchema.optional(),
    reminders: RemindersSchema.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'request body must include at least one field');

export const ListEventsQuerySchema = z.object({
  start_after: isoDateTimeInput.optional(),
  start_before: isoDateTimeInput.optional(),
  status: z.enum(EVENT_STATUSES).optional(),
  source: z.enum(['internal', 'external_ical']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const WorkingHoursDaySchema = z
  .object({
    start: z.string().regex(/^\d{2}:\d{2}$/, 'must be HH:MM'),
    end: z.string().regex(/^\d{2}:\d{2}$/, 'must be HH:MM'),
  })
  .refine((v) => v.end > v.start, 'end must be after start');

export const WorkingHoursSchema = z
  .object({
    mon: WorkingHoursDaySchema.optional(),
    tue: WorkingHoursDaySchema.optional(),
    wed: WorkingHoursDaySchema.optional(),
    thu: WorkingHoursDaySchema.optional(),
    fri: WorkingHoursDaySchema.optional(),
    sat: WorkingHoursDaySchema.optional(),
    sun: WorkingHoursDaySchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'at least one day must be specified');

export const UpdateAvailabilityRulesSchema = z.object({
  buffer_before_minutes: z.number().int().min(0).max(120).default(0),
  buffer_after_minutes: z.number().int().min(0).max(120).default(0),
  working_hours: WorkingHoursSchema.nullable().default(null),
  timezone: z.string().min(1).max(64).default('UTC'),
});

const SLOT_DURATIONS = ['15m', '30m', '45m', '1h', '2h'] as const;
type SlotDuration = (typeof SLOT_DURATIONS)[number];
const DEFAULT_SLOT_DURATION: SlotDuration = '30m';

const DurationEnum = z.enum(SLOT_DURATIONS);

// `duration` is the preferred public parameter for the requested slot length;
// `slot_duration` is a deprecated backward-compatible alias. Callers may send
// either (or both, if identical). Both are optional at the boundary and are
// coalesced into the canonical internal `slot_duration` — so downstream
// services keep reading `query.slot_duration` unchanged. Sending both with
// DIFFERENT values is a 400 rather than a silent pick, so an agent that
// disagrees with itself gets told instead of getting the wrong slot length.
const durationFields = {
  duration: DurationEnum.optional(),
  slot_duration: DurationEnum.optional(),
};

function refineDurationConflict(
  v: { duration?: SlotDuration; slot_duration?: SlotDuration },
  ctx: z.RefinementCtx,
): void {
  if (
    v.duration !== undefined &&
    v.slot_duration !== undefined &&
    v.duration !== v.slot_duration
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "`duration` and `slot_duration` conflict; send only one (they are aliases). `slot_duration` is deprecated — prefer `duration`.",
      path: ['duration'],
    });
  }
}

function resolveDuration<T extends { duration?: SlotDuration; slot_duration?: SlotDuration }>(
  v: T,
): Omit<T, 'duration'> & { slot_duration: SlotDuration } {
  const { duration, ...rest } = v;
  return { ...rest, slot_duration: duration ?? v.slot_duration ?? DEFAULT_SLOT_DURATION };
}

export const AvailabilityQuerySchema = z
  .object({
    start: isoDateTimeInput,
    end: isoDateTimeInput,
    ...durationFields,
    include_busy: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
  })
  .superRefine(refineDurationConflict)
  .transform(resolveDuration)
  .refine((v) => new Date(v.end) > new Date(v.start), 'end must be after start');

export const CrossAgentAvailabilityQuerySchema = z
  .object({
    agents: z.string().min(1).transform((v) => v.split(',')),
    start: isoDateTimeInput,
    end: isoDateTimeInput,
    ...durationFields,
    calendars: z.string().transform((v) => v.split(',')).optional(),
    include_busy: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
  })
  .superRefine(refineDurationConflict)
  .transform(resolveDuration)
  .refine((v) => new Date(v.end) > new Date(v.start), 'end must be after start');

export const WEBHOOK_EVENT_TYPES = [
  'agent.created',
  'agent.updated',
  'event.created',
  'event.updated',
  'event.deleted',
  'event.started',
  'event.ended',
  'event.reminder',
  'event.hold_created',
  'event.hold_expired',
  'event.hold_released',
  'event.hold_confirmed',
  'proposal.created',
  'proposal.responded',
  'proposal.confirmed',
  'proposal.expired',
  'proposal.cancelled',
  'webhook.deactivated',
  'org.plan_changed',
  'calendar_connection.reauthorization_required',
  'usage.threshold_crossed',
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export const CreateWebhookSchema = z.object({
  url: z.string().url('Must be a valid URL').max(2_048),
  events: z.array(z.enum(WEBHOOK_EVENT_TYPES)).min(1, 'At least one event type must be specified'),
});

export const UpdateWebhookSchema = z.object({
  url: z.string().url('Must be a valid URL').max(2_048).optional(),
  events: z.array(z.enum(WEBHOOK_EVENT_TYPES)).optional(),
  active: z.boolean().optional(),
});

export const ListWebhooksQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * `dropped` is a Free-plan delivery the monthly limit stopped: never sent,
 * counted or retried, with `last_error_code: 'quota_exceeded'`.
 */
export const WEBHOOK_DELIVERY_STATUSES = ['pending', 'delivered', 'failed', 'dropped'] as const;
export const WebhookDeliveryStatusSchema = z.enum(WEBHOOK_DELIVERY_STATUSES);

export const ListDeliveriesQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
    status: WebhookDeliveryStatusSchema.optional(),
    include_payload: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => v === 'true'),
    /** An exact event type (`event.created`) or a prefix ending in a dot (`event.`). */
    event_type: z.string().max(100).regex(/^[a-z_]+\.(?:[a-z_]+)?$/).optional(),
    created_after: isoDateTimeInput.optional(),
    created_before: isoDateTimeInput.optional(),
    delivery_id: z.string().max(100).regex(/^whd_[A-Za-z0-9_-]+$/).optional(),
    is_test: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
    /** The `next_cursor` from the previous page; cannot be combined with a non-zero `offset`. */
    cursor: z.string().min(1).max(1024).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.cursor !== undefined && v.offset > 0) {
      ctx.addIssue({ code: 'custom', path: ['cursor'], message: 'cursor and offset cannot be combined' });
    }
    if (
      v.created_after !== undefined &&
      v.created_before !== undefined &&
      Date.parse(v.created_after) >= Date.parse(v.created_before)
    ) {
      ctx.addIssue({ code: 'custom', path: ['created_after'], message: 'created_after must be before created_before' });
    }
  });

// HTTPS via `.refine`, not `.startsWith`: zod 4's startsWith overwrites the
// string `format` ('uri' → 'starts_with'), so JSON Schema consumers (MCP
// clients, agent frameworks) would lose `format: uri`.
export const CreateICalSubscriptionSchema = z.object({
  calendar_id: z.string().min(1),
  url: z.string().url().max(2_048).refine((u) => u.startsWith('https://'), 'URL must use HTTPS'),
  label: z.string().min(1).max(255).optional(),
});

export const UpdateICalSubscriptionSchema = z
  .object({
    label: z.string().min(1).max(255).optional(),
    url: z.string().url().max(2_048).refine((u) => u.startsWith('https://'), 'URL must use HTTPS').optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'request body must include at least one field');

export const ListICalSubscriptionsQuerySchema = z.object({
  status: z.enum(['active', 'error', 'paused']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const proposalMetadataSchema = metadataSchema.optional().default({});

export const ProposalSlotSchema = z.object({
  start_time: isoDateTimeInput,
  end_time: isoDateTimeInput,
  weight: z.number().min(0).max(10).default(1.0).optional(),
  calendar_id: z.string().optional(),
});

export const CreateProposalSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  organizer_agent_id: z.string(),
  participant_agent_ids: z.array(z.string()).min(1).max(50),
  calendar_id: z.string(),
  slots: z.array(ProposalSlotSchema).min(1).max(20),
  expires_at: isoDateTimeInput.optional(),
  metadata: proposalMetadataSchema,
});

export const RespondToProposalSchema = z
  .object({
    agent_id: z.string(),
    response: z.enum(['accept', 'decline', 'counter']),
    selected_slot_id: z.string().optional(),
    counter_slots: z.array(ProposalSlotSchema).max(20).optional(),
    message: z.string().max(2000).optional(),
  })
  .refine((d) => d.response !== 'accept' || d.selected_slot_id !== undefined, {
    message: 'selected_slot_id is required when response is "accept"',
  });

export type CreateAgentInput = z.input<typeof CreateAgentSchema>;
export type UpdateAgentInput = z.input<typeof UpdateAgentSchema>;
export type ListAgentsQuery = z.infer<typeof ListAgentsQuerySchema>;
export type CreateCalendarInput = z.input<typeof CreateCalendarSchema>;
export type UpdateCalendarInput = z.input<typeof UpdateCalendarSchema>;
export type ListCalendarsQuery = z.infer<typeof ListCalendarsQuerySchema>;
export type CreateEventInput = z.input<typeof CreateEventSchema>;
export type UpdateEventInput = z.input<typeof UpdateEventSchema>;
export type ListEventsQuery = z.infer<typeof ListEventsQuerySchema>;
export type WorkingHours = z.infer<typeof WorkingHoursSchema>;
export type UpdateAvailabilityRules = z.infer<typeof UpdateAvailabilityRulesSchema>;
export type AvailabilityQuery = z.infer<typeof AvailabilityQuerySchema>;
export type CrossAgentAvailabilityQuery = z.infer<typeof CrossAgentAvailabilityQuerySchema>;
export type CreateWebhookInput = z.input<typeof CreateWebhookSchema>;
export type UpdateWebhookInput = z.input<typeof UpdateWebhookSchema>;
export type ListWebhooksQuery = z.infer<typeof ListWebhooksQuerySchema>;
export type ListDeliveriesQuery = z.infer<typeof ListDeliveriesQuerySchema>;
export type WebhookDeliveryStatus = z.infer<typeof WebhookDeliveryStatusSchema>;
export type CreateICalSubscriptionInput = z.input<typeof CreateICalSubscriptionSchema>;
export type UpdateICalSubscriptionInput = z.input<typeof UpdateICalSubscriptionSchema>;
export type ListICalSubscriptionsQuery = z.infer<typeof ListICalSubscriptionsQuerySchema>;
export type CreateProposalInput = z.input<typeof CreateProposalSchema>;
export type RespondToProposalInput = z.input<typeof RespondToProposalSchema>;
