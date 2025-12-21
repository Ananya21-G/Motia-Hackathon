import type { EventConfig, Handlers } from 'motia';
import { z } from 'zod';

const inputSchema = z.object({ monitorId: z.string() });

export const config: EventConfig = {
  name: 'MonitorDown',
  type: 'event',
  description: 'Handles MONITOR_DOWN: routes to SEND_ALERT and marks monitor ALERTED to avoid duplicate alerts',
  subscribes: ['MONITOR_DOWN'],
  emits: ['SEND_ALERT'],
  input: inputSchema as any,
  flows: ['monitoring']
};

export const handler: Handlers['MonitorDown'] = async (input: z.infer<typeof inputSchema>, context) => {
  const { logger, state, emit } = context as any;
  const { monitorId } = input;
  logger.info('MonitorDown handler started', { monitorId });

  const prevState = (await state.get('monitor-state', monitorId)) as string | undefined;
  try {
    if (prevState === 'ALERTED') {
      logger.info('Skipping MONITOR_DOWN alert; monitor already ALERTED', { monitorId });
      return;
    }

    await emit({ topic: 'SEND_ALERT', data: { monitorId, severity: 'CRITICAL' } });
    await state.set('monitor-state', monitorId, 'ALERTED');
    logger.info('MONITOR_DOWN processed and monitor marked ALERTED', { monitorId });
  } catch (err: any) {
    logger.error('Error processing MONITOR_DOWN', { monitorId, error: err?.message ?? err });
  }
};

export const configRecovered: EventConfig = {
  name: 'MonitorRecovered',
  type: 'event',
  description: 'Handles MONITOR_RECOVERED: sends recovery notification and resets state/failures',
  subscribes: ['MONITOR_RECOVERED'],
  emits: ['SEND_ALERT'],
  input: inputSchema as any,
  flows: ['monitoring']
};

export const handlerRecovered: Handlers['MonitorRecovered'] = async (input: z.infer<typeof inputSchema>, context) => {
  const { logger, state, emit } = context as any;
  const { monitorId } = input;
  logger.info('MonitorRecovered handler started', { monitorId });

  const prevState = (await state.get('monitor-state', monitorId)) as string | undefined;
  try {
    if (!prevState || prevState === 'UP') {
      logger.info('MONITOR_RECOVERED received but monitor already UP', { monitorId, prevState });
      await state.set('monitor-state', monitorId, 'UP');
      return;
    }

    await emit({ topic: 'SEND_ALERT', data: { monitorId, severity: 'NORMAL', diagnostic: { recovered: true } } });
    await state.set('monitor-failures', monitorId, 0);
    await state.set('monitor-state', monitorId, 'UP');
    logger.info('MONITOR_RECOVERED processed and monitor state set to UP', { monitorId });
  } catch (err: any) {
    logger.error('Error processing MONITOR_RECOVERED', { monitorId, error: err?.message ?? err });
  }
};
