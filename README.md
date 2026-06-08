# @chronary/schemas

Zod schemas and types for the [Chronary](https://chronary.ai) calendar API — use them to validate incoming webhook payloads at runtime, or to share request/response shapes between your client and server code.

## Installation

```bash
npm install @chronary/schemas zod
# pnpm add @chronary/schemas zod
# yarn add @chronary/schemas zod
```

`zod` is a peer of this package and is already a transitive dep of `@chronary/sdk` and `@chronary/toolkit`, so you likely have it installed.

## Webhook payload validation

Chronary webhooks put the event type in the `X-Chronary-Event-Type` header and the payload in the body. Pass both to `parseWebhookEvent` to get a typed, discriminated result.

```ts
import { parseWebhookEvent } from '@chronary/schemas/events';
import { verifySignature } from '@chronary/sdk';

app.post('/webhook', async (req, res) => {
  const rawBody = await req.text();

  // 1. Authenticate with the HMAC signature before trusting anything.
  //    verifySignature reads X-Signature/X-Timestamp from the headers and
  //    throws on a bad/missing signature or a stale timestamp.
  try {
    await verifySignature(rawBody, req.headers, process.env.CHRONARY_WEBHOOK_SECRET!);
  } catch {
    return res.status(401).end();
  }

  // 2. Parse into a typed event (the event type comes from the header).
  const event = parseWebhookEvent(
    req.header('x-chronary-event-type'),
    JSON.parse(rawBody),
  );

  if (!event.success) {
    console.warn('webhook parse failed:', event.error);
    return res.status(400).json({ error: event.error });
  }

  // 3. Narrow by event.type.
  switch (event.event.type) {
    case 'event.created':
      //             ^ TypeScript narrows `event.event.data` to the created payload
      console.log('New event:', event.event.data.event);
      break;
    case 'event.deleted':
      console.log('Deleted:', event.event.data.event_id);
      break;
    case 'proposal.responded':
      console.log(
        `Agent ${event.event.data.agent_id} responded: ${event.event.data.response}`,
      );
      break;
    default:
      console.log('Unhandled event:', event.event.type);
  }

  res.status(200).end();
});
```

### Wire format contract

- **HTTP method**: `POST` to your webhook URL.
- **Headers**:
  - `X-Signature` — HMAC-SHA256 signature of `timestamp + "." + body` (verify with [`@chronary/sdk`'s `verifySignature`](https://github.com/Chronary/chronary-node)).
  - `X-Timestamp` — Unix epoch seconds (decimal string, e.g. `1745784205`) used in the signature.
  - `X-Delivery-Id` — unique delivery ID (useful for idempotency + debugging).
  - `X-Chronary-Event-Type` — one of the 18 event types in `WEBHOOK_EVENT_TYPES`.
- **Body**: raw JSON payload (schema depends on the event type).

### Forward compatibility

Every payload schema uses `.passthrough()`. Fields added server-side in the future won't cause existing consumer code to fail parsing — the unknown fields are preserved on the result so you can opt in to reading them.

## Request / response schemas

The package re-exports the Zod schemas used by the REST API for creating and updating resources:

```ts
import { CreateEventSchema, CreateCalendarSchema } from '@chronary/schemas';

const parsed = CreateEventSchema.parse(req.body);
// parsed is typed as CreateEventInput
```

Available:

- `CreateCalendarSchema`, `UpdateCalendarSchema`, `ListCalendarsQuerySchema`
- `CreateEventSchema`, `UpdateEventSchema`, `ListEventsQuerySchema`
- `CreateAgentSchema`, `UpdateAgentSchema`, `ListAgentsQuerySchema`
- `CreateWebhookSchema`, `UpdateWebhookSchema`, `ListWebhooksQuerySchema`, `ListDeliveriesQuerySchema`
- `CreateICalSubscriptionSchema`, `UpdateICalSubscriptionSchema`, `ListICalSubscriptionsQuerySchema`
- `CreateProposalSchema`, `RespondToProposalSchema`
- `WorkingHoursSchema`, `UpdateAvailabilityRulesSchema`, `AvailabilityQuerySchema`, `CrossAgentAvailabilityQuerySchema`

Plus type exports inferred from each schema, like `CreateEventInput`, `CreateCalendarInput`, etc.

## Full docs

[docs.chronary.ai](https://docs.chronary.ai)

## License

Apache-2.0. See [LICENSE](./LICENSE).
