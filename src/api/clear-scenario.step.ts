import type { ApiConfig, Handlers } from '#/types'
import { z } from 'zod'
import { infrastructureSimulator } from '../services/infrastructure-simulator'
import { errorHandler } from '../../middlewares/error-handler.middleware'
import { requestLogger } from '../../middlewares/logging.middleware'

/**
 * Clear Scenario API
 *
 * Clear active alert scenario (simulate fix)
 *
 * Features showcased:
 * - API endpoints (POST)
 * - Simulator control
 */

const ClearScenarioResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
})

export const config: ApiConfig = {
  name: 'ClearScenario',
  type: 'api',
  description: 'Clear active alert scenario',
  method: 'POST',
  path: '/clear-scenario',
  emits: [],
  responseSchema: {
    200: ClearScenarioResponseSchema,
  },
  flows: ['sentinal-sre'],
  middleware: [requestLogger, errorHandler],
}

export const handler: Handlers['ClearScenario'] = async (req, { logger }) => {
  logger.info('Clearing active scenario')

  try {
    const previousScenario = infrastructureSimulator.getActiveScenario()
    infrastructureSimulator.clearScenario()

    logger.info('Scenario cleared', {
      previousScenario: previousScenario || 'none',
    })

    return {
      status: 200,
      body: {
        success: true,
        message: previousScenario
          ? `Cleared scenario: ${previousScenario}`
          : 'No active scenario to clear',
      },
    }
  } catch (error) {
    logger.error('Failed to clear scenario', {
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      status: 200,
      body: {
        success: false,
        message: 'Failed to clear scenario',
      },
    }
  }
}
