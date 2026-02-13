/**
 * Custom Error Classes for Sentinal SRE Agent
 *
 * Provides typed, actionable errors for better error handling and recovery
 * Following Motia best practices for error handling
 */

/**
 * Base error class for all Sentinal errors
 */
export class SentinalError extends Error {
  public readonly timestamp: string
  public readonly context?: Record<string, unknown>
  public readonly recoverable: boolean

  constructor(
    message: string,
    options?: {
      context?: Record<string, unknown>
      recoverable?: boolean
      cause?: Error
    }
  ) {
    super(message)
    this.name = this.constructor.name
    this.timestamp = new Date().toISOString()
    this.context = options?.context
    this.recoverable = options?.recoverable ?? false

    // Preserve original error stack if provided
    if (options?.cause) {
      this.stack = `${this.stack}\nCaused by: ${options.cause.stack}`
    }

    // Ensure prototype chain is maintained
    Object.setPrototypeOf(this, new.target.prototype)
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      timestamp: this.timestamp,
      context: this.context,
      recoverable: this.recoverable,
      stack: this.stack,
    }
  }
}

/**
 * Monitoring and Alert Errors
 */
export class MonitoringError extends SentinalError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, { context, recoverable: true })
  }
}

export class AlertDetectionError extends MonitoringError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(`Alert detection failed: ${message}`, context)
  }
}

export class MetricsCollectionError extends MonitoringError {
  constructor(
    source: string,
    reason: string,
    context?: Record<string, unknown>
  ) {
    super(`Failed to collect metrics from ${source}: ${reason}`, {
      ...context,
      source,
    })
  }
}

/**
 * AI/LLM Related Errors
 */
export class AIError extends SentinalError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, { context, recoverable: true })
  }
}

export class LLMError extends AIError {
  public readonly provider: string
  public readonly model: string

  constructor(
    provider: string,
    model: string,
    reason: string,
    context?: Record<string, unknown>
  ) {
    super(`LLM error (${provider}/${model}): ${reason}`, context)
    this.provider = provider
    this.model = model
  }
}

export class LLMTimeoutError extends LLMError {
  constructor(provider: string, model: string, timeoutMs: number) {
    super(provider, model, `Request timed out after ${timeoutMs}ms`, {
      timeoutMs,
    })
  }
}

export class LLMQuotaExceededError extends LLMError {
  constructor(provider: string, model: string, quotaType: string) {
    super(provider, model, `${quotaType} quota exceeded`, { quotaType })
  }
}

export class RCAParsingError extends AIError {
  public readonly rawResponse: string

  constructor(rawResponse: string, reason: string) {
    super(`Failed to parse RCA response: ${reason}`, {
      rawResponseLength: rawResponse.length,
    })
    this.rawResponse = rawResponse
  }
}

/**
 * State Management Errors
 */
export class StateError extends SentinalError {
  public readonly stateGroup: string
  public readonly key: string

  constructor(
    operation: string,
    stateGroup: string,
    key: string,
    reason: string,
    context?: Record<string, unknown>
  ) {
    super(`State ${operation} failed for ${stateGroup}:${key}: ${reason}`, {
      ...context,
      stateGroup,
      key,
    })
    this.stateGroup = stateGroup
    this.key = key
  }
}

export class StateCacheError extends StateError {
  constructor(
    stateGroup: string,
    key: string,
    reason: string,
    context?: Record<string, unknown>
  ) {
    super('cache', stateGroup, key, reason, context)
  }
}

/**
 * Execution and Remediation Errors
 */
export class RemediationError extends SentinalError {
  public readonly incidentId: string
  public readonly alertType: string

  constructor(
    incidentId: string,
    alertType: string,
    reason: string,
    context?: Record<string, unknown>
  ) {
    super(`Remediation failed for ${alertType} (${incidentId}): ${reason}`, {
      ...context,
      incidentId,
      alertType,
    })
    this.incidentId = incidentId
    this.alertType = alertType
    this.recoverable = false // Remediation failures are critical
  }
}

export class RollbackError extends SentinalError {
  public readonly incidentId: string
  public readonly originalError: Error

  constructor(incidentId: string, reason: string, originalError: Error) {
    super(`Rollback failed for incident ${incidentId}: ${reason}`, {
      incidentId,
      recoverable: false,
      cause: originalError,
    })
    this.incidentId = incidentId
    this.originalError = originalError
  }
}

/**
 * Integration Errors
 */
export class IntegrationError extends SentinalError {
  public readonly service: string

  constructor(service: string, reason: string, context?: Record<string, unknown>) {
    super(`Integration error with ${service}: ${reason}`, {
      ...context,
      service,
      recoverable: true,
    })
    this.service = service
  }
}

export class PrometheusError extends IntegrationError {
  public readonly query?: string

  constructor(reason: string, query?: string) {
    super('Prometheus', reason, { query })
    this.query = query
  }
}

export class SlackError extends IntegrationError {
  public readonly channel?: string

  constructor(reason: string, channel?: string) {
    super('Slack', reason, { channel })
    this.channel = channel
  }
}

/**
 * Validation Errors
 */
export class ValidationError extends SentinalError {
  public readonly field: string
  public readonly value: unknown

  constructor(field: string, value: unknown, reason: string) {
    super(`Validation failed for ${field}: ${reason}`, {
      field,
      value,
      recoverable: true,
    })
    this.field = field
    this.value = value
  }
}

/**
 * Configuration Errors
 */
export class ConfigurationError extends SentinalError {
  public readonly configKey: string

  constructor(configKey: string, reason: string) {
    super(`Configuration error for ${configKey}: ${reason}`, {
      configKey,
      recoverable: false, // Config errors are critical
    })
    this.configKey = configKey
  }
}

/**
 * Error Helper Functions
 */

/**
 * Check if error is recoverable (can retry)
 */
export function isRecoverableError(error: unknown): boolean {
  if (error instanceof SentinalError) {
    return error.recoverable
  }
  return false
}

/**
 * Extract error context for logging
 */
export function getErrorContext(error: unknown): Record<string, unknown> {
  if (error instanceof SentinalError) {
    return {
      name: error.name,
      message: error.message,
      timestamp: error.timestamp,
      recoverable: error.recoverable,
      context: error.context,
    }
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }

  return {
    error: String(error),
  }
}

/**
 * Format error for user-facing messages
 */
export function formatUserError(error: unknown): string {
  if (error instanceof SentinalError) {
    return error.message
  }

  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

/**
 * Wrap external errors with context
 */
export function wrapError<T extends SentinalError>(
  ErrorClass: new (...args: any[]) => T,
  error: unknown,
  ...args: any[]
): T {
  const wrappedError = new ErrorClass(...args)

  if (error instanceof Error) {
    wrappedError.stack = `${wrappedError.stack}\nCaused by: ${error.stack}`
  }

  return wrappedError
}
