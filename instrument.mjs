/**
 * OpenTelemetry Instrumentation Loader
 *
 * This file is loaded BEFORE the application starts using Node's --import flag.
 * It must be plain JavaScript (.mjs) because TypeScript hasn't been transpiled yet.
 */

import { NodeSDK } from '@opentelemetry/sdk-node'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { JaegerExporter } from '@opentelemetry/exporter-jaeger'
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus'
import { resourceFromAttributes } from '@opentelemetry/resources'
import {
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION
} from '@opentelemetry/semantic-conventions'

// Service identification
const resource = resourceFromAttributes({
  [SEMRESATTRS_SERVICE_NAME]: 'sentinal-sre-agent',
  [SEMRESATTRS_SERVICE_VERSION]: '1.0.0',
  'deployment.environment': process.env.NODE_ENV || 'development',
})

// Jaeger exporter for distributed tracing
const jaegerExporter = new JaegerExporter({
  endpoint: process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces',
})

// Prometheus exporter for metrics
const prometheusExporter = new PrometheusExporter(
  {
    port: parseInt(process.env.OTEL_METRICS_PORT || '9464'),
    endpoint: '/metrics',
  },
  () => {
    console.log('📊 Prometheus metrics available at http://localhost:9464/metrics')
  }
)

// Configure and start OpenTelemetry SDK
const sdk = new NodeSDK({
  resource,
  traceExporter: jaegerExporter,
  metricReader: prometheusExporter,
  instrumentations: [
    getNodeAutoInstrumentations({
      // Disable noisy instrumentations
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-dns': { enabled: false },

      // Configure HTTP instrumentation
      '@opentelemetry/instrumentation-http': {
        enabled: true,
        ignoreIncomingRequestHook: (req) => {
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

// Start the SDK
try {
  sdk.start()
  console.log('🔭 OpenTelemetry initialized')
  console.log('   → Service: sentinal-sre-agent')
  console.log('   → Traces: Jaeger at', process.env.JAEGER_ENDPOINT || 'http://localhost:14268')
  console.log('   → Metrics: Prometheus at http://localhost:9464/metrics')
} catch (error) {
  console.error('❌ Failed to initialize OpenTelemetry:', error)
}

// Graceful shutdown
process.on('SIGTERM', () => {
  sdk
    .shutdown()
    .then(() => console.log('🔭 OpenTelemetry shutdown complete'))
    .catch((error) => console.error('Error shutting down OpenTelemetry', error))
    .finally(() => process.exit(0))
})
