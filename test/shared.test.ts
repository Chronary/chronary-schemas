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
import { normalizeDisplayName, UpdateCalendarSchema as UpdateCalendarNameSchema } from '../src/shared';

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

// #595: the double-booking guarantee is an optional boolean on create and update.
describe('calendar prevent_overlaps (#595)', () => {
  it('accepts a boolean on create and update, and an update with only it', () => {
    expect(CreateCalendarSchema.parse({ name: 'c', timezone: 'UTC', prevent_overlaps: true }).prevent_overlaps).toBe(true);
    expect(CreateCalendarSchema.parse({ name: 'c', timezone: 'UTC' }).prevent_overlaps).toBeUndefined();
    expect(UpdateCalendarNameSchema.safeParse({ prevent_overlaps: false }).success).toBe(true);
  });

  it('rejects a non-boolean', () => {
    expect(CreateCalendarSchema.safeParse({ name: 'c', timezone: 'UTC', prevent_overlaps: 'true' }).success).toBe(false);
    expect(UpdateCalendarNameSchema.safeParse({ prevent_overlaps: 1 }).success).toBe(false);
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

// #2566: an all-day event is normalised to whole UTC days, as the API does.
describe('all-day events (#2566)', () => {
  it('create keeps the written date and gives an exclusive next-midnight end', () => {
    const east = CreateEventSchema.parse({ title: 't', all_day: true, start_time: '2026-07-04T00:00:00+09:00', end_time: '2026-07-05T00:00:00+09:00' });
    expect([east.start_time, east.end_time]).toEqual(['2026-07-04T00:00:00.000Z', '2026-07-05T00:00:00.000Z']);
    const eod = CreateEventSchema.parse({ title: 't', all_day: true, start_time: '2026-07-04T00:00:00Z', end_time: '2026-07-04T23:59:59Z' });
    expect([eod.start_time, eod.end_time]).toEqual(['2026-07-04T00:00:00.000Z', '2026-07-05T00:00:00.000Z']);
    const short = CreateEventSchema.parse({ title: 't', all_day: true, start_time: '2026-07-04T10:00:00Z', end_time: '2026-07-04T10:30:00Z' });
    expect(short.end_time).toBe('2026-07-05T00:00:00.000Z');
  });

  it('update normalises when the body sets all_day: true', () => {
    expect(UpdateEventSchema.parse({ all_day: true, start_time: '2026-07-04T00:00:00-08:00', end_time: '2026-07-04T23:59:59-08:00' })).toEqual({
      all_day: true, start_time: '2026-07-04T00:00:00.000Z', end_time: '2026-07-05T00:00:00.000Z',
    });
    expect(UpdateEventSchema.parse({ all_day: true, start_time: '2026-07-04T00:00:00+09:00' })).toEqual({
      all_day: true, start_time: '2026-07-04T00:00:00.000Z',
    });
    expect(UpdateEventSchema.parse({ all_day: true, end_time: '2026-07-07T00:00:00+14:00' })).toEqual({
      all_day: true, end_time: '2026-07-07T00:00:00.000Z',
    });
  });

  it('create covers every day a span touches', () => {
    const cross = CreateEventSchema.parse({ title: 't', all_day: true, start_time: '2026-07-04T20:00:00Z', end_time: '2026-07-05T04:00:00Z' });
    expect([cross.start_time, cross.end_time]).toEqual(['2026-07-04T00:00:00.000Z', '2026-07-06T00:00:00.000Z']);
  });

  it('update still rejects a reversed range', () => {
    expect(UpdateEventSchema.safeParse({ all_day: true, start_time: '2026-07-06T00:00:00Z', end_time: '2026-07-04T00:00:00Z' }).success).toBe(false);
    expect(UpdateEventSchema.safeParse({ start_time: '2026-07-06T00:00:00Z', end_time: '2026-07-06T00:00:00Z' }).success).toBe(false);
  });
});

describe('time zone request fields (#2276)', () => {
  const base = { title: 'Sync', start_time: '2030-01-08T16:00:00Z', end_time: '2030-01-08T17:00:00Z' };

  it('create accepts an IANA time zone and omits it by default', () => {
    const r = CreateEventSchema.safeParse({ ...base, timezone: 'America/Los_Angeles' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.timezone).toBe('America/Los_Angeles');
    const plain = CreateEventSchema.safeParse(base);
    expect(plain.success).toBe(true);
    if (plain.success) expect(plain.data.timezone).toBeUndefined();
  });

  it('create rejects an unknown zone, an empty string and null', () => {
    expect(CreateEventSchema.safeParse({ ...base, timezone: 'Mars/Olympus' }).success).toBe(false);
    expect(CreateEventSchema.safeParse({ ...base, timezone: '' }).success).toBe(false);
    expect(CreateEventSchema.safeParse({ ...base, timezone: null }).success).toBe(false);
    expect(CreateEventSchema.safeParse({ ...base, timezone: 'x'.repeat(65) }).success).toBe(false);
  });

  it('update accepts a zone or null (back to UTC) and rejects an unknown zone', () => {
    expect(UpdateEventSchema.safeParse({ timezone: 'Europe/Berlin' }).success).toBe(true);
    expect(UpdateEventSchema.safeParse({ timezone: null }).success).toBe(true);
    expect(UpdateEventSchema.safeParse({ timezone: 'Not/AZone' }).success).toBe(false);
  });
});

// #2500: names are normalised the way the API stores them.
describe('display names (#2500)', () => {
  it('normalises calendar and agent names', () => {
    expect(normalizeDisplayName('  Front\u00a0office\n')).toBe('Front office');
    expect(CreateCalendarSchema.parse({ name: 'Wo\u200Brk  ', timezone: 'UTC' }).name).toBe('Work');
    expect(UpdateCalendarNameSchema.parse({ name: 'Cafe\u0301' }).name).toBe('Caf\u00e9');
    expect(CreateAgentSchema.parse({ name: ' Bot\t1 ', type: 'ai' }).name).toBe('Bot 1');
    expect(UpdateAgentSchema.parse({ name: 'a  b' }).name).toBe('a b');
  });

  it('strips format characters before NFC and rejects names with nothing visible (#2500 review)', () => {
    expect(normalizeDisplayName('Cafe\u200B\u0301')).toBe('Caf\u00E9');
    expect(normalizeDisplayName('in\u202Evoice')).toBe('invoice');
    for (const blank of ['\u200D', '\u200C', '\u00AD', '\u2800', '\u3164']) {
      expect(CreateCalendarSchema.safeParse({ name: blank, timezone: 'UTC' }).success, JSON.stringify(blank)).toBe(false);
    }
  });

  it('keeps ZWJ emoji sequences and the ZWNJ in a Persian name', () => {
    expect(normalizeDisplayName('Team \u{1F468}\u200D\u{1F469}\u200D\u{1F467}')).toBe('Team \u{1F468}\u200D\u{1F469}\u200D\u{1F467}');
    expect(CreateAgentSchema.parse({ name: '\u0645\u06CC\u200C\u062E\u0648\u0627\u0647\u0645', type: 'ai' }).name).toBe('\u0645\u06CC\u200C\u062E\u0648\u0627\u0647\u0645');
  });

  it('rejects whitespace-only names and control characters', () => {
    expect(CreateCalendarSchema.safeParse({ name: ' \u00a0 ', timezone: 'UTC' }).success).toBe(false);
    expect(CreateAgentSchema.safeParse({ name: '\n', type: 'ai' }).success).toBe(false);
    expect(UpdateAgentSchema.safeParse({ name: 'Bot\u0000' }).success).toBe(false);
  });
});
