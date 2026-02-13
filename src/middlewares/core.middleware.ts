/**
 * Core Middleware for all API endpoints
 *
 * Combines:
 * - Error handling
 * - Security headers
 * - Request logging
 * - Response formatting
 */

import type { ApiMiddleware } from '#/types'
import { ZodError } from 'zod'
import { SentinalError, getErrorContext } from '../errors/sentinal-errors'

export const coreMiddleware: ApiMiddleware = async (req, ctx, next) => {
  const { logger } = ctx
  const startTime = Date.now()

  // Log incoming request
  logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    hasBody: !!req.body,
  })

  try {
    const response = await next()

    // Add security headers
    if (!response.headers) {
      response.headers = {}
    }

    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '1; mode=block'

    // Log response
    const duration = Date.now() - startTime
    logger.info('Request completed', {
      status: response.status,
      duration: `${duration}ms`,
    })

    return response
  } catch (error: any) {
    const duration = Date.now() - startTime

    // Handle Zod validation errors
    if (error instanceof ZodError) {
      logger.error('Validation error', {
        errors: error.errors,
        duration: `${duration}ms`,
      })

      return {
        status: 400,
        body: {
          error: 'Validation Error',
          message: 'Invalid request data',
          details: error.errors,
        },
      }
    }

    // Handle custom Sentinal errors
    if (error instanceof SentinalError) {
      logger.error('Sentinal error', {
        ...getErrorContext(error),
        duration: `${duration}ms`,
      })

      return {
        status: error instanceof SentinalError && 'status' in error ? (error as any).status : 500,
        body: error.toJSON(),
      }
    }

    // Handle unknown errors
    logger.error('Unhandled error', {
      error: error.message,
      stack: error.stack,
      duration: `${duration}ms`,
    })

    return {
      status: 500,
      body: {
        error: 'Internal Server Error',
        message: 'An unexpected error occurred',
      },
    }
  }
}
