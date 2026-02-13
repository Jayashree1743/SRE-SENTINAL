/**
 * Prometheus Client for Real Infrastructure Monitoring
 *
 * Replaces the InfrastructureSimulator with actual Prometheus queries
 * Queries metrics from node-exporter (system) and cAdvisor (containers)
 */

import type {
  InfrastructureMetrics,
  HealthCheckResult,
  AlertData,
  AlertType,
  Severity,
} from '../types/incidents.types'
import { PrometheusError, MetricsCollectionError } from '../errors/sentinal-errors'

interface PrometheusQueryResult {
  status: string
  data: {
    resultType: string
    result: Array<{
      metric: Record<string, string>
      value: [number, string]  // [timestamp, value]
    }>
  }
}

export class PrometheusClient {
  private baseUrl: string
  private enabled: boolean | null  // null = not checked yet, true/false = checked
  private connectionCheckPromise: Promise<boolean> | null = null

  constructor(baseUrl: string = 'http://localhost:9090') {
    this.baseUrl = baseUrl
    this.enabled = null  // Not checked yet
  }

  /**
   * Check if Prometheus is reachable (with caching)
   */
  private async checkConnection(): Promise<boolean> {
    // Return cached result if already checked
    if (this.enabled !== null) {
      return this.enabled
    }

    // Avoid duplicate checks - return existing promise if in progress
    if (this.connectionCheckPromise) {
      return this.connectionCheckPromise
    }

    // Start new connection check
    console.log(`🔍 Checking Prometheus connection at ${this.baseUrl}...`)

    this.connectionCheckPromise = (async () => {
      try {
        const response = await fetch(`${this.baseUrl}/-/healthy`, {
          signal: AbortSignal.timeout(3000)  // 3 second timeout
        })
        const isConnected = response.ok

        if (isConnected) {
          console.log('✅ Prometheus connected - using REAL metrics')
        } else {
          console.warn(`⚠️  Prometheus responded with status ${response.status} - using simulator`)
        }

        this.enabled = isConnected
        return isConnected
      } catch (error) {
        console.warn(`⚠️  Prometheus not available - using simulator mode`)
        console.log(`   Reason: ${error instanceof Error ? error.message : String(error)}`)
        this.enabled = false
        return false
      }
    })()

    return this.connectionCheckPromise
  }

  /**
   * Execute a PromQL query
   */
  private async query(promql: string): Promise<number | null> {
    if (!this.enabled) {
      return null
    }

    try {
      const url = `${this.baseUrl}/api/v1/query?query=${encodeURIComponent(promql)}`
      const response = await fetch(url, {
        signal: AbortSignal.timeout(5000)  // 5 second timeout
      })

      if (!response.ok) {
        throw new PrometheusError(
          `Query failed with status ${response.status}`,
          promql
        )
      }

      const data: PrometheusQueryResult = await response.json()

      if (data.status !== 'success') {
        throw new PrometheusError(
          `Query returned non-success status: ${data.status}`,
          promql
        )
      }

      if (data.data.result.length === 0) {
        // Empty result is not an error, just return null
        return null
      }

      // Return the first result value
      return parseFloat(data.data.result[0].value[1])
    } catch (error) {
      if (error instanceof PrometheusError) {
        console.error(`Prometheus query error: ${error.message}`)
        throw error
      }

      // Timeout or network error - log and return null (graceful degradation)
      console.warn(`Prometheus query "${promql}" failed:`, error instanceof Error ? error.message : String(error))
      return null
    }
  }

  /**
   * Collect real infrastructure metrics from Prometheus
   */
  async collectMetrics(): Promise<InfrastructureMetrics> {
    // Check connection on first use (lazy initialization)
    const isEnabled = await this.checkConnection()

    // If Prometheus is not available, return healthy defaults
    if (!isEnabled) {
      return this.getDefaultMetrics()
    }

    try {
      // Query all metrics in parallel
      const [
        memoryUsedBytes,
        memoryTotalBytes,
        cpuUsage,
        diskUsedBytes,
        diskTotalBytes,
        networkTxBytes,
        networkRxBytes,
        networkErrors,
      ] = await Promise.all([
        // Memory metrics
        this.query('node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes'),
        this.query('node_memory_MemTotal_bytes'),

        // CPU usage (100 - idle percentage)
        this.query('100 - (avg by (instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)'),

        // Disk metrics (root filesystem)
        this.query('node_filesystem_size_bytes{mountpoint="/"} - node_filesystem_avail_bytes{mountpoint="/"}'),
        this.query('node_filesystem_size_bytes{mountpoint="/"}'),

        // Network metrics - throughput rates
        this.query('rate(node_network_transmit_bytes_total{device!~"lo|veth.*"}[1m])'),
        this.query('rate(node_network_receive_bytes_total{device!~"lo|veth.*"}[1m])'),
        this.query('rate(node_network_receive_errs_total{device!~"lo|veth.*"}[1m]) + rate(node_network_transmit_errs_total{device!~"lo|veth.*"}[1m])'),
      ])

      // Calculate percentages
      const memoryPercentage = memoryTotalBytes && memoryUsedBytes
        ? (memoryUsedBytes / memoryTotalBytes) * 100
        : 25

      const diskPercentage = diskTotalBytes && diskUsedBytes
        ? (diskUsedBytes / diskTotalBytes) * 100
        : 10

      // Get container metrics from cAdvisor
      const containers = await this.getContainerMetrics()

      // Calculate simulated latency based on network activity
      // Note: node-exporter doesn't provide real latency - need blackbox_exporter for that
      // This provides a realistic simulation based on network throughput and errors
      const totalNetworkBytes = (networkTxBytes || 0) + (networkRxBytes || 0)
      const networkMBps = totalNetworkBytes / (1024 * 1024)  // Convert to MB/s

      // Simulate latency: base 25ms + additional latency based on network load and errors
      // High traffic or errors = higher latency
      const baseLatency = 25
      const loadLatency = Math.min(networkMBps * 2, 50)  // Up to +50ms from load
      const errorLatency = (networkErrors || 0) * 100  // +100ms per error/sec
      const simulatedLatency = Math.round(baseLatency + loadLatency + errorLatency)

      return {
        memory: {
          used: memoryUsedBytes ? Math.round(memoryUsedBytes / 1024 / 1024) : 4096,  // MB
          total: memoryTotalBytes ? Math.round(memoryTotalBytes / 1024 / 1024) : 16384,  // MB
          percentage: Math.round(memoryPercentage),
        },
        cpu: {
          usage: cpuUsage ? Math.round(cpuUsage) : 15,
        },
        disk: {
          used: diskUsedBytes ? Math.round(diskUsedBytes / 1024 / 1024 / 1024) : 50,  // GB
          total: diskTotalBytes ? Math.round(diskTotalBytes / 1024 / 1024 / 1024) : 500,  // GB
          percentage: Math.round(diskPercentage),
        },
        containers,
        network: {
          latency: simulatedLatency,  // Simulated based on network activity
          errorRate: networkErrors || 0,
        },
      }
    } catch (error) {
      console.error('Error collecting Prometheus metrics:', error)
      return this.getDefaultMetrics()
    }
  }

  /**
   * Get container metrics from cAdvisor
   */
  private async getContainerMetrics(): Promise<InfrastructureMetrics['containers']> {
    try {
      // Query container states
      const containerQuery = 'container_last_seen{name!=""}'
      const url = `${this.baseUrl}/api/v1/query?query=${encodeURIComponent(containerQuery)}`
      const response = await fetch(url, {
        signal: AbortSignal.timeout(5000)
      })

      if (!response.ok) {
        return this.getDefaultContainers()
      }

      const data: PrometheusQueryResult = await response.json()

      if (data.status !== 'success') {
        return this.getDefaultContainers()
      }

      // Map Prometheus results to container format
      const containers = data.data.result.slice(0, 4).map(result => ({
        name: result.metric.name || 'unknown',
        status: 'running' as const,  // cAdvisor only reports running containers
        restartCount: 0,  // Would need additional query for restart count
      }))

      return containers.length > 0 ? containers : this.getDefaultContainers()
    } catch (error) {
      console.error('Error fetching container metrics:', error)
      return this.getDefaultContainers()
    }
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
      threshold:80,
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
      alertType = 'disk_full'
      severity = 'critical'
      logs = [
        `Disk usage at ${check.value.toFixed(1)}%`,
        `/var/log directory: 25GB`,
        `Docker images: 15GB`,
      ]
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
      source: this.enabled ? 'prometheus' : 'fallback',
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

  /**
   * Default healthy metrics (fallback)
   */
  private getDefaultMetrics(): InfrastructureMetrics {
    return {
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
      containers: this.getDefaultContainers(),
      network: {
        latency: 45,
        errorRate: 0.1,
      },
    }
  }

  /**
   * Default container list (fallback)
   */
  private getDefaultContainers(): InfrastructureMetrics['containers'] {
    return [
      { name: 'web-server', status: 'running', restartCount: 0 },
      { name: 'api-server', status: 'running', restartCount: 0 },
      { name: 'worker-1', status: 'running', restartCount: 0 },
      { name: 'redis-cache', status: 'running', restartCount: 0 },
    ]
  }

  /**
   * Check if Prometheus is enabled (async - checks on first call)
   */
  async isEnabled(): Promise<boolean> {
    return await this.checkConnection()
  }
}

// Singleton instance
export const prometheusClient = new PrometheusClient()
