import { describe, expect, it } from 'vitest';

import { z } from 'zod';
import {
  CreateICalSubscriptionSchema,
  UpdateICalSubscriptionSchema,
  AvailabilityQuerySchema,
  CrossAgentAvailabilityQuerySchema,
  ListDeliveriesQuerySchema,
  WEBHOOK_DELIVERY_STATUSES,
  CreateAgentSchema,
  UpdateAgentSchema,
  CreateCalendarSchema,
  CreateEventSchema,
  UpdateEventSchema,
  CreateWebhookSchema,
  UpdateWebhookSchema,
  ListEventsQuerySchema,
  CreateProposalSchema,
} from '../src/shared';

// `duration` is the preferred public param; `slot_duration` is a deprecated
// alias. Both schemas coalesce to the canonical internal `slot_duration`.
describe.each([
  ['AvailabilityQuerySchema', AvailabilityQuerySchema, { start: '2026-08-01T00:00:00Z', end: '2026-08-02T00:00:00Z' }],
  [
    'CrossAgentAvailabilityQuerySchema',
    CrossAgentAvailabilityQuerySchema,
    { agents: 'agt_one', start: '2026-08-01T00:00:00Z', end: '2026-08-02T00:00:00Z' },
  ],
] as const)('%s duration alias', (_name, schema, base) => {
  it('honors the preferred `duration` param, coalescing into slot_duration', () => {
    const result = schema.safeParse({ ...base, duration: '45m' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.slot_duration).toBe('45m');
  });

  it('still accepts the deprecated `slot_duration` alias', () => {
    const result = schema.safeParse({ ...base, slot_duration: '1h' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.slot_duration).toBe('1h');
  });

  it('accepts both when they agree', () => {
    const result = schema.safeParse({ ...base, duration: '2h', slot_duration: '2h' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.slot_duration).toBe('2h');
  });

  it('rejects a duration/slot_duration conflict rather than silently picking one', () => {
    const result = schema.safeParse({ ...base, duration: '45m', slot_duration: '30m' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/conflict/i);
    }
  });

  it('defaults to 30m when neither is supplied', () => {
    const result = schema.safeParse({ ...base });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.slot_duration).toBe('30m');
  });

  it('rejects an invalid duration value', () => {
    const result = schema.safeParse({ ...base, duration: '90m' });
    expect(result.success).toBe(false);
  });
});

// HTTPS enforcement must not clobber `format: uri` in emitted JSON Schema
// (zod 4 `.startsWith` overwrites the string format).
describe.each([
  ['CreateICalSubscriptionSchema', CreateICalSubscriptionSchema, { calendar_id: 'cal_1' }],
  ['UpdateICalSubscriptionSchema', UpdateICalSubscriptionSchema, {}],
] as const)('%s url', (_name, schema, base) => {
  it('keeps format: uri in JSON Schema', () => {
    const json = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as {
      properties: Record<string, { format?: string }>;
    };
    expect(json.properties.url.format).toBe('uri');
  });

  it('accepts https URLs', () => {
    expect(schema.safeParse({ ...base, url: 'https://cal.example.com/feed.ics' }).success).toBe(true);
  });

  it('rejects http URLs with the HTTPS message', () => {
    const r = schema.safeParse({ ...base, url: 'http://cal.example.com/feed.ics' });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.message)).toContain('URL must use HTTPS');
  });
});

describe('ListDeliveriesQuerySchema (#1200)', () => {
  it('accepts the dropped status and the new filters', () => {
    const r = ListDeliveriesQuerySchema.safeParse({
      status: 'dropped',
      event_type: 'event.',
      created_after: '2026-04-18T00:00:00Z',
      created_before: '2026-04-19T00:00:00Z',
      delivery_id: 'whd_1',
      is_test: 'false',
      cursor: 'abc',
    });
    expect(r.success).toBe(true);
    expect(r.data?.is_test).toBe(false);
    expect(WEBHOOK_DELIVERY_STATUSES).toEqual(['pending', 'delivered', 'failed', 'dropped']);
  });

  it('rejects a cursor with an offset, an inverted date range and a wildcard event type', () => {
    expect(ListDeliveriesQuerySchema.safeParse({ cursor: 'abc', offset: '20' }).success).toBe(false);
    expect(
      ListDeliveriesQuerySchema.safeParse({ created_after: '2026-04-19T00:00:00Z', created_before: '2026-04-18T00:00:00Z' }).success,
    ).toBe(false);
    expect(ListDeliveriesQuerySchema.safeParse({ event_type: 'event.%' }).success).toBe(false);
  });
});

// Request length limits (#1672), kept in step with @chronary/shared.
describe('request length limits (#1672)', () => {
  const event = { title: 'T', start_time: '2026-04-19T10:00:00Z', end_time: '2026-04-19T11:00:00Z' };
  const atAndOver = (n: number) => ['x'.repeat(n), 'x'.repeat(n + 1)] as const;

  it('caps event description at 10,000 characters on create and update', () => {
    const [ok, over] = atAndOver(10_000);
    expect(CreateEventSchema.safeParse({ ...event, description: ok }).success).toBe(true);
    expect(CreateEventSchema.safeParse({ ...event, description: over }).success).toBe(false);
    expect(UpdateEventSchema.safeParse({ description: ok }).success).toBe(true);
    expect(UpdateEventSchema.safeParse({ description: over }).success).toBe(false);
  });

  it('caps agent description at 5,000 characters on create and update', () => {
    const [ok, over] = atAndOver(5_000);
    expect(CreateAgentSchema.safeParse({ name: 'a', type: 'ai', description: ok }).success).toBe(true);
    expect(CreateAgentSchema.safeParse({ name: 'a', type: 'ai', description: over }).success).toBe(false);
    expect(UpdateAgentSchema.safeParse({ description: over }).success).toBe(false);
  });

  it('caps webhook and iCal subscription URLs at 2,048 characters', () => {
    const url = (n: number) => `https://example.com/${'a'.repeat(n - 20)}`;
    expect(url(2_048)).toHaveLength(2_048);
    expect(CreateWebhookSchema.safeParse({ url: url(2_048), events: ['event.created'] }).success).toBe(true);
    expect(CreateWebhookSchema.safeParse({ url: url(2_049), events: ['event.created'] }).success).toBe(false);
    expect(UpdateWebhookSchema.safeParse({ url: url(2_049) }).success).toBe(false);
    expect(CreateICalSubscriptionSchema.safeParse({ calendar_id: 'cal_1', url: url(2_049) }).success).toBe(false);
    expect(UpdateICalSubscriptionSchema.safeParse({ url: url(2_049) }).success).toBe(false);
  });

  it('caps calendar timezone at 64 characters', () => {
    expect(CreateCalendarSchema.safeParse({ name: 'c', timezone: 'x'.repeat(65) }).success).toBe(false);
  });
});

// #1989: request date-times accept an RFC 3339 numeric offset, as the API
// does, and normalise it to the same instant in UTC.
describe('request date-times with an offset (#1989)', () => {
  it('normalises event start/end and compares them as instants', () => {
    const parsed = CreateEventSchema.parse({
      title: 't',
      start_time: '2026-11-20T09:00:00-08:00',
      end_time: '2026-11-20T23:00:00+05:30',
    });
    expect(parsed.start_time).toBe('2026-11-20T17:00:00.000Z');
    expect(parsed.end_time).toBe('2026-11-20T17:30:00.000Z');
    expect(
      CreateEventSchema.safeParse({ title: 't', start_time: '2026-11-20T17:00:00Z', end_time: '2026-11-20T09:00:00-08:00' })
        .success,
    ).toBe(false);
  });

  it('passes Z through unchanged and still rejects a missing zone', () => {
    expect(UpdateEventSchema.parse({ start_time: '2026-11-20T17:00:00Z' }).start_time).toBe('2026-11-20T17:00:00Z');
    expect(UpdateEventSchema.safeParse({ start_time: '2026-11-20T17:00:00' }).success).toBe(false);
    expect(UpdateEventSchema.safeParse({ start_time: 'garbage' }).success).toBe(false);
  });

  it('normalises query and proposal date-times', () => {
    expect(ListEventsQuerySchema.parse({ start_after: '2026-11-20T00:00:00+00:00' }).start_after).toBe(
      '2026-11-20T00:00:00.000Z',
    );
    expect(
      AvailabilityQuerySchema.parse({ start: '2026-11-20T09:00:00-08:00', end: '2026-11-20T18:00:00Z' }).start,
    ).toBe('2026-11-20T17:00:00.000Z');
    expect(ListDeliveriesQuerySchema.parse({ created_before: '2026-11-20T09:00:00-08:00' }).created_before).toBe(
      '2026-11-20T17:00:00.000Z',
    );
    const p = CreateProposalSchema.parse({
      title: 't',
      organizer_agent_id: 'agt_a',
      participant_agent_ids: ['agt_b'],
      calendar_id: 'cal_a',
      slots: [{ start_time: '2026-11-20T09:00:00-08:00', end_time: '2026-11-20T10:00:00-08:00' }],
      expires_at: '2026-11-19T12:00:00+00:00',
    });
    expect(p.slots[0].start_time).toBe('2026-11-20T17:00:00.000Z');
    expect(p.expires_at).toBe('2026-11-19T12:00:00.000Z');
  });

  it('keeps format: date-time in input JSON Schema', () => {
    const json = z.toJSONSchema(CreateEventSchema, { io: 'input', unrepresentable: 'any' }) as {
      properties: Record<string, { type?: string; format?: string }>;
    };
    expect(json.properties.start_time).toMatchObject({ type: 'string', format: 'date-time' });
  });
});
