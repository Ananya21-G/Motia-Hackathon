import type { EventConfig, Handlers } from 'motia';
import { z } from 'zod';
import axios from 'axios';

const inputSchema = z.object({
  monitorId: z.string(),
  severity: z.enum(['NORMAL', 'WARNING', 'CRITICAL']),
  diagnostic: z.any().optional()
});

export const config: EventConfig = {
  name: 'SendAlert',
  type: 'event',
  description: 'Routes alerts: CRITICAL -> email, WARNING -> webhook. Includes monitor context and metrics summary.',
  subscribes: ['SEND_ALERT'],
  emits: [],
  input: inputSchema as any,
  flows: ['monitoring']
};

type Metric = {
  monitorId: string;
  timestamp: string;
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

export const handler: Handlers['SendAlert'] = async (input: z.infer<typeof inputSchema>, context) => {
  const { logger, state } = context;
  const { monitorId, severity, diagnostic } = input;
  logger.info('SendAlert handler started', { monitorId, severity });

  // Load monitor config
  const monitor = (await state.get('monitors', monitorId)) as any;
  if (!monitor) {
    logger.warn('Monitor config not found for alert', { monitorId });
    return;
  }

  const monitorUrl: string | undefined = monitor.url;

  // Gather last 60 minutes of metrics for this monitor
  const now = new Date();
  const windowStart = new Date(now.getTime() - 60 * 60 * 1000);

  const allMetrics = ((await state.getGroup('monitor-metrics')) as Metric[]) || [];
  const metrics: (Metric & { _ts: Date })[] = [];
  for (const m of allMetrics) {
    if (m.monitorId !== monitorId) continue;
    const d = parseISO(m.timestamp);
    if (!d) continue;
    if (d < windowStart) continue;
    metrics.push({ ...(m as Metric), _ts: d });
  }

  metrics.sort((a, b) => a._ts.getTime() - b._ts.getTime());

  const latencies = metrics.map(m => (typeof m.latency === 'number' ? m.latency : NaN)).filter(n => !Number.isNaN(n));
  const avgLatency = latencies.length ? mean(latencies) : null;

  // compute failure duration: time since last successful metric
  const successes = metrics.filter(m => m.success === true);
  let failureDurationSeconds: number | null = null;
  if (successes.length > 0) {
    const lastSuccess = successes[successes.length - 1]._ts;
    failureDurationSeconds = Math.floor((now.getTime() - lastSuccess.getTime()) / 1000);
  } else if (metrics.length > 0) {
    // no success in window, estimate from earliest metric in window
    const firstMetricTs = metrics[0]._ts;
    failureDurationSeconds = Math.floor((now.getTime() - firstMetricTs.getTime()) / 1000);
  } else {
    // no metrics at all
    failureDurationSeconds = null;
  }

  const contextPayload = {
    monitorId,
    monitorUrl,
    failureDurationSeconds,
    avgLatency,
    severity,
    timestamp: now.toISOString(),
    diagnostic: diagnostic ?? null
  };

  // Dispatch based on severity
  try {
    if (severity === 'CRITICAL') {
      // SEND EMAIL
      // Use env vars or monitor-specific configuration; do not hardcode credentials
      const emailApiUrl = process.env.EMAIL_API_URL || monitor?.emailApiUrl;
      const emailApiKey = process.env.EMAIL_API_KEY || monitor?.emailApiKey;
      const emailTo = monitor?.alertTo || process.env.EMAIL_TO;
      const emailFrom = process.env.EMAIL_FROM || monitor?.emailFrom;

      if (!emailApiUrl || !emailApiKey || !emailTo || !emailFrom) {
        logger.warn('Email not sent: missing email configuration (no hardcoded credentials).', { monitorId });
      } else {
        const subject = `[CRITICAL] Monitor ${monitorId} is down`;
        const bodyText = `Monitor ${monitorId} (${monitorUrl ?? 'unknown URL'}) reported CRITICAL at ${now.toISOString()}\n\n` +
          `Failure duration (s): ${failureDurationSeconds ?? 'unknown'}\n` +
          `Avg latency (ms): ${avgLatency ?? 'unknown'}\n\n` +
          `Diagnostic: ${JSON.stringify(diagnostic ?? {})}`;

        // Generic POST to an email-sending API (user must supply compatible API)
        await axios.post(emailApiUrl, {
          to: emailTo,
          from: emailFrom,
          subject,
          text: bodyText
        }, {
          headers: { Authorization: `Bearer ${emailApiKey}` }
        });

        logger.info('Email alert sent (via EMAIL_API_URL)', { monitorId, emailTo });
      }
    }

    if (severity === 'WARNING' || severity === 'CRITICAL') {
      // send webhook: prefer monitor-specific webhook then env var
      const webhookUrl = monitor?.alertWebhookUrl || process.env.MONITOR_WEBHOOK_URL;
      if (!webhookUrl) {
        logger.warn('Webhook not sent: no webhook URL configured', { monitorId });
      } else {
        await axios.post(webhookUrl, contextPayload, { headers: { 'Content-Type': 'application/json' } });
        logger.info('Webhook alert sent', { monitorId, webhookUrl });
      }
    }
      // Handle recovery notifications (emit NORMAL with diagnostic.recovered === true)
      if (severity === 'NORMAL') {
        const recovered = !!(diagnostic && (diagnostic as any).recovered);
        if (recovered) {
          // Send email if configured
          const emailApiUrl = process.env.EMAIL_API_URL || monitor?.emailApiUrl;
          const emailApiKey = process.env.EMAIL_API_KEY || monitor?.emailApiKey;
          const emailTo = monitor?.alertTo || process.env.EMAIL_TO;
          const emailFrom = process.env.EMAIL_FROM || monitor?.emailFrom;

          if (emailApiUrl && emailApiKey && emailTo && emailFrom) {
            const subject = `[RECOVERED] Monitor ${monitorId} recovered`;
            const bodyText = `Monitor ${monitorId} (${monitorUrl ?? 'unknown URL'}) recovered at ${now.toISOString()}`;
            try {
              await axios.post(emailApiUrl, { to: emailTo, from: emailFrom, subject, text: bodyText }, { headers: { Authorization: `Bearer ${emailApiKey}` } });
              logger.info('Recovery email sent', { monitorId, emailTo });
            } catch (e) {
              logger.warn('Failed to send recovery email', { monitorId, error: e });
            }
          } else {
            logger.info('Recovery email not sent: missing configuration', { monitorId });
          }

          // Send webhook if configured
          const webhookUrl = monitor?.alertWebhookUrl || process.env.MONITOR_WEBHOOK_URL;
          if (!webhookUrl) {
            logger.info('Recovery webhook not sent: no webhook URL configured', { monitorId });
          } else {
            try {
              await axios.post(webhookUrl, contextPayload, { headers: { 'Content-Type': 'application/json' } });
              logger.info('Recovery webhook sent', { monitorId, webhookUrl });
            } catch (e) {
              logger.warn('Failed to send recovery webhook', { monitorId, error: e });
            }
          }
        } else {
          logger.info('Severity NORMAL: no alert routed', { monitorId });
        }
      }
  } catch (err: any) {
    logger.error('Error routing alert', { monitorId, error: err?.message ?? err });
  }
};
