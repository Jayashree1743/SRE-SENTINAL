import type { ApiConfig, Handlers } from '#/types'
import { z } from 'zod'
import { AlertTypeSchema } from '../types/incidents.types'
import { infrastructureSimulator } from '../services/infrastructure-simulator'
import { errorHandler } from '../../middlewares/error-handler.middleware'
import { requestLogger } from '../../middlewares/logging.middleware'

/**
 * Manual Alert Trigger API
 *
 * Allows manual triggering of specific alert scenarios for testing and demos
 *
 * Features showcased:
 * - API endpoints
 * - Request validation with Zod
 * - Integration with infrastructure simulator
 * - Event emission
 *
 * Usage:
 * POST /api/trigger-alert
 * Body: { "scenario": "high_memory" | "container_down" | "disk_full" | "network_latency" | "cpu_spike" }
 */

const TriggerAlertRequestSchema = z.object({
  scenario: AlertTypeSchema,
})

const TriggerAlertResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  scenario: AlertTypeSchema,
  alert: z.object({
    id: z.string(),
    alertType: AlertTypeSchema,
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    timestamp: z.string(),
  }),
})

export const config: ApiConfig = {
  name: 'TriggerAlert',
  type: 'api',
  description: 'Manually trigger alert scenarios for testing',
  method: 'POST',
  path: '/trigger-alert',
  bodySchema: TriggerAlertRequestSchema,
  responseSchema: {
    200: TriggerAlertResponseSchema,
    400: z.object({ error: z.string() }),
  },
  emits: ['alert.detected'],
  flows: ['sentinal-sre'],
  middleware: [requestLogger, errorHandler],
}

export const handler: Handlers['TriggerAlert'] = async (req, { logger, emit, state }) => {
  const { scenario } = req.body

  logger.info('Manual alert trigger requested', { scenario })

  try {
    // Activate the scenario in the simulator
    infrastructureSimulator.triggerScenario(scenario)

    // Collect metrics with the scenario applied
    const metrics = infrastructureSimulator.collectMetrics()
    const healthChecks = infrastructureSimulator.performHealthChecks(metrics)
    const alerts = infrastructureSimulator.detectAlerts(healthChecks)

    if (alerts.length === 0) {
      return {
        status: 400,
        body: {
          error: 'Failed to generate alert for scenario. This might be a configuration issue.',
        },
      }
    }

    // Take the first alert (there should typically be one for the scenario)
    const alert = alerts[0]

    // Store in state
    await state.set('alerts', alert.id, alert)

    // Emit to event pipeline
    await emit({
      topic: 'alert.detected',
      data: alert,
    })

    logger.info('Alert triggered successfully', {
      scenario,
      alertId: alert.id,
      severity: alert.severity,
    })

    return {
      status: 200,
      body: {
        success: true,
        message: `Alert scenario '${scenario}' triggered successfully`,
        scenario,
        alert: {
          id: alert.id,
          alertType: alert.alertType,
          severity: alert.severity,
          timestamp: alert.timestamp,
        },
      },
    }
  } catch (error) {
    logger.error('Failed to trigger alert scenario', {
      scenario,
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      status: 400,
      body: {
        error: 'Failed to trigger alert scenario',
      },
    }
  }
}
