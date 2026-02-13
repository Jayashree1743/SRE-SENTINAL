/**
 * OpenTelemetry Configuration for Sentinal SRE Agent
 *
 * Provides comprehensive observability through:
 * - Distributed tracing (Jaeger)
 * - Metrics collection (Prometheus)
 * - Automatic instrumentation
 * - Custom spans for SRE operations
 *
 * Why OpenTelemetry for Sentinal:
 * 1. Track incidents end-to-end through event pipeline
 * 2. Monitor LLM API performance and costs
 * 3. Measure rollback success rates
 * 4. Debug production issues with traces
 * 5. Meta-monitoring: Monitor the monitoring system itself!
 */

import { NodeSDK } from '@opentelemetry/sdk-node'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { JaegerExporter } from '@opentelemetry/exporter-jaeger'
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus'
import { Resource } from '@opentelemetry/resources'
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } from '@opentelemetry/semantic-conventions'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'

// Service identification
const resource = Resource.default().merge(
  new Resource({
    [SEMRESATTRS_SERVICE_NAME]: 'sentinal-sre-agent',
    [SEMRESATTRS_SERVICE_VERSION]: '1.0.0',
    'deployment.environment': process.env.NODE_ENV || 'development',
  })
)

// Jaeger exporter for distributed tracing
const jaegerExporter = new JaegerExporter({
  endpoint: process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces',
  // You can also use agent-based configuration:
  // agentHost: 'localhost',
  // agentPort: 6832,
})

// Prometheus exporter for metrics
const prometheusExporter = new PrometheusExporter({
  port: parseInt(process.env.OTEL_METRICS_PORT || '9464'),
  endpoint: '/metrics',
}, () => {
  console.log('📊 Prometheus metrics available at http://localhost:9464/metrics')
})

// Configure OpenTelemetry SDK
export const sdk = new NodeSDK({
  resource,

  // Trace exporter (Jaeger)
  traceExporter: jaegerExporter,

  // Metric reader (Prometheus)
  metricReader: prometheusExporter,

  // Automatic instrumentation for:
  // - HTTP/HTTPS requests
  // - Express.js
  // - DNS lookups
  // - File system operations
  // - And more...
  instrumentations: [
    getNodeAutoInstrumentations({
      // Disable instrumentations we don't need
      '@opentelemetry/instrumentation-fs': {
        enabled: false, // Too noisy for our use case
      },
      '@opentelemetry/instrumentation-dns': {
        enabled: false,
      },

      // Configure HTTP instrumentation
      '@opentelemetry/instrumentation-http': {
        enabled: true,
        ignoreIncomingRequestHook: (req) => {
          // Ignore health check endpoints
          return req.url?.includes('/health') || req.url?.includes('/metrics')
        },
      },

      // Configure Express instrumentation
      '@opentelemetry/instrumentation-express': {
        enabled: true,
      },
    }),
  ],
})

/**
 * Initialize OpenTelemetry
 *
 * Call this at application startup (before importing other modules)
 */
export function initializeOpenTelemetry() {
  try {
    sdk.start()
    console.log('🔭 OpenTelemetry initialized')
    console.log('   → Traces: Jaeger at', process.env.JAEGER_ENDPOINT || 'http://localhost:14268')
    console.log('   → Metrics: Prometheus at http://localhost:9464/metrics')
    console.log('   → Service: sentinal-sre-agent')

    // Graceful shutdown
    process.on('SIGTERM', () => {
      sdk
        .shutdown()
        .then(() => console.log('🔭 OpenTelemetry shutdown complete'))
        .catch((error) => console.error('Error shutting down OpenTelemetry', error))
        .finally(() => process.exit(0))
    })

    return true
  } catch (error) {
    console.error('❌ Failed to initialize OpenTelemetry:', error)
    return false
  }
}

/**
 * Get tracer instance for custom instrumentation
 */
import { trace } from '@opentelemetry/api'

export const tracer = trace.getTracer('sentinal-sre-agent', '1.0.0')

/**
 * Get meter instance for custom metrics
 */
import { metrics } from '@opentelemetry/api'

export const meter = metrics.getMeter('sentinal-sre-agent', '1.0.0')

/**
 * Custom metrics for Sentinal operations
 */
export const sentinalMetrics = {
  // Incident metrics
  incidentsDetected: meter.createCounter('sentinal.incidents.detected', {
    description: 'Total number of incidents detected',
  }),

  incidentsResolved: meter.createCounter('sentinal.incidents.resolved', {
    description: 'Total number of incidents resolved',
  }),

  incidentResolutionTime: meter.createHistogram('sentinal.incidents.resolution_time_ms', {
    description: 'Time taken to resolve incidents (ms)',
  }),

  // LLM metrics
  llmRequests: meter.createCounter('sentinal.llm.requests', {
    description: 'Total LLM API requests',
  }),

  llmLatency: meter.createHistogram('sentinal.llm.latency_ms', {
    description: 'LLM API response time (ms)',
  }),

  llmTokensUsed: meter.createCounter('sentinal.llm.tokens_used', {
    description: 'Total tokens consumed by LLM',
  }),

  llmErrors: meter.createCounter('sentinal.llm.errors', {
    description: 'LLM API errors',
  }),

  // Rollback metrics
  rollbacksTriggered: meter.createCounter('sentinal.rollback.triggered', {
    description: 'Total rollbacks triggered',
  }),

  rollbacksSuccessful: meter.createCounter('sentinal.rollback.successful', {
    description: 'Successful rollbacks',
  }),

  rollbackDuration: meter.createHistogram('sentinal.rollback.duration_ms', {
    description: 'Rollback execution time (ms)',
  }),

  // Prometheus query metrics
  prometheusQueries: meter.createCounter('sentinal.prometheus.queries', {
    description: 'Total Prometheus queries executed',
  }),

  prometheusQueryLatency: meter.createHistogram('sentinal.prometheus.query_latency_ms', {
    description: 'Prometheus query latency (ms)',
  }),

  // Approval metrics
  approvalsRequested: meter.createCounter('sentinal.approvals.requested', {
    description: 'Total approvals requested',
  }),

  approvalsGranted: meter.createCounter('sentinal.approvals.granted', {
    description: 'Total approvals granted',
  }),

  approvalsRejected: meter.createCounter('sentinal.approvals.rejected', {
    description: 'Total approvals rejected',
  }),

  approvalLatency: meter.createHistogram('sentinal.approvals.latency_ms', {
    description: 'Time from request to approval/rejection (ms)',
  }),

  // Cache metrics
  cacheHits: meter.createCounter('sentinal.cache.hits', {
    description: 'State cache hits',
  }),

  cacheMisses: meter.createCounter('sentinal.cache.misses', {
    description: 'State cache misses',
  }),
}

/**
 * Helper to create custom spans
 *
 * Usage:
 * ```typescript
 * const result = await withSpan('my-operation', async (span) => {
 *   span.setAttribute('custom.attribute', 'value')
 *   return await doWork()
 * })
 * ```
 */
export async function withSpan<T>(
  name: string,
  fn: (span: any) => Promise<T>,
  attributes?: Record<string, string | number | boolean>
): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    try {
      // Add custom attributes
      if (attributes) {
        Object.entries(attributes).forEach(([key, value]) => {
          span.setAttribute(key, value)
        })
      }

      const result = await fn(span)

      span.setStatus({ code: 1 }) // SUCCESS
      return result
    } catch (error) {
      span.setStatus({
        code: 2, // ERROR
        message: error instanceof Error ? error.message : String(error),
      })

      span.recordException(error as Error)
      throw error
    } finally {
      span.end()
    }
  })
}

/**
 * Helper to record metric with automatic error handling
 */
export function recordMetric(
  metricFn: () => void,
  errorMessage: string = 'Failed to record metric'
) {
  try {
    metricFn()
  } catch (error) {
    console.error(errorMessage, error)
  }
}
