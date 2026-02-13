/**
 * OpenTelemetry Instrumentation Entry Point
 *
 * MUST be imported FIRST before any other application code
 * This ensures all HTTP requests, Express routes, etc. are instrumented
 */

import { initializeOpenTelemetry } from './otel-config'

// Initialize OpenTelemetry
initializeOpenTelemetry()

console.log('✅ Instrumentation loaded - OpenTelemetry active')
