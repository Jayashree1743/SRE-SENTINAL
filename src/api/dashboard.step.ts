import type { ApiConfig, Handlers } from '#/types'
import { readFileSync } from 'fs'
import { join } from 'path'
import { errorHandler } from '../../middlewares/error-handler.middleware'
import { requestLogger } from '../../middlewares/logging.middleware'

/**
 * Dashboard HTML Endpoint
 *
 * Serves the real-time incident dashboard
 */
export const config: ApiConfig = {
  name: 'Dashboard',
  type: 'api',
  description: 'Serves the real-time incident dashboard',
  method: 'GET',
  path: '/dashboard',
  emits: [],
  flows: ['sentinal-sre'],
  middleware: [requestLogger, errorHandler],
}

export const handler: Handlers['Dashboard'] = async (req, { logger }) => {
  logger.info('Dashboard requested')

  try {
    const dashboardPath = join(process.cwd(), 'public', 'dashboard.html')
    const html = readFileSync(dashboardPath, 'utf-8')

    return {
      status: 200,
      headers: {
        'Content-Type': 'text/html',
      },
      body: html,
    }
  } catch (error) {
    logger.error('Failed to serve dashboard', {
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      status: 404,
      body: 'Dashboard not found',
    }
  }
}
