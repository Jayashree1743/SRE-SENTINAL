import type {
  InfrastructureMetrics,
  HealthCheckResult,
  AlertData,
  AlertType,
  Severity,
} from '../types/incidents.types'

/**
 * Infrastructure Simulator - Simulates Docker/K8s infrastructure for demo purposes
 * This avoids the complexity of setting up real infrastructure while demonstrating Sentinal's capabilities
 */
export class InfrastructureSimulator {
  private scenarioActive: AlertType | null = null
  private scenarioStartTime: number = 0

  /**
   * Collect simulated infrastructure metrics
   */
  collectMetrics(): InfrastructureMetrics {
    const now = Date.now()

    // Base healthy metrics
    let metrics: InfrastructureMetrics = {
      memory: {
        used: 4096,
        total: 16384,
        percentage: 25,
      },
      cpu: {
        usage: 15,
      },
      disk: {
        used: 50,
        total: 500,
        percentage: 10,
      },
      containers: [
        { name: 'web-server', status: 'running', restartCount: 0 },
        { name: 'api-server', status: 'running', restartCount: 0 },
        { name: 'worker-1', status: 'running', restartCount: 0 },
        { name: 'redis-cache', status: 'running', restartCount: 0 },
      ],
      network: {
        latency: 45,
        errorRate: 0.1,
      },
    }

    // Apply active scenario if any
    if (this.scenarioActive) {
      metrics = this.applyScenario(metrics, this.scenarioActive)
    }

    return metrics
  }

  /**
   * Perform health checks on infrastructure
   */
  performHealthChecks(metrics: InfrastructureMetrics): HealthCheckResult[] {
    const timestamp = new Date().toISOString()
    const results: HealthCheckResult[] = []

    // Memory check - triggers at 60% or higher
    results.push({
      resource: 'system-memory',
      status: metrics.memory.percentage >= 60 ? 'unhealthy' : 'healthy',
      metric: 'memory_usage_percent',
      value: metrics.memory.percentage,
      threshold: 80,
      timestamp,
    })

    // CPU check - triggers at 80% or higher
    results.push({
      resource: 'system-cpu',
      status: metrics.cpu.usage >= 80 ? 'unhealthy' : 'healthy',
      metric: 'cpu_usage_percent',
      value: metrics.cpu.usage,
      threshold: 80,
      timestamp,
    })

    // Disk check - triggers at 95% or higher
    results.push({
      resource: 'system-disk',
      status: metrics.disk.percentage >= 95 ? 'unhealthy' : 'healthy',
      metric: 'disk_usage_percent',
      value: metrics.disk.percentage,
      threshold: 95,
      timestamp,
    })

    // Container checks
    for (const container of metrics.containers) {
      results.push({
        resource: `container-${container.name}`,
        status: container.status === 'running' ? 'healthy' : 'unhealthy',
        metric: 'container_status',
        value: container.status === 'running' ? 1 : 0,
        threshold: 1,
        timestamp,
      })
    }

    // Network latency check
    results.push({
      resource: 'network',
      status: metrics.network.latency > 200 ? 'unhealthy' : 'healthy',
      metric: 'network_latency_ms',
      value: metrics.network.latency,
      threshold: 200,
      timestamp,
    })

    return results
  }

  /**
   * Detect alerts from health check results
   */
  detectAlerts(healthChecks: HealthCheckResult[]): AlertData[] {
    const alerts: AlertData[] = []
    const timestamp = new Date().toISOString()

    for (const check of healthChecks) {
      if (check.status === 'unhealthy') {
        const alert = this.createAlert(check, timestamp)
        if (alert) {
          alerts.push(alert)
        }
      }
    }

    return alerts
  }

  /**
   * Trigger a specific scenario for demo purposes
   */
  triggerScenario(scenario: AlertType): void {
    this.scenarioActive = scenario
    this.scenarioStartTime = Date.now()
  }

  /**
   * Clear active scenario (simulate fix)
   */
  clearScenario(): void {
    this.scenarioActive = null
    this.scenarioStartTime = 0
  }

  /**
   * Get active scenario
   */
  getActiveScenario(): AlertType | null {
    return this.scenarioActive
  }

  /**
   * Apply scenario effects to metrics
   */
  private applyScenario(
    metrics: InfrastructureMetrics,
    scenario: AlertType
  ): InfrastructureMetrics {
    const modifiedMetrics = { ...metrics }

    switch (scenario) {
      case 'high_memory':
        modifiedMetrics.memory = {
          used: 13107,
          total: 16384,
          percentage: 80,
        }
        break

      case 'container_down':
        modifiedMetrics.containers = modifiedMetrics.containers.map((c) =>
          c.name === 'api-server'
            ? { ...c, status: 'crashed' as const, restartCount: 3 }
            : c
        )
        break

      case 'disk_full':
        modifiedMetrics.disk = {
          used: 480,
          total: 500,
          percentage: 96, // Exceeds 95% threshold
        }
        break

      case 'network_latency':
        modifiedMetrics.network = {
          latency: 350,
          errorRate: 5.2,
        }
        break

      case 'cpu_spike':
        modifiedMetrics.cpu = {
          usage: 95,
        }
        break

      case 'sandbox_disk_full':
        // Sandbox scenario - triggers real cleanup execution
        modifiedMetrics.disk = {
          used: 110,
          total: 100, // Threshold is 100MB
          percentage: 110,
        }
        break
    }

    return modifiedMetrics
  }

  /**
   * Create alert from health check result
   */
  private createAlert(
    check: HealthCheckResult,
    timestamp: string
  ): AlertData | null {
    let alertType: AlertType
    let severity: Severity
    let logs: string[] = []

    // Determine alert type and severity based on metric
    if (check.metric === 'memory_usage_percent') {
      alertType = 'high_memory'
      severity = check.value > 92 ? 'critical' : 'high'
      logs = [
        `Memory usage at ${check.value.toFixed(1)}%`,
        `Top process: node (3.2GB)`,
        `Available memory: ${((100 - check.value) * 163.84).toFixed(0)}MB`,
      ]
    } else if (check.metric === 'cpu_usage_percent') {
      alertType = 'cpu_spike'
      severity = 'high'
      logs = [
        `CPU usage at ${check.value.toFixed(1)}%`,
        `High load on core 0: 98%`,
        `Process causing spike: worker-process`,
      ]
    } else if (check.metric === 'disk_usage_percent') {
      // Check if this is sandbox-related
      if (check.resource === 'sandbox-disk') {
        alertType = 'sandbox_disk_full'
        severity = 'high'
        logs = [
          `Sandbox disk usage at ${check.value.toFixed(1)}MB`,
          `Threshold: 100MB`,
          `Files can be safely cleaned: logs/, temp/, cache/`,
        ]
      } else {
        alertType = 'disk_full'
        severity = 'critical'
        logs = [
          `Disk usage at ${check.value.toFixed(1)}%`,
          `/var/log directory: 25GB`,
          `Docker images: 15GB`,
        ]
      }
    } else if (check.metric === 'container_status') {
      alertType = 'container_down'
      severity = 'critical'
      logs = [
        `Container ${check.resource} is not running`,
        `Exit code: 137 (OOMKilled)`,
        `Last restart: ${new Date(Date.now() - 60000).toISOString()}`,
      ]
    } else if (check.metric === 'network_latency_ms') {
      alertType = 'network_latency'
      severity = 'medium'
      logs = [
        `Network latency at ${check.value.toFixed(0)}ms`,
        `Packet loss: 2.3%`,
        `Route: internal-lb → api-server`,
      ]
    } else {
      return null
    }

    // Build metadata object with alert-specific details
    const metadata: Record<string, any> = {
      healthCheck: check,
      alertType, // Include for easy access
    }

    // Add disk usage percentage for disk alerts (used by interactive Slack)
    if (check.metric === 'disk_usage_percent') {
      metadata.diskUsagePercent = check.value
    }

    return {
      id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      alertType,
      severity,
      timestamp,
      metric: check.metric,
      currentValue: check.value,
      threshold: check.threshold,
      affectedResource: check.resource,
      logs,
      metadata,
    }
  }
}

// Singleton instance for use across the application
export const infrastructureSimulator = new InfrastructureSimulator()
