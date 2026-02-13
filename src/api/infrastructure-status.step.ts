import type { ApiConfig, Handlers } from '#/types'
import { z } from 'zod'
import { infrastructureSimulator } from '../services/infrastructure-simulator'
import { prometheusClient } from '../services/prometheus-client'
import { errorHandler } from '../../middlewares/error-handler.middleware'
import { requestLogger } from '../../middlewares/logging.middleware'

/**
 * Infrastructure Status API
 *
 * Query current infrastructure status and metrics
 *
 * Features showcased:
 * - API endpoints (GET)
 * - Integration with simulator
 * - State queries
 */

const InfrastructureStatusResponseSchema = z.object({
  activeScenario: z.string().nullable(),
  metrics: z.object({
    memory: z.object({
      used: z.number(),
      total: z.number(),
      percentage: z.number(),
    }),
    cpu: z.object({
      usage: z.number(),
    }),
    disk: z.object({
      used: z.number(),
      total: z.number(),
      percentage: z.number(),
    }),
    containers: z.array(
      z.object({
        name: z.string(),
        status: z.enum(['running', 'stopped', 'crashed']),
        restartCount: z.number(),
      })
    ),
    network: z.object({
      latency: z.number(),
      errorRate: z.number(),
    }),
  }),
  recentAlerts: z.array(
    z.object({
      id: z.string(),
      alertType: z.string(),
      severity: z.string(),
      timestamp: z.string(),
    })
  ),
})

export const config: ApiConfig = {
  name: 'InfrastructureStatus',
  type: 'api',
  description: 'Get current infrastructure status',
  method: 'GET',
  path: '/infrastructure/status',
  emits: [],
  responseSchema: {
    200: InfrastructureStatusResponseSchema,
  },
  flows: ['sentinal-sre'],
  middleware: [requestLogger, errorHandler],
}

export const handler: Handlers['InfrastructureStatus'] = async (req, { logger, state }) => {
  logger.info('Infrastructure status requested')

  try {
    // Choose monitoring source: Prometheus (real) or Simulator (demo)
    const isPrometheusEnabled = await prometheusClient.isEnabled()
    const monitoringSource = isPrometheusEnabled ? prometheusClient : infrastructureSimulator

    logger.info('Infrastructure status - monitoring source', {
      source: isPrometheusEnabled ? 'Prometheus (REAL)' : 'Simulator (DEMO)',
    })

    // Get current metrics from real Prometheus or simulator
    const metrics = await monitoringSource.collectMetrics()
    const activeScenario = infrastructureSimulator.getActiveScenario()

    // Get recent alerts from state
    const alertsGroup = await state.getGroup('alerts')
    const recentAlerts = Object.values(alertsGroup)
      .sort((a: any, b: any) => {
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      })
      .slice(0, 10) // Last 10 alerts
      .map((alert: any) => ({
        id: alert.id,
        alertType: alert.alertType,
        severity: alert.severity,
        timestamp: alert.timestamp,
      }))

    return {
      status: 200,
      body: {
        activeScenario,
        metrics,
        recentAlerts,
      },
    }
  } catch (error) {
    logger.error('Failed to get infrastructure status', {
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      status: 500,
      body: {
        activeScenario: null,
        metrics: {
          memory: { used: 0, total: 0, percentage: 0 },
          cpu: { usage: 0 },
          disk: { used: 0, total: 0, percentage: 0 },
          containers: [],
          network: { latency: 0, errorRate: 0 },
        },
        recentAlerts: [],
      },
    }
  }
}
