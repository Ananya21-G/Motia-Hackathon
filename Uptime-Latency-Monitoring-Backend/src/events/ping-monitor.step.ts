import type { EventConfig, Handlers } from 'motia';
import { z } from 'zod';
import axios from 'axios';

const inputSchema = z.object({
  monitorId: z.string()
});

export const config: EventConfig = {
  name: 'PingMonitor',
  type: 'event',
  description: 'Performs HTTP GET to monitor URL, records metrics and emits CHECK_ANOMALY if failures exceed threshold',
  subscribes: ['PING_MONITOR'],
  emits: ['CHECK_ANOMALY', 'MONITOR_DOWN', 'MONITOR_RECOVERED'],
  input: inputSchema as any,
  flows: ['monitoring']
};

export const handler: Handlers['PingMonitor'] = async (input: z.infer<typeof inputSchema>, context) => {
  const { monitorId } = input;
  const { logger, state, emit, streams } = context;
  logger.info('PingMonitor handler started', { monitorId });

  // Retrieve monitor configuration from state
  const monitor = (await state.get('monitors', monitorId)) as any;

  if (!monitor) {
    logger.warn('Monitor not found in state', { monitorId });
    return;
  }

  const url: string | undefined = monitor.url;
  if (!url) {
    logger.warn('Monitor has no URL defined', { monitorId, monitor });
    return;
  }

  const timeoutMs = monitor.timeoutMs ?? 5000;
  const failureThreshold = typeof monitor.failureThreshold === 'number' ? monitor.failureThreshold : 3;

  const start = Date.now();
  let statusCode = 0;
  let success = false;

  try {
    const res = await axios.get(url, { timeout: timeoutMs, validateStatus: () => true });
    statusCode = res.status;
    success = res.status < 400;
  } catch (error: any) {
    // Network or other error
    statusCode = error?.response?.status ?? 0;
    success = false;
    logger.warn('HTTP request failed', { monitorId, url, error: error?.message ?? error });
  }

  const metric = {
    monitorId,
    timestamp: new Date().toISOString(),
    latency: Date.now() - start,
    statusCode,
    success
  } as const;

  try {
    // Persist metric in state. Use a timestamped key to keep history.
    await state.set('monitor-metrics', `${monitorId}:${Date.now()}`, metric);

    // Update failure counter (consecutive failures)
    const prevFailures = ((await state.get('monitor-failures', monitorId)) as number) ?? 0;

    if (success) {
      // Reset failure counter
      if (prevFailures !== 0) {
        await state.set('monitor-failures', monitorId, 0);
      }

      // If previously DOWN or ALERTED, emit recovery
      const prevState = (await state.get('monitor-state', monitorId)) as string | undefined;
      if (prevState === 'DOWN' || prevState === 'ALERTED') {
        // Reset state to UP and emit recovery notification
        await state.set('monitor-state', monitorId, 'UP');
        await emit({ topic: 'MONITOR_RECOVERED', data: { monitorId } });
      }

      // Run anomaly detection only for successful requests (performance metrics)
      await emit({ topic: 'CHECK_ANOMALY', data: { monitorId } });
    } else {
      const newFailures = prevFailures + 1;
      await state.set('monitor-failures', monitorId, newFailures);

      // If failure threshold met or exceeded => rule-based outage
      if (newFailures >= failureThreshold) {
        logger.info('Failure threshold met, emitting MONITOR_DOWN', { monitorId, failureCount: newFailures, threshold: failureThreshold });

        // Only emit MONITOR_DOWN if monitor wasn't already marked DOWN
        const prevState = (await state.get('monitor-state', monitorId)) as string | undefined;
        if (prevState !== 'DOWN' && prevState !== 'ALERTED') {
          await state.set('monitor-state', monitorId, 'DOWN');
          await emit({ topic: 'MONITOR_DOWN', data: { monitorId } });
        } else {
          logger.info('Monitor already DOWN or ALERTED; skipping MONITOR_DOWN emit', { monitorId, prevState });
        }
      }
    }

    logger.info('PingMonitor finished', { monitorId, metric });

    // Send ephemeral status to stream subscribers (non-persistent event)
    try {
      if (streams && streams.monitorStatus && typeof streams.monitorStatus.send === 'function') {
        await streams.monitorStatus.send({ groupId: monitorId, event: { type: 'status', data: metric } });
      }
    } catch (streamErr) {
      logger.warn('Failed to send monitor status to stream', { monitorId, error: streamErr });
    }

  } catch (err) {
    logger.error('Error storing metrics or updating failure counters', { monitorId, error: err });
  }
};
