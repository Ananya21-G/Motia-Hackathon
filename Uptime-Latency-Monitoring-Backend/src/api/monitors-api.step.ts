import type { ApiRouteConfig, Handlers } from 'motia';
import { z } from 'zod';
import { randomUUID } from 'crypto';

const inputSchema = z.object({
  url: z.string().url(),
  name: z.string().optional(),
  failureThreshold: z.number().int().positive().optional(),
  timeoutMs: z.number().int().positive().optional(),
  alertWebhookUrl: z.string().url().optional(),
  alertTo: z.string().optional(),
  emailFrom: z.string().optional()
});

export const config: ApiRouteConfig = {
  name: 'CreateMonitorAPI',
  type: 'api',
  path: '/monitors',
  method: 'POST',
  description: 'Create a new monitor and store configuration in state',
  emits: [],
  flows: ['monitoring'],
  responseSchema: {
    201: z.object({ monitorId: z.string() })
  }
};

export const handler: Handlers['CreateMonitorAPI'] = async (request, { logger, state }) => {
  const body = request.body as unknown;

  // Validate input
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    logger.warn('Invalid monitor creation request', { errors: parsed.error.format() });
    return { status: 400, body: { error: 'invalid_input', details: parsed.error.format() } };
  }

  const data = parsed.data;

  // Generate monitor ID
  const monitorId = randomUUID();

  // Build monitor configuration object to store in state
  const monitorConfig = {
    id: monitorId,
    url: data.url,
    name: data.name ?? null,
    failureThreshold: data.failureThreshold ?? 3,
    timeoutMs: data.timeoutMs ?? 5000,
    alertWebhookUrl: data.alertWebhookUrl ?? null,
    alertTo: data.alertTo ?? null,
    emailFrom: data.emailFrom ?? null,
    createdAt: new Date().toISOString()
  } as const;

  try {
    await state.set('monitors', monitorId, monitorConfig);
    logger.info('Monitor created', { monitorId, url: data.url });

    return {
      status: 201,
      body: {
        monitorId
      }
    };
  } catch (err) {
    logger.error('Failed to store monitor config', { error: err });
    return { status: 500, body: { error: 'internal_error' } };
  }
};
