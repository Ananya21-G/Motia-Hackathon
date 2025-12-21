import type { CronConfig, Handlers } from 'motia';

export const config: CronConfig = {
  name: 'PingMonitorsCron',
  type: 'cron',
  description: 'Fetches all monitors from state and emits PING_MONITOR for each monitor id',
  cron: '*/1 * * * *', // every minute (approx. every 60 seconds)
  emits: ['PING_MONITOR'],
  flows: ['monitoring']
};

export const handler: Handlers['PingMonitorsCron'] = async ({ logger, state, emit }) => {
  logger.info('PingMonitorsCron started');

  try {
    const monitors = await state.getGroup<any>('monitors');

    if (!monitors || monitors.length === 0) {
      logger.info('No monitors found in state');
      return;
    }

    logger.info('Fetched monitors from state', { count: monitors.length });

    for (const m of monitors) {
      // Support both `id` and `monitorId` shapes; skip if no id found
      const monitorId = m?.id ?? m?.monitorId;

      if (!monitorId) {
        logger.warn('Skipping monitor without id', { monitor: m });
        continue;
      }

      await emit({ topic: 'PING_MONITOR', data: { monitorId } });
      logger.info('Emitted PING_MONITOR', { monitorId });
    }
  } catch (error) {
    logger.error('Error running PingMonitorsCron', { error });
  }
};
