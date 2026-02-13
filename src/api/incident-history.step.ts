import type { ApiConfig, Handlers } from '#/types'
import { z } from 'zod'
import { errorHandler } from '../../middlewares/error-handler.middleware'
import { requestLogger } from '../../middlewares/logging.middleware'

/**
 * Incident History API
 *
 * Query completed and resolved incidents
 *
 * Features showcased:
 * - GET endpoint
 * - State group queries
 * - Data aggregation
 * - Incident lifecycle tracking
 */

const IncidentSchema = z.object({
  id: z.string(),
  alertType: z.string(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  status: z.string(),
  resolvedAt: z.string().optional(),
  lifecycle: z
    .object({
      detected: z.string().optional(),
      rcaCompleted: z.string().optional(),
      approved: z.string().optional(),
      executed: z.string().optional(),
      verified: z.string().optional(),
      resolved: z.string().optional(),
    })
    .optional(),
  summary: z
    .object({
      rcaSummary: z.string(),
      rootCause: z.string(),
      proposedFix: z.string(),
      riskLevel: z.string(),
    })
    .optional(),
  rcaSummary: z.string().optional(),
  proposedFix: z.string().optional(),
  riskLevel: z.enum(['low', 'medium', 'high']).optional(),
  approvalStatus: z.enum(['pending', 'approved', 'rejected', 'auto-approved']).optional(),
  executionProgress: z.number().optional(),
  executionLogs: z.array(z.string()).optional(),
  executionResult: z.object({
    success: z.boolean(),
    message: z.string(),
    logs: z.array(z.string()).optional(),
  }).optional(),
  timestamps: z.any().optional(), // Keep original timestamps for compatibility
  metadata: z.record(z.string(), z.unknown()).optional(),
})

const IncidentHistoryResponseSchema = z.object({
  incidents: z.array(IncidentSchema),
  count: z.number(),
  statistics: z.object({
    total: z.number(),
    resolved: z.number(),
    partiallyResolved: z.number(),
    failed: z.number(),
  }),
})

export const config: ApiConfig = {
  name: 'IncidentHistory',
  type: 'api',
  description: 'Get incident history and statistics',
  method: 'GET',
  path: '/incidents/history',
  emits: [],
  responseSchema: {
    200: IncidentHistoryResponseSchema,
  },
  flows: ['sentinal-sre'],
  middleware: [requestLogger, errorHandler],
}

export const handler: Handlers['IncidentHistory'] = async (req, { logger, streams }) => {
  logger.info('Fetching incident history')

  try {
    const incidentsGroup = await streams.incident.getGroup('incidents')

    const incidents = Object.values(incidentsGroup)
      .map((incident: any) => ({
        ...incident, // Include all fields from stream
        resolvedAt: incident.timestamps?.resolved,
        lifecycle: incident.timestamps,
        summary: (incident.rcaSummary || incident.proposedFix || incident.riskLevel) ? {
          rcaSummary: incident.rcaSummary || '',
          rootCause: '', // Not available in stream
          proposedFix: incident.proposedFix || '',
          riskLevel: incident.riskLevel || 'medium',
        } : undefined,
      }))
      .sort((a, b) => {
        const timeA = a.lifecycle?.detected ? new Date(a.lifecycle.detected).getTime() : 0
        const timeB = b.lifecycle?.detected ? new Date(b.lifecycle.detected).getTime() : 0
        return timeB - timeA // Most recent detected first
      })

    // Calculate statistics
    const statistics = {
      total: incidents.length,
      resolved: incidents.filter((i) => i.status === 'resolved').length,
      partiallyResolved: incidents.filter((i) => i.status === 'partially_resolved').length,
      failed: incidents.filter((i) => i.status === 'failed').length,
    }

    logger.info('Incident history retrieved', {
      total: incidents.length,
      resolved: statistics.resolved,
    })

    return {
      status: 200,
      body: {
        incidents,
        count: incidents.length,
        statistics,
      },
    }
  } catch (error) {
    logger.error('Failed to fetch incident history', {
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      status: 200,
      body: {
        incidents: [],
        count: 0,
        statistics: {
          total: 0,
          resolved: 0,
          partiallyResolved: 0,
          failed: 0,
        },
      },
    }
  }
}
