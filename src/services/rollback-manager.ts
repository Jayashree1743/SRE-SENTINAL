/**
 * Rollback Manager for Sentinal SRE Agent
 *
 * Provides comprehensive rollback capabilities for remediation actions:
 * - Captures "before" state before executing fixes
 * - Stores rollback procedures for each fix type
 * - Executes rollback when fixes fail or need reverting
 * - Tracks rollback history and success rates
 *
 * Safety-first approach for production SRE operations
 */

import type { State } from '#/types'
import { RollbackError, RemediationError } from '../errors/sentinal-errors'
import type { AlertType } from '../types/incidents.types'

export interface RollbackSnapshot {
  incidentId: string
  alertType: AlertType
  timestamp: string
  affectedResource: string
  beforeState: {
    metric?: string
    value?: number
    containerStatus?: string
    processState?: string
    [key: string]: any
  }
  fixApplied: string
  fixDetails: Record<string, any>
}

export interface RollbackProcedure {
  steps: string[]
  estimatedDuration: number // milliseconds
  requiresConfirmation: boolean
}

export interface RollbackResult {
  success: boolean
  incidentId: string
  rollbackTimestamp: string
  duration: number
  errors?: string[]
  verificationPassed: boolean
}

/**
 * Rollback Manager Service
 */
export class RollbackManager {
  /**
   * Create a snapshot before applying a fix
   */
  async createSnapshot(
    state: State,
    incidentId: string,
    alertType: AlertType,
    affectedResource: string,
    fixDetails: Record<string, any>
  ): Promise<RollbackSnapshot> {
    const snapshot: RollbackSnapshot = {
      incidentId,
      alertType,
      timestamp: new Date().toISOString(),
      affectedResource,
      beforeState: await this.captureCurrentState(alertType, affectedResource),
      fixApplied: this.getFixDescription(alertType),
      fixDetails,
    }

    // Store snapshot in state for rollback capability
    await state.set('rollback-snapshots', incidentId, snapshot)

    console.log(`📸 Rollback snapshot created for incident ${incidentId}`)

    return snapshot
  }

  /**
   * Execute rollback for a failed or unwanted fix
   */
  async executeRollback(
    state: State,
    incidentId: string,
    reason: string
  ): Promise<RollbackResult> {
    const startTime = Date.now()
    const errors: string[] = []
    let verificationPassed = false

    try {
      // Retrieve snapshot
      const snapshot = await state.get<RollbackSnapshot>('rollback-snapshots', incidentId)

      if (!snapshot) {
        throw new RollbackError(
          incidentId,
          'No rollback snapshot found',
          new Error('Snapshot not in state')
        )
      }

      console.log(`⏪ Starting rollback for incident ${incidentId}`)
      console.log(`   Reason: ${reason}`)
      console.log(`   Alert Type: ${snapshot.alertType}`)

      // Get rollback procedure for this alert type
      const procedure = this.getRollbackProcedure(snapshot.alertType)

      // Execute rollback steps
      for (let i = 0; i < procedure.steps.length; i++) {
        const step = procedure.steps[i]
        console.log(`   Step ${i + 1}/${procedure.steps.length}: ${step}`)

        try {
          await this.executeRollbackStep(snapshot, step)
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          errors.push(`Step ${i + 1} failed: ${errorMsg}`)
          console.error(`   ❌ Step failed: ${errorMsg}`)
        }
      }

      // Verify rollback success
      verificationPassed = await this.verifyRollback(snapshot)

      const duration = Date.now() - startTime
      const success = errors.length === 0 && verificationPassed

      const result: RollbackResult = {
        success,
        incidentId,
        rollbackTimestamp: new Date().toISOString(),
        duration,
        errors: errors.length > 0 ? errors : undefined,
        verificationPassed,
      }

      // Store rollback result
      await state.set('rollback-history', `${incidentId}-${Date.now()}`, {
        ...result,
        reason,
        snapshot,
      })

      if (success) {
        console.log(`✅ Rollback completed successfully for ${incidentId} (${duration}ms)`)
      } else {
        console.error(`❌ Rollback failed for ${incidentId}`)
        console.error(`   Errors: ${errors.join(', ')}`)
      }

      return result
    } catch (error) {
      const duration = Date.now() - startTime

      throw new RollbackError(
        incidentId,
        error instanceof Error ? error.message : String(error),
        error instanceof Error ? error : new Error(String(error))
      )
    }
  }

  /**
   * Capture current state before applying fix
   */
  private async captureCurrentState(
    alertType: AlertType,
    affectedResource: string
  ): Promise<Record<string, any>> {
    // In production, this would query actual infrastructure
    // For now, we'll capture simulated state

    const state: Record<string, any> = {
      resource: affectedResource,
      capturedAt: new Date().toISOString(),
    }

    switch (alertType) {
      case 'high_memory':
        state.memoryUsage = 'captured'
        state.runningProcesses = 'captured'
        break

      case 'container_down':
        state.containerStatus = 'captured'
        state.containerConfig = 'captured'
        break

      case 'disk_full':
        state.diskUsage = 'captured'
        state.largestFiles = 'captured'
        break

      case 'cpu_spike':
        state.cpuUsage = 'captured'
        state.processLoad = 'captured'
        break

      case 'network_latency':
        state.networkMetrics = 'captured'
        state.routingTable = 'captured'
        break
    }

    return state
  }

  /**
   * Get rollback procedure for alert type
   */
  private getRollbackProcedure(alertType: AlertType): RollbackProcedure {
    const procedures: Record<AlertType, RollbackProcedure> = {
      high_memory: {
        steps: [
          'Restore previous memory limits',
          'Restart affected processes with original config',
          'Verify memory usage returned to baseline',
        ],
        estimatedDuration: 30000, // 30 seconds
        requiresConfirmation: false,
      },

      container_down: {
        steps: [
          'Restore container to previous state',
          'Apply original container configuration',
          'Wait for health checks to pass',
        ],
        estimatedDuration: 45000, // 45 seconds
        requiresConfirmation: true, // Container operations are sensitive
      },

      disk_full: {
        steps: [
          'Restore deleted files if backed up',
          'Revert log rotation changes',
          'Verify disk space allocation',
        ],
        estimatedDuration: 60000, // 60 seconds
        requiresConfirmation: false,
      },

      cpu_spike: {
        steps: [
          'Restore CPU throttling settings',
          'Revert process priority changes',
          'Monitor CPU usage stabilization',
        ],
        estimatedDuration: 20000, // 20 seconds
        requiresConfirmation: false,
      },

      network_latency: {
        steps: [
          'Restore network configuration',
          'Revert routing table changes',
          'Verify network latency metrics',
        ],
        estimatedDuration: 40000, // 40 seconds
        requiresConfirmation: true, // Network changes can have wide impact
      },
    }

    return procedures[alertType]
  }

  /**
   * Execute a single rollback step
   */
  private async executeRollbackStep(
    snapshot: RollbackSnapshot,
    step: string
  ): Promise<void> {
    // Simulate rollback step execution
    // In production, this would execute actual infrastructure commands

    await new Promise((resolve) => setTimeout(resolve, 100)) // Simulate work

    // For demo: simulate 95% success rate
    if (Math.random() < 0.05) {
      throw new Error(`Failed to execute: ${step}`)
    }
  }

  /**
   * Verify rollback was successful
   */
  private async verifyRollback(snapshot: RollbackSnapshot): Promise<boolean> {
    // In production, this would verify infrastructure state matches snapshot
    // For demo: 90% success rate
    return Math.random() < 0.9
  }

  /**
   * Get fix description for logging
   */
  private getFixDescription(alertType: AlertType): string {
    const descriptions: Record<AlertType, string> = {
      high_memory: 'Memory limit adjustment and process restart',
      container_down: 'Container restart with health checks',
      disk_full: 'Log rotation and disk cleanup',
      cpu_spike: 'Process throttling and priority adjustment',
      network_latency: 'Network configuration optimization',
    }

    return descriptions[alertType]
  }

  /**
   * Check if rollback is available for an incident
   */
  async isRollbackAvailable(state: State, incidentId: string): Promise<boolean> {
    const snapshot = await state.get<RollbackSnapshot>('rollback-snapshots', incidentId)
    return snapshot !== null
  }

  /**
   * Get rollback history for analysis
   */
  async getRollbackHistory(state: State): Promise<any[]> {
    return await state.getGroup('rollback-history')
  }

  /**
   * Calculate rollback success rate
   */
  async getRollbackStats(state: State): Promise<{
    total: number
    successful: number
    failed: number
    successRate: number
  }> {
    const history = await this.getRollbackHistory(state)

    const successful = history.filter((r: any) => r.success).length
    const failed = history.length - successful

    return {
      total: history.length,
      successful,
      failed,
      successRate: history.length > 0 ? (successful / history.length) * 100 : 0,
    }
  }
}

// Singleton instance
export const rollbackManager = new RollbackManager()
