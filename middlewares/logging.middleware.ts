import type { Middleware } from '#/types'

/**
 * Request Logging Middleware
 *
 * Logs all incoming API requests with timing
 *
 * Features showcased:
 * - Middleware pattern
 * - Request logging
 * - Performance tracking
 */
export const requestLogger: Middleware = async (req, context, next) => {
  const { logger } = context
  const startTime = Date.now()

  logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    query: req.query,
  })

  try {
    const response = await next()
    const duration = Date.now() - startTime

    logger.info('Request completed', {
      method: req.method,
      path: req.path,
      status: response.status,
      duration: `${duration}ms`,
    })

    return response
  } catch (error) {
    const duration = Date.now() - startTime

    logger.error('Request failed', {
      method: req.method,
      path: req.path,
      duration: `${duration}ms`,
      error: error instanceof Error ? error.message : String(error),
    })

    throw error
  }
}

export default requestLogger
