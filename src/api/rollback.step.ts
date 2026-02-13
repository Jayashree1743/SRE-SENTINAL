import type { ApiConfig, Handlers } from '#/types'
import { rollbackManager } from '../services/rollback-manager'

/**
 * Manual Rollback API Endpoint
 *
 * Allows operators to manually trigger rollback for an incident
 * Provides rollback history and statistics
 */

export const config: ApiConfig = {
  name: 'ManualRollback',
  type: 'api',
  description: 'Manually trigger rollback for an incident',
  method: 'POST',
  path: '/rollback',
  queryParams: [
    {
      name: 'incident',
      description: 'The incident ID to rollback',
    },
  ],
  emits: [],
  flows: ['sentinal-sre'],
}

export const handler: Handlers['ManualRollback'] = async (req, { logger, state }) => {
  const incidentId = req.queryParams.incident as string
  const reason = (req.body as any)?.reason || 'Manual rollback requested'

  logger.info('Manual rollback requested', { incidentId, reason })

  try {
    // Check if rollback is available
    const available = await rollbackManager.isRollbackAvailable(state, incidentId)

    if (!available) {
      return {
        status: 404,
        body: {
          error: 'No rollback snapshot found for this incident',
          incidentId,
        },
      }
    }

    // Execute rollback
    const result = await rollbackManager.executeRollback(state, incidentId, reason)

    return {
      status: result.success ? 200 : 500,
      body: {
        message: result.success
          ? 'Rollback completed successfully'
          : 'Rollback failed - see errors',
        incidentId,
        result,
      },
    }
  } catch (error) {
    logger.error('Rollback endpoint error', {
      incidentId,
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      status: 500,
      body: {
        error: 'Rollback execution failed',
        message: error instanceof Error ? error.message : String(error),
      },
    }
  }
}
