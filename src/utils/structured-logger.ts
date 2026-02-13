/**
 * Structured Logging Utility for Sentinal
 *
 * Provides rich, structured logging with:
 * - Contextual information
 * - Performance metrics
 * - Error tracking
 * - Trace correlation
 * - JSON-formatted output for log aggregation
 */

import type { Logger } from '#/types'
import { getErrorContext } from '../errors/sentinal-errors'

export interface LogContext {
  incidentId?: string
  alertType?: string
  severity?: string
  resource?: string
  source?: string
  duration?: number
  metadata?: Record<string, unknown>
  [key: string]: unknown
}

export interface PerformanceMetrics {
  operation: string
  startTime: number
  endTime?: number
  duration?: number
  success: boolean
  error?: unknown
}

/**
 * Structured Logger wrapper for Motia logger
 */
export class StructuredLogger {
  constructor(private logger: Logger, private defaultContext: LogContext = {}) {}

  /**
   * Log with full context
   */
  info(message: string, context?: LogContext) {
    const fullContext = { ...this.defaultContext, ...context }
    this.logger.info(message, this.flattenContext(fullContext))
  }

  warn(message: string, context?: LogContext) {
    const fullContext = { ...this.defaultContext, ...context }
    this.logger.warn(message, this.flattenContext(fullContext))
  }

  error(message: string, error: unknown, context?: LogContext) {
    const errorContext = getErrorContext(error)
    const fullContext = {
      ...this.defaultContext,
      ...context,
      error: errorContext,
    }
    this.logger.error(message, this.flattenContext(fullContext))
  }

  /**
   * Log alert-related events
   */
  alert(
    event: 'detected' | 'analyzed' | 'approved' | 'rejected' | 'executed' | 'resolved',
    incidentId: string,
    context?: LogContext
  ) {
    const fullContext = {
      ...this.defaultContext,
      ...context,
      incidentId,
      event: `alert.${event}`,
    }

    this.logger.info(`Alert ${event}`, this.flattenContext(fullContext))
  }

  /**
   * Log performance metrics
   */
  performance(metrics: PerformanceMetrics) {
    const duration = metrics.duration ?? (metrics.endTime ? metrics.endTime - metrics.startTime : 0)

    this.logger.info(`Performance: ${metrics.operation}`, {
      operation: metrics.operation,
      duration: `${duration}ms`,
      success: metrics.success,
      ...(metrics.error && { error: getErrorContext(metrics.error) }),
    })
  }

  /**
   * Start a performance timer
   */
  startTimer(operation: string): () => void {
    const startTime = Date.now()

    return () => {
      const endTime = Date.now()
      this.performance({
        operation,
        startTime,
        endTime,
        success: true,
      })
    }
  }

  /**
   * Log state operation
   */
  stateOperation(
    operation: 'get' | 'set' | 'delete',
    group: string,
    key: string,
    context?: LogContext
  ) {
    this.info(`State ${operation}`, {
      ...context,
      stateGroup: group,
      stateKey: key,
      operation,
    })
  }

  /**
   * Log external service calls
   */
  externalCall(
    service: string,
    operation: string,
    success: boolean,
    duration: number,
    context?: LogContext
  ) {
    const logFn = success ? this.info.bind(this) : this.warn.bind(this)

    logFn(`External call: ${service}.${operation}`, {
      ...context,
      service,
      operation,
      success,
      duration: `${duration}ms`,
    })
  }

  /**
   * Create child logger with additional default context
   */
  child(additionalContext: LogContext): StructuredLogger {
    return new StructuredLogger(this.logger, {
      ...this.defaultContext,
      ...additionalContext,
    })
  }

  /**
   * Flatten nested context for Motia logger
   */
  private flattenContext(context: LogContext): Record<string, string | number | boolean> {
    const flattened: Record<string, string | number | boolean> = {}

    for (const [key, value] of Object.entries(context)) {
      if (value === undefined || value === null) {
        continue
      }

      if (typeof value === 'object' && !Array.isArray(value)) {
        // Flatten nested objects
        for (const [nestedKey, nestedValue] of Object.entries(value)) {
          if (nestedValue !== undefined && nestedValue !== null) {
            flattened[`${key}_${nestedKey}`] = this.formatValue(nestedValue)
          }
        }
      } else {
        flattened[key] = this.formatValue(value)
      }
    }

    return flattened
  }

  /**
   * Format value for logging
   */
  private formatValue(value: unknown): string | number | boolean {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value
    }

    if (Array.isArray(value)) {
      return value.join(', ')
    }

    if (value instanceof Date) {
      return value.toISOString()
    }

    return JSON.stringify(value)
  }
}

/**
 * Helper to create structured logger from Motia logger
 */
export function createStructuredLogger(
  logger: Logger,
  context?: LogContext
): StructuredLogger {
  return new StructuredLogger(logger, context)
}

/**
 * Performance tracking decorator
 */
export function trackPerformance(operation: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value

    descriptor.value = async function (this: any, ...args: any[]) {
      const startTime = Date.now()
      let success = true
      let error: unknown

      try {
        const result = await originalMethod.apply(this, args)
        return result
      } catch (err) {
        success = false
        error = err
        throw err
      } finally {
        const endTime = Date.now()

        // If the instance has a logger, log performance
        if (this.logger && typeof this.logger.info === 'function') {
          const duration = endTime - startTime
          this.logger.info(`Performance: ${operation}`, {
            operation,
            duration: `${duration}ms`,
            success,
            ...(error && { error: getErrorContext(error) }),
          })
        }
      }
    }

    return descriptor
  }
}
