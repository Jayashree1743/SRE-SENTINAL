import { z } from 'zod'
import type { StreamConfig } from '#/types'

/**
 * Incidents Stream
 *
 * Real-time stream for incident status updates
 * Clients can subscribe to watch incidents progress through their lifecycle
 *
 * Features showcased:
 * - Real-time streaming (SSE)
 * - Stateful stream
 * - Custom schema
 * - Live incident tracking
 */

// Incident stream schema
export const IncidentStreamSchema = z.object({
  id: z.string(),
  alertType: z.string(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  status: z.enum([
    'detected',
    'analyzing',
    'pending_approval',
    'executing',
    'verifying',
    'resolved',
    'failed',
  ]),
  rcaSummary: z.string().optional(),
  proposedFix: z.string().optional(),
  riskLevel: z.enum(['low', 'medium', 'high']).optional(),
  approvalStatus: z.enum(['pending', 'approved', 'rejected', 'auto-approved']).optional(),
  executionProgress: z.number().optional(), // 0-100
  executionLogs: z.array(z.string()).optional(),
  timestamps: z.object({
    detected: z.string(),
    rcaCompleted: z.string().optional(),
    approved: z.string().optional(),
    executed: z.string().optional(),
    verified: z.string().optional(),
    resolved: z.string().optional(),
  }),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export type IncidentStream = z.infer<typeof IncidentStreamSchema>

export const config: StreamConfig = {
  name: 'incident',
  schema: IncidentStreamSchema,
  baseConfig: {
    storageType: 'default',
  },
}
