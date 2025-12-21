import type { EventConfig, Handlers } from 'motia';
import { z } from 'zod';

const inputSchema = z.object({ monitorId: z.string() });

export const config: EventConfig = {
  name: 'CheckAnomaly',
  type: 'event',
  description: 'Analyzes last 60 minutes of metrics for a monitor and emits SEND_ALERT if anomaly detected',
  subscribes: ['CHECK_ANOMALY'],
  emits: ['SEND_ALERT'],
  input: inputSchema as any,
  flows: ['monitoring']
};

type Metric = {
  monitorId: string;
  timestamp: string; // ISO string
  latency?: number;
  statusCode?: number;
  success?: boolean;
};

function parseISO(ts?: string): Date | null {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function mean(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((s, v) => s + v, 0) / nums.length;
}

function pstdev(nums: number[]): number {
  if (nums.length === 0) return 0;
  const mu = mean(nums);
  const sumSq = nums.reduce((s, v) => s + (v - mu) * (v - mu), 0);
  return Math.sqrt(sumSq / nums.length);
}

function severityFromZ(z: number): 'NORMAL' | 'WARNING' | 'CRITICAL' {
  const az = Math.abs(z);
  if (az > 3) return 'CRITICAL';
  if (az > 2) return 'WARNING';
  return 'NORMAL';
}

export const handler: Handlers['CheckAnomaly'] = async (input: z.infer<typeof inputSchema>, context) => {
  const { logger, state, emit } = context;
  const { monitorId } = input;
  logger.info('CheckAnomaly handler started', { monitorId });

  const now = new Date();
  const windowStart = new Date(now.getTime() - 60 * 60 * 1000); // last 60 minutes

  const all = ((await state.getGroup('monitor-metrics')) as Metric[]) || [];

  const metrics: (Metric & { _ts: Date })[] = [];

  for (const m of all) {
    try {
      if (m.monitorId !== monitorId) continue;
      const d = parseISO(m.timestamp);
      if (!d) {
        logger.warn('Skipping metric with invalid timestamp', { metric: m });
        continue;
      }
      if (d < windowStart) continue;
      metrics.push({ ...(m as Metric), _ts: d });
    } catch (err) {
      logger.warn('Error parsing metric', { metric: m, error: err });
    }
  }

  if (metrics.length === 0) {
    logger.info('No metrics found in last 60 minutes', { monitorId });
    return { monitorId, severity: 'NORMAL', reason: 'no_metrics' } as const;
  }

  // sort oldest -> newest
  metrics.sort((a, b) => a._ts.getTime() - b._ts.getTime());

  // Latency z-score (latest vs distribution)
  const latencies = metrics.map(m => (typeof m.latency === 'number' ? m.latency : NaN)).filter(n => !Number.isNaN(n));
  if (latencies.length === 0) {
    logger.info('No latency values available; treating as NORMAL', { monitorId });
    return { monitorId, severity: 'NORMAL', reason: 'no_latency' } as const;
  }

  const meanLat = mean(latencies);
  const stdevLat = pstdev(latencies);
  const latestLatency = latencies[latencies.length - 1];
  const zLatency = stdevLat > 0 ? (latestLatency - meanLat) / stdevLat : 0;

  // Error rate: bucket per-minute
  const buckets: Map<number, (Metric & { _ts: Date })[]> = new Map();
  for (const m of metrics) {
    const minuteKey = Math.floor(m._ts.getTime() / 60000) * 60000; // ms rounded to minute
    const arr = buckets.get(minuteKey) || [];
    arr.push(m);
    buckets.set(minuteKey, arr);
  }

  const minuteKeys = Array.from(buckets.keys()).sort((a, b) => a - b);
  const errorRates: number[] = [];
  for (const k of minuteKeys) {
    const arr = buckets.get(k) || [];
    const failures = arr.reduce((s, x) => s + (x.success === false ? 1 : 0), 0);
    errorRates.push(arr.length > 0 ? failures / arr.length : 0);
  }

  const latestErrorRate = errorRates.length > 0 ? errorRates[errorRates.length - 1] : 0;
  const meanEr = mean(errorRates);
  const stdevEr = pstdev(errorRates);
  const zError = stdevEr > 0 ? (latestErrorRate - meanEr) / stdevEr : 0;

  const sevLatency = severityFromZ(zLatency);
  const sevError = severityFromZ(zError);

  let severity: 'NORMAL' | 'WARNING' | 'CRITICAL' = 'NORMAL';
  if (sevLatency === 'CRITICAL' || sevError === 'CRITICAL') severity = 'CRITICAL';
  else if (sevLatency === 'WARNING' || sevError === 'WARNING') severity = 'WARNING';

  const result = {
    monitorId,
    severity,
    samples: metrics.length,
    latency: { value: latestLatency, mean: meanLat, stdev: stdevLat, z: zLatency },
    error_rate: { value: latestErrorRate, mean: meanEr, stdev: stdevEr, z: zError }
  } as const;

  logger.info('Anomaly detection result', { monitorId, result });

  if (severity !== 'NORMAL') {
    await emit({ topic: 'SEND_ALERT', data: { monitorId, severity, diagnostic: result } });
    logger.info('Emitted SEND_ALERT', { monitorId, severity });
  }

  return result;
};
