import { describe, expect, it } from 'vitest';

import {
  parseWebhookEvent,
  WEBHOOK_EVENT_TYPES,
  EventCreatedPayloadSchema,
  WebhookDeactivatedPayloadSchema,
  UsageThresholdCrossedPayloadSchema,
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

  it('parses all 18 event types with their minimum-valid payloads', () => {
    const minimal: Record<string, unknown> = {
      'agent.created': { agent: {} },
      'agent.updated': { agent: {} },
      'event.created': { event: {} },
      'event.updated': { event: {} },
      'event.deleted': { event_id: 'e', calendar_id: 'c' },
      'event.started': { event_id: 'e', calendar_id: 'c', title: 't', start_time: 's', end_time: 'e' },
      'event.ended': { event_id: 'e', calendar_id: 'c', title: 't', start_time: 's', end_time: 'e' },
      'event.reminder': { event_id: 'e', calendar_id: 'c', title: 't', start_time: 's', end_time: 'e', reminder_minutes: 10 },
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
      'org.plan_changed': { org_id: 'o', previous_plan: 'free', plan: 'pro', source: 'subscription', subscription_status: 'active', interval: 'month', upgrade_request_id: null },
      'calendar_connection.reauthorization_required': { connection_id: 'con_1', provider: 'google', reauthorization_reason: 'credentials_rejected', impacted_agent_count: 2, occurred_at: '2026-11-01T00:00:00.000Z' },
      'usage.threshold_crossed': { metric: 'events', used: 80, limit: 100, threshold_pct: 80, period: '2026-11', resets_at: '2026-12-01T00:00:00.000Z' },
    };

    expect(Object.keys(minimal).sort()).toEqual([...WEBHOOK_EVENT_TYPES].sort());

    for (const type of WEBHOOK_EVENT_TYPES) {
      const result = parseWebhookEvent(type, minimal[type]);
      expect(result.success, `${type} should parse`).toBe(true);
    }
  });
});

describe('individual payload schemas', () => {
  it('org.plan_changed accepts the developer plan on either side (#1911)', () => {
    const base = { org_id: 'o', source: 'subscription', subscription_status: 'active', interval: 'month', upgrade_request_id: null };
    expect(parseWebhookEvent('org.plan_changed', { ...base, previous_plan: 'developer', plan: 'pro' }).success).toBe(true);
    expect(parseWebhookEvent('org.plan_changed', { ...base, previous_plan: 'pro', plan: 'developer' }).success).toBe(true);
  });

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

  it('WebhookDeactivatedPayloadSchema accepts the redacted origin and path that deliveries carry (#1200)', () => {
    const result = parseWebhookEvent('webhook.deactivated', {
      webhook_id: 'whk_1',
      webhook_origin: 'https://example.com',
      webhook_path: '/hooks/chronary',
      reason: 'circuit_breaker',
    });
    expect(result.success).toBe(true);
    if (result.success && result.event.type === 'webhook.deactivated') {
      expect(result.event.data.webhook_origin).toBe('https://example.com');
      expect(result.event.data.url).toBeUndefined();
    }
  });
});

describe('calendar_connection.reauthorization_required (#1196)', () => {
  it('validates calendar_connection.reauthorization_required', () => {
    const ok = parseWebhookEvent('calendar_connection.reauthorization_required', {
      connection_id: 'con_1', provider: 'microsoft', reauthorization_reason: 'credentials_rejected',
      impacted_agent_count: 0, occurred_at: '2026-11-01T00:00:00.000Z',
    });
    expect(ok.success).toBe(true);
    if (ok.success && ok.event.type === 'calendar_connection.reauthorization_required') {
      expect(ok.event.data.impacted_agent_count).toBe(0);
    }
    expect(parseWebhookEvent('calendar_connection.reauthorization_required', { connection_id: 'con_1', provider: 'google' }).success).toBe(false);
    expect(parseWebhookEvent('calendar_connection.reauthorization_required', {
      connection_id: 'con_1', provider: 'google', reauthorization_reason: 'x', impacted_agent_count: -1, occurred_at: 'now',
    }).success).toBe(false);
  });
});

describe('usage.threshold_crossed (#1211)', () => {
  const payload = {
    metric: 'api_calls',
    used: 800,
    limit: 1000,
    threshold_pct: 80,
    period: '2026-11',
    resets_at: '2026-12-01T00:00:00.000Z',
  };

  it('validates the payload and narrows on type', () => {
    const ok = parseWebhookEvent('usage.threshold_crossed', payload);
    expect(ok.success).toBe(true);
    if (ok.success && ok.event.type === 'usage.threshold_crossed') {
      expect(ok.event.data.threshold_pct).toBe(80);
      expect(ok.event.data.metric).toBe('api_calls');
    }
  });

  it('requires the metric, usage, limit, threshold and reset time', () => {
    for (const key of Object.keys(payload)) {
      const { [key as keyof typeof payload]: _omitted, ...rest } = payload;
      expect(UsageThresholdCrossedPayloadSchema.safeParse(rest).success, key).toBe(false);
    }
  });
});
