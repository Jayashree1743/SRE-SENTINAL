import type { CronConfig, Handlers } from '#/types'
import { infrastructureSimulator } from '../services/infrastructure-simulator'
import { prometheusClient } from '../services/prometheus-client'
import { sandboxMonitor } from '../services/sandbox-monitor'

/**
 * Component A: The Watchdog (Cron Step)
 *
 * Scheduled monitoring of infrastructure health
 * - Runs every 2 minutes (for hackathon demo)
 * - Collects REAL infrastructure metrics from Prometheus (falls back to simulator)
 * - Performs health checks
 * - Detects anomalies and emits alerts
 * - Stores monitoring history in state
 *
 * Features showcased:
 * - Cron scheduling
 * - State management
 * - Event emission
 * - Flows organization
 * - Real-world Prometheus integration
 */
export const config: CronConfig = {
  name: 'InfrastructureMonitor',
  type: 'cron',
  description: 'Monitors infrastructure health and emits alerts',
  cron: '*/2 * * * *', // Every 2 minutes for demo (use '*/5 * * * *' for every 5 min)
  emits: ['alert.detected'],
  flows: ['sentinal-sre'],
}

export const handler: Handlers['InfrastructureMonitor'] = async ({
  logger,
  emit,
  traceId,
  state,
  streams,
}) => {
  logger.info('Infrastructure Monitor: Starting scheduled health check', { traceId })

  try {
    // Choose monitoring source: Prometheus (real) or Simulator (demo)
    const isPrometheusEnabled = await prometheusClient.isEnabled()
    const monitoringSource = isPrometheusEnabled ? prometheusClient : infrastructureSimulator

    logger.info('Monitoring source', {
      source: isPrometheusEnabled ? 'Prometheus (REAL)' : 'Simulator (DEMO)',
      prometheusEnabled: isPrometheusEnabled,
    })

    // Step 1: Collect infrastructure metrics
    const metrics = await monitoringSource.collectMetrics()
    logger.info('Metrics collected', {
      source: isPrometheusEnabled ? 'prometheus' : 'simulator',
      memory: `${metrics.memory.percentage}%`,
      cpu: `${metrics.cpu.usage}%`,
      disk: `${metrics.disk.percentage}%`,
      containers: metrics.containers.length,
    })

    // Step 2: Perform health checks
    const healthChecks = monitoringSource.performHealthChecks(metrics)
    const unhealthyChecks = healthChecks.filter((check) => check.status === 'unhealthy')

    logger.info('Health checks completed', {
      total: healthChecks.length,
      unhealthy: unhealthyChecks.length,
    })

    // Step 3: Detect alerts from unhealthy checks
    const alerts = monitoringSource.detectAlerts(healthChecks)

    if (alerts.length > 0) {
      logger.warn('Alerts detected!', {
        count: alerts.length,
        types: alerts.map((a) => a.alertType),
      })

      // Step 4: Store alerts in state for history tracking
      for (const alert of alerts) {
        await state.set('alerts', alert.id, alert)
        logger.info('Alert stored in state', {
          alertId: alert.id,
          type: alert.alertType,
          severity: alert.severity,
        })

        // Step 4b: Create incident in stream for real-time tracking
        await streams.incident.set('incidents', alert.id, {
          id: alert.id,
          alertType: alert.alertType,
          severity: alert.severity,
          status: 'detected',
          timestamps: {
            detected: alert.timestamp,
          },
          metadata: {
            metric: alert.metric,
            currentValue: alert.currentValue,
            threshold: alert.threshold,
          },
        })

        logger.info('Incident created in stream', {
          alertId: alert.id,
          status: 'detected',
        })

        // Step 5: Emit alert event to trigger RCA pipeline
        await emit({
          topic: 'alert.detected',
          data: alert,
        })

        logger.info('Alert event emitted', {
          alertId: alert.id,
          topic: 'alert.detected',
        })
      }
    } else {
      logger.info('No alerts detected - all systems healthy')
    }

    // Step 6: Check sandbox disk usage (real monitoring)
    try {
      const sandboxMetrics = await sandboxMonitor.collectMetrics()
      logger.info('Sandbox metrics collected', {
        sizeMB: sandboxMetrics.totalSizeMB,
        percentage: sandboxMetrics.percentage,
        thresholdMB: sandboxMonitor.getThresholdMB(),
      })

      // Check if sandbox exceeds threshold
      if (sandboxMetrics.totalSizeMB >= sandboxMonitor.getThresholdMB()) {
        logger.warn('Sandbox disk threshold exceeded!', {
          currentMB: sandboxMetrics.totalSizeMB,
          thresholdMB: sandboxMonitor.getThresholdMB(),
        })

        // Create sandbox alert
        const sandboxAlert = {
          id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          alertType: 'sandbox_disk_full' as const,
          severity: 'high' as const,
          timestamp: new Date().toISOString(),
          metric: 'sandbox_disk_usage_mb',
          currentValue: sandboxMetrics.totalSizeMB,
          threshold: sandboxMonitor.getThresholdMB(),
          affectedResource: 'sandbox-disk',
          logs: [
            `Sandbox disk usage at ${sandboxMetrics.totalSizeMB}MB`,
            `Threshold: ${sandboxMonitor.getThresholdMB()}MB`,
            `Files can be safely cleaned: logs/, temp/, cache/`,
          ],
          metadata: {
            sandboxPath: sandboxMonitor.getSandboxPath(),
            files: sandboxMetrics.files,
            alertType: 'sandbox_disk_full',
          },
        }

        // Store sandbox alert
        await state.set('alerts', sandboxAlert.id, sandboxAlert)
        logger.info('Sandbox alert stored in state', {
          alertId: sandboxAlert.id,
          type: sandboxAlert.alertType,
          severity: sandboxAlert.severity,
        })

        // Create incident in stream
        await streams.incident.set('incidents', sandboxAlert.id, {
          id: sandboxAlert.id,
          alertType: sandboxAlert.alertType,
          severity: sandboxAlert.severity,
          status: 'detected',
          timestamps: {
            detected: sandboxAlert.timestamp,
          },
          metadata: {
            metric: sandboxAlert.metric,
            currentValue: sandboxAlert.currentValue,
            threshold: sandboxAlert.threshold,
          },
        })

        logger.info('Sandbox incident created in stream', {
          alertId: sandboxAlert.id,
          status: 'detected',
        })

        // Emit sandbox alert event
        await emit({
          topic: 'alert.detected',
          data: sandboxAlert,
        })

        logger.info('Sandbox alert event emitted', {
          alertId: sandboxAlert.id,
          topic: 'alert.detected',
        })
      } else {
        logger.info('Sandbox disk usage is healthy', {
          currentMB: sandboxMetrics.totalSizeMB,
          thresholdMB: sandboxMonitor.getThresholdMB(),
        })
      }
    } catch (sandboxError) {
      logger.warn('Failed to check sandbox metrics', {
        error: sandboxError instanceof Error ? sandboxError.message : String(sandboxError),
      })
      // Don't fail the whole monitoring cycle if sandbox check fails
    }

    // Step 7: Store monitoring summary in state
    const monitoringSummary = {
      timestamp: new Date().toISOString(),
      traceId,
      totalChecks: healthChecks.length,
      unhealthyChecks: unhealthyChecks.length,
      alertsGenerated: alerts.length,
      monitoringSource: isPrometheusEnabled ? 'prometheus' : 'simulator',
      activeScenario: !isPrometheusEnabled ? infrastructureSimulator.getActiveScenario() : null,
    }

    await state.set('monitoring-history', `check-${Date.now()}`, monitoringSummary)

    logger.info('Infrastructure Monitor: Completed successfully', {
      alertsEmitted: alerts.length,
      traceId,
    })
  } catch (error) {
    logger.error('Infrastructure Monitor: Failed', {
      error: error instanceof Error ? error.message : String(error),
      traceId,
    })
    // Don't throw - let the cron continue running
  }
}
