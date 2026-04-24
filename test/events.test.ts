import { describe, expect, it } from 'vitest';

import {
  parseWebhookEvent,
  WEBHOOK_EVENT_TYPES,
  EventCreatedPayloadSchema,
  WebhookDeactivatedPayloadSchema,
} from '../src/events';

describe('parseWebhookEvent', () => {
  it('rejects missing event-type header', () => {
    const result = parseWebhookEvent(null, {});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/Missing X-Chronary-Event-Type header/);
    }
  });

  it('rejects unknown event types', () => {
    const result = parseWebhookEvent('not.a.real.event', {});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/Unknown event type/);
    }
  });

  it('parses a valid event.created payload', () => {
    const result = parseWebhookEvent('event.created', {
      event: { id: 'evt_123', title: 'Standup' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.event.type).toBe('event.created');
      expect(result.event.data).toHaveProperty('event');
    }
  });

  it('narrows via discriminated type field', () => {
    const result = parseWebhookEvent('event.deleted', {
      event_id: 'evt_123',
      calendar_id: 'cal_1',
    });
    if (result.success && result.event.type === 'event.deleted') {
      // TS should narrow event.data here
      expect(result.event.data.event_id).toBe('evt_123');
      expect(result.event.data.calendar_id).toBe('cal_1');
    } else {
      throw new Error('expected event.deleted to succeed');
    }
  });

  it('preserves unknown fields via passthrough', () => {
    const result = parseWebhookEvent('event.deleted', {
      event_id: 'evt_123',
      calendar_id: 'cal_1',
      future_field: 'should-be-preserved',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.event.data).toMatchObject({
        event_id: 'evt_123',
        future_field: 'should-be-preserved',
      });
    }
  });

  it('fails when required fields are missing', () => {
    const result = parseWebhookEvent('event.deleted', { event_id: 'only-this' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/Invalid payload for event.deleted/);
    }
  });

  it('parses all 17 event types with their minimum-valid payloads', () => {
    const minimal: Record<string, unknown> = {
      'agent.created': { agent: {} },
      'agent.updated': { agent: {} },
      'event.created': { event: {} },
      'event.updated': { event: {} },
      'event.deleted': { event_id: 'e', calendar_id: 'c' },
      'event.started': { event_id: 'e', calendar_id: 'c', title: 't', start_time: 's', end_time: 'e' },
      'event.ended': { event_id: 'e', calendar_id: 'c', title: 't', start_time: 's', end_time: 'e' },
      'event.hold_created': { event_id: 'e', calendar_id: 'c', title: 't', start_time: 's', end_time: 'e' },
      'event.hold_expired': { event_id: 'e' },
      'event.hold_released': { event_id: 'e' },
      'event.hold_confirmed': { event_id: 'e' },
      'proposal.created': { proposal: {} },
      'proposal.responded': { proposal_id: 'p', agent_id: 'a', response: 'accepted' },
      'proposal.confirmed': { proposal_id: 'p' },
      'proposal.expired': { proposal_id: 'p' },
      'proposal.cancelled': { proposal_id: 'p' },
      'webhook.deactivated': { webhook_id: 'w', url: 'u', reason: 'r' },
    };

    expect(Object.keys(minimal).sort()).toEqual([...WEBHOOK_EVENT_TYPES].sort());

    for (const type of WEBHOOK_EVENT_TYPES) {
      const result = parseWebhookEvent(type, minimal[type]);
      expect(result.success, `${type} should parse`).toBe(true);
    }
  });
});

describe('individual payload schemas', () => {
  it('EventCreatedPayloadSchema accepts event object', () => {
    const parsed = EventCreatedPayloadSchema.parse({ event: { id: 'evt_1' } });
    expect(parsed.event).toEqual({ id: 'evt_1' });
  });

  it('WebhookDeactivatedPayloadSchema requires reason', () => {
    const result = WebhookDeactivatedPayloadSchema.safeParse({
      webhook_id: 'w',
      url: 'https://example.com',
    });
    expect(result.success).toBe(false);
  });
});
