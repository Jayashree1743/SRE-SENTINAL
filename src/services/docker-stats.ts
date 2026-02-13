/**
 * Docker Stats Service - Real Container Metrics
 *
 * Gets REAL container statistics from Docker daemon
 * Used for intelligent decision-making in Slack notifications
 */

import { execSync } from 'child_process'

export interface ContainerStats {
  name: string
  id: string
  cpuPercentage: number
  memoryUsage: string
  memoryPercentage: number
  memoryLimit: string
  netIO: string
  blockIO: string
  pids: number
  status: 'running' | 'stopped' | 'crashed'
}

export interface DockerStatsResult {
  containers: ContainerStats[]
  totalContainers: number
  runningContainers: number
  highMemoryContainers: ContainerStats[]
  recommendations: string[]
}

export class DockerStatsService {
  /**
   * Get real-time container statistics from Docker
   */
  async getContainerStats(): Promise<DockerStatsResult> {
    try {
      // Get container stats using docker stats --no-stream
      const statsOutput = execSync(
        'docker stats --no-stream --format "{{.Container}}|{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}|{{.NetIO}}|{{.BlockIO}}|{{.PIDs}}"',
        { encoding: 'utf-8', timeout: 5000 }
      ).trim()

      if (!statsOutput) {
        return this.getEmptyResult()
      }

      const containers: ContainerStats[] = []
      const lines = statsOutput.split('\n')

      for (const line of lines) {
        const [id, name, cpu, memUsage, memPerc, netIO, blockIO, pids] = line.split('|')

        // Parse CPU percentage
        const cpuPercentage = parseFloat(cpu.replace('%', '')) || 0

        // Parse memory percentage
        const memoryPercentage = parseFloat(memPerc.replace('%', '')) || 0

        // Extract memory usage and limit
        const memParts = memUsage.split('/')
        const memUsageStr = memParts[0]?.trim() || '0MiB'
        const memLimitStr = memParts[1]?.trim() || '0MiB'

        containers.push({
          name: name.trim(),
          id: id.trim().substring(0, 12),
          cpuPercentage,
          memoryUsage: memUsageStr,
          memoryPercentage,
          memoryLimit: memLimitStr,
          netIO: netIO.trim(),
          blockIO: blockIO.trim(),
          pids: parseInt(pids) || 0,
          status: 'running',
        })
      }

      // Identify high memory containers (>70%)
      const highMemoryContainers = containers.filter((c) => c.memoryPercentage > 70)

      // Generate recommendations
      const recommendations = this.generateRecommendations(containers, highMemoryContainers)

      return {
        containers,
        totalContainers: containers.length,
        runningContainers: containers.length,
        highMemoryContainers,
        recommendations,
      }
    } catch (error) {
      console.error('Failed to get Docker stats:', error)
      return this.getEmptyResult()
    }
  }

  /**
   * Get stats for a specific container
   */
  async getContainerStatsById(containerId: string): Promise<ContainerStats | null> {
    const result = await this.getContainerStats()
    return result.containers.find((c) => c.id === containerId || c.name === containerId) || null
  }

  /**
   * Restart a specific container (REAL EXECUTION)
   */
  async restartContainer(containerName: string): Promise<{
    success: boolean
    message: string
    logs: string[]
  }> {
    const logs: string[] = []

    try {
      logs.push(`🔄 Restarting container: ${containerName}`)

      // Get container stats before restart
      const statsBefore = await this.getContainerStatsById(containerName)
      if (statsBefore) {
        logs.push(`   Memory before: ${statsBefore.memoryUsage} (${statsBefore.memoryPercentage.toFixed(1)}%)`)
        logs.push(`   CPU before: ${statsBefore.cpuPercentage.toFixed(1)}%`)
      }

      // Execute real Docker restart command
      const output = execSync(`docker restart ${containerName}`, {
        encoding: 'utf-8',
        timeout: 30000,
      }).trim()

      logs.push(`✅ Container restarted successfully: ${output || containerName}`)

      // Wait a moment for container to stabilize
      await this.sleep(2000)

      // Get stats after restart
      const statsAfter = await this.getContainerStatsById(containerName)
      if (statsAfter) {
        logs.push(`   Memory after: ${statsAfter.memoryUsage} (${statsAfter.memoryPercentage.toFixed(1)}%)`)
        logs.push(`   CPU after: ${statsAfter.cpuPercentage.toFixed(1)}%`)
      }

      return {
        success: true,
        message: `Successfully restarted container ${containerName}`,
        logs,
      }
    } catch (error) {
      logs.push(`❌ Failed to restart container: ${error instanceof Error ? error.message : String(error)}`)

      return {
        success: false,
        message: `Failed to restart container ${containerName}`,
        logs,
      }
    }
  }

  /**
   * Get list of all container names (for dropdown)
   */
  async getContainerNames(): Promise<string[]> {
    try {
      const output = execSync('docker ps --format "{{.Names}}"', {
        encoding: 'utf-8',
        timeout: 5000,
      }).trim()

      return output.split('\n').filter((name) => name.trim().length > 0)
    } catch (error) {
      console.error('Failed to get container names:', error)
      return []
    }
  }

  /**
   * Generate intelligent recommendations based on stats
   */
  private generateRecommendations(
    containers: ContainerStats[],
    highMemoryContainers: ContainerStats[]
  ): string[] {
    const recommendations: string[] = []

    if (highMemoryContainers.length > 0) {
      recommendations.push(`⚠️ ${highMemoryContainers.length} container(s) using >70% memory`)

      // Recommend specific containers to restart
      const topMemoryContainer = highMemoryContainers.sort(
        (a, b) => b.memoryPercentage - a.memoryPercentage
      )[0]

      recommendations.push(
        `🎯 Consider restarting: ${topMemoryContainer.name} (${topMemoryContainer.memoryPercentage.toFixed(1)}% memory)`
      )
    }

    if (containers.length > 5) {
      recommendations.push('💡 Multiple containers running - consider scaling down')
    }

    if (containers.some((c) => c.cpuPercentage > 80)) {
      const highCPU = containers.filter((c) => c.cpuPercentage > 80)
      recommendations.push(`🔥 ${highCPU.length} container(s) using >80% CPU`)
    }

    if (recommendations.length === 0) {
      recommendations.push('✅ All containers operating normally')
    }

    return recommendations
  }

  /**
   * Get empty result (fallback)
   */
  private getEmptyResult(): DockerStatsResult {
    return {
      containers: [],
      totalContainers: 0,
      runningContainers: 0,
      highMemoryContainers: [],
      recommendations: ['⚠️ Unable to fetch container stats'],
    }
  }

  /**
   * Helper: Sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Format container stats for display
   */
  formatStatsForSlack(stats: DockerStatsResult): string {
    if (stats.containers.length === 0) {
      return '⚠️ No containers found or unable to fetch stats'
    }

    const lines: string[] = []

    lines.push('*Container Stats:*')
    lines.push(`Running: ${stats.runningContainers}/${stats.totalContainers}`)
    lines.push('')

    // Show top 5 containers by memory
    const topContainers = stats.containers
      .sort((a, b) => b.memoryPercentage - a.memoryPercentage)
      .slice(0, 5)

    for (const container of topContainers) {
      const emoji = container.memoryPercentage > 70 ? '🔴' : container.memoryPercentage > 50 ? '🟡' : '🟢'
      lines.push(
        `${emoji} *${container.name}*: ${container.memoryUsage} (${container.memoryPercentage.toFixed(1)}%) | CPU: ${container.cpuPercentage.toFixed(1)}%`
      )
    }

    lines.push('')
    lines.push('*Recommendations:*')
    for (const rec of stats.recommendations) {
      lines.push(rec)
    }

    return lines.join('\n')
  }
}

// Export singleton
export const dockerStatsService = new DockerStatsService()
