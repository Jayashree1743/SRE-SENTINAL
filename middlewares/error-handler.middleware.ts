import type { Middleware } from '#/types'
import { ZodError } from 'zod'

/**
 * Global Error Handling Middleware
 *
 * Catches and handles all errors in API requests
 * - Zod validation errors → 400 Bad Request
 * - Custom errors → appropriate status codes
 * - Unexpected errors → 500 Internal Server Error
 *
 * Features showcased:
 * - Middleware pattern
 * - Error handling
 * - Structured logging
 * - Response formatting
 */
export const errorHandler: Middleware = async (req, context, next) => {
  const { logger } = context

  try {
    // Execute the handler
    const response = await next()
    return response
  } catch (error) {
    // Log the error with context
    logger.error('Request failed with error', {
      path: req.path,
      method: req.method,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })

    // Handle Zod validation errors
    if (error instanceof ZodError) {
      logger.warn('Validation error', {
        issues: error.issues,
      })

      return {
        status: 400,
        body: {
          error: 'Validation failed',
          details: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      }
    }

    // Handle known error types
    if (error instanceof Error) {
      // Check for specific error messages
      if (error.message.includes('not found')) {
        return {
          status: 404,
          body: {
            error: 'Resource not found',
            message: error.message,
          },
        }
      }

      if (error.message.includes('unauthorized') || error.message.includes('forbidden')) {
        return {
          status: 403,
          body: {
            error: 'Access denied',
            message: error.message,
          },
        }
      }

      // Default error response
      return {
        status: 500,
        body: {
          error: 'Internal server error',
          message: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred',
        },
      }
    }

    // Unknown error type
    return {
      status: 500,
      body: {
        error: 'Internal server error',
        message: 'An unexpected error occurred',
      },
    }
  }
}

export default errorHandler
