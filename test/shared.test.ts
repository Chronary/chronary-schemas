import { describe, expect, it } from 'vitest';

import {
  AvailabilityQuerySchema,
  CrossAgentAvailabilityQuerySchema,
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
