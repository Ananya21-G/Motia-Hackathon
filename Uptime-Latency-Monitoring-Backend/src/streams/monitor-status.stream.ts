import { z } from 'zod'

export const monitorStatusSchema = z.object({
  monitorId: z.string(),
  timestamp: z.string(),
  latency: z.number().optional(),
  statusCode: z.number().optional(),
  success: z.boolean().optional()
})

export const config = {
  name: 'monitorStatus',
  schema: monitorStatusSchema,
  baseConfig: { storageType: 'default' }
}
