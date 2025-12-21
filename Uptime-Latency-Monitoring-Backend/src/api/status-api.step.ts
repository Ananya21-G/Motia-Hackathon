import type { ApiRouteConfig, Handlers } from 'motia';

export const config: ApiRouteConfig = {
  name: 'MonitorStatusSSE',
  type: 'api',
  method: 'GET',
  path: '/status/:id',
  description: 'SSE endpoint streaming latest uptime status and latency for a monitor in real time',
  emits: [],
  flows: ['monitoring']
};

type MonitorMetric = {
  monitorId: string;
  timestamp: string;
  latency?: number;
  statusCode?: number;
  success?: boolean;
};


export const handler: Handlers['MonitorStatusSSE'] = async (request, { logger, state }) => {
  const monitorId = (request as any).params?.id ?? null;

  // Attempt to access raw node response/req from common request shapes — do this before any usage
  const rawReq = (request as any).raw?.req ?? (request as any).req ?? (request as any).rawReq ?? null;
  const rawRes = (request as any).raw?.res ?? (request as any).res ?? (request as any).rawRes ?? null;

  // Validate once
  if (!rawRes || !rawReq || typeof rawRes.write !== 'function') {
    logger.warn('SSE not supported by runtime', { monitorId });
    // Keep promise open (do not return HTTP error)
    return new Promise(() => {});
  }

  // Set required SSE headers BEFORE any write
  rawRes.setHeader('Content-Type', 'text/event-stream');
  rawRes.setHeader('Cache-Control', 'no-cache');
  rawRes.setHeader('Connection', 'keep-alive');
  rawRes.setHeader('X-Accel-Buffering', 'no');
  rawRes.setHeader('Access-Control-Allow-Origin', '*');

  // Flush headers immediately so client sees the response as a stream
  if (typeof rawRes.flushHeaders === 'function') rawRes.flushHeaders();

  logger.info('SSE client connected', { monitorId });
  let closed = false;
  let pollInterval: ReturnType<typeof setInterval> | null = null;
  let keepAliveInterval: ReturnType<typeof setInterval> | null = null;

  // Cleanup function (declared before sendEvent so handlers can call it safely)
  function cleanup() {
    if (closed) return;
    closed = true;

    if (pollInterval !== null) {
      clearInterval(pollInterval);
      pollInterval = null;
    }

    if (keepAliveInterval !== null) {
      clearInterval(keepAliveInterval);
      keepAliveInterval = null;
    }

    logger.info('SSE client disconnected', { monitorId });
  }

  // Define sendEvent only after rawRes exists
  const sendEvent = (data: any) => {
    try {
      rawRes.write(`event: status\n`);
      rawRes.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (e) {
      try { cleanup(); } catch (_) { /* noop */ }
    }
  };

  // Send exactly one initial status event to satisfy frontend contract
  try {
    sendEvent({
      monitorId: monitorId ?? '',
      success: null,
      latency: null,
      uptimePercent: null,
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    logger.warn('Failed to write initial status event', { monitorId, error: e });
  }
  
  // Send keepalive pings to prevent proxies from closing the connection
  keepAliveInterval = setInterval(() => {
    try { rawRes.write(': keep-alive\n\n'); } catch (e) { cleanup(); }
  }, 3000);

  // Helper to write SSE events. If `eventName` is omitted, write only `data:`


  // Polling loop: fetch latest metrics for monitor and stream updates
  let lastSentKey: string | null = null;

  pollInterval = setInterval(async () => {
    try {
      const allMetrics = ((await state.getGroup('monitor-metrics')) as MonitorMetric[]) || [];
      // find metrics for this monitor within last 60 minutes
      const now = Date.now();
      const cutoff = now - 60 * 60 * 1000;
      const relevant = allMetrics
        .filter((m: any) => m?.monitorId === monitorId)
        .filter((m: any) => {
          const t = Date.parse(m?.timestamp ?? '');
          return !Number.isNaN(t) && t >= cutoff;
        })
        .sort((a: any, b: any) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

      if (relevant.length === 0) {
        // send a heartbeat with no data occasionally
        sendEvent({ monitorId, empty: true, timestamp: new Date().toISOString() });
        return;
      }

      const latest = relevant[relevant.length - 1] as MonitorMetric;
      // const uniqueKey = `${latest.monitorId}:${latest.timestamp}:${latest.latency}`;
      // if (uniqueKey === lastSentKey) return; // no change
      // lastSentKey = uniqueKey;

      // compute uptime % in window
      const successes = relevant.filter((r: any) => r.success === true).length;
      const uptime = relevant.length ? (successes / relevant.length) * 100 : null;

      const payload = {
  monitorId,
  timestamp: latest.timestamp,
  latency: latest.latency,
  statusCode: latest.statusCode,
  success: latest.success,
  uptimePercent: uptime
};

sendEvent(payload);

    } catch (err) {
      logger.warn('Error polling metrics for SSE', { monitorId, error: err });
    }
  }, 2000);

  // Immediately trigger one poll
  (async () => {
    try {
      const allMetrics = (await state.getGroup('monitor-metrics')) || [];
      const now = Date.now();
      const cutoff = now - 60 * 60 * 1000;
      const relevant = allMetrics
        .filter((m: any) => m?.monitorId === monitorId)
        .filter((m: any) => {
          const t = Date.parse(m?.timestamp ?? '');
          return !Number.isNaN(t) && t >= cutoff;
        })
        .sort((a: any, b: any) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

      if (relevant.length > 0) {
        const latest = relevant[relevant.length - 1] as MonitorMetric;
        const successes = relevant.filter((r: any) => r.success === true).length;
        const uptime = relevant.length ? (successes / relevant.length) * 100 : null;

        sendEvent({
          monitorId,
          timestamp: latest.timestamp,
          latency: latest.latency,
          statusCode: latest.statusCode,
          success: latest.success,
          uptimePercent: uptime
        });
      }
    } catch (err) {
      logger.warn('Error during initial SSE poll', { monitorId, error: err });
    }
  })();

  // Resolve the route only when the client disconnects. Keep the raw response open.
  return await new Promise<void>((resolve) => {
    rawReq.once('close', () => {
      cleanup();
      resolve();
    });
  });
};
