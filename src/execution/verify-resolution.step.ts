import type { EventConfig, Handlers } from '#/types'
import { z } from 'zod'
import { fixExecutor } from '../services/fix-executor'

/**
 * Component E: Verify Resolution (TypeScript Event Step)
 *
 * Verifies that the executed fix resolved the issue
 * Completes the incident lifecycle
 *
 * Features showcased:
 * - Event-driven verification
 * - Health check validation
 * - Incident lifecycle completion
 * - State updates
 * - Stream updates (Phase 5)
 */

const FixExecutedSchema = z.object({
  incidentId: z.string(),
  alertType: z.string(),
  executionResult: z.object({
    success: z.boolean(),
    message: z.string(),
    executedActions: z.array(z.string()),
    startTime: z.string(),
    endTime: z.string(),
    duration: z.number(),
    logs: z.array(z.string()),
  }),
  rcaResult: z.object({
    incidentId: z.string(),
    summary: z.string(),
    rootCause: z.string(),
    proposedFix: z.string(),
    riskLevel: z.enum(['low', 'medium', 'high']),
    estimatedImpact: z.string(),
  }),
  executedAt: z.string(),
})

export const config: EventConfig = {
  name: 'VerifyResolution',
  type: 'event',
  description: 'Verifies fix resolved the issue and completes incident',
  subscribes: ['fix.executed'],
  emits: [],
  input: FixExecutedSchema,
  flows: ['sentinal-sre'],
}

export const handler: Handlers['VerifyResolution'] = async (
  fixExecuted,
  { logger, state, streams }
) => {
  const { incidentId, alertType, executionResult, rcaResult } = fixExecuted

  logger.info('🔍 Verifying fix resolution', {
    incidentId,
    alertType,
  })

  try {
    // Wait a moment for system to stabilize
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Verify the fix
    const verification = await fixExecutor.verifyFix(alertType, incidentId)

    logger.info('Verification completed', {
      incidentId,
      resolved: verification.resolved,
    })

    // Store verification result
    await state.set('verification-results', incidentId, {
      incidentId,
      verifiedAt: new Date().toISOString(),
      resolved: verification.resolved,
      message: verification.message,
      verificationLogs: verification.verificationLogs,
    })

    if (verification.resolved) {
      logger.info('✅ Fix successfully resolved the incident', {
        incidentId,
      })

      // Create complete incident record
      const incident = {
        id: incidentId,
        alertType,
        status: 'resolved',
        resolvedAt: new Date().toISOString(),
        lifecycle: {
          detected: rcaResult.timestamp,
          rcaCompleted: rcaResult.timestamp,
          approved: fixExecuted.executedAt,
          executed: fixExecuted.executedAt,
          verified: new Date().toISOString(),
          resolved: new Date().toISOString(),
        },
        summary: {
          rcaSummary: rcaResult.summary,
          rootCause: rcaResult.rootCause,
          proposedFix: rcaResult.proposedFix,
          riskLevel: rcaResult.riskLevel,
        },
        execution: {
          duration: executionResult.duration,
          actions: executionResult.executedActions,
          logs: executionResult.logs,
        },
        verification: {
          resolved: verification.resolved,
          message: verification.message,
          logs: verification.verificationLogs,
        },
      }

      // Store complete incident
      await state.set('incidents', incidentId, incident)

      // Update stream with resolved status
      await streams.incident.set('incidents', incidentId, {
        id: incidentId,
        alertType,
        severity: incident.summary?.riskLevel === 'high' ? 'critical' : ('high' as any),
        status: 'resolved',
        rcaSummary: rcaResult.summary,
        proposedFix: rcaResult.proposedFix,
        riskLevel: rcaResult.riskLevel,
        approvalStatus: 'approved' as any,
        executionProgress: 100,
        executionLogs: executionResult.logs,
        timestamps: {
          detected: incident.lifecycle.detected || '',
          rcaCompleted: incident.lifecycle.rcaCompleted,
          approved: incident.lifecycle.approved,
          executed: incident.lifecycle.executed,
          verified: incident.lifecycle.verified,
          resolved: incident.lifecycle.resolved,
        },
      })

      logger.info('📊 Incident record completed and stream updated', {
        incidentId,
        status: 'resolved',
      })
    } else {
      logger.warn('⚠️ Fix did not fully resolve the issue', {
        incidentId,
        message: verification.message,
      })

      // Store partial resolution
      await state.set('incidents', incidentId, {
        id: incidentId,
        alertType,
        status: 'partially_resolved',
        resolvedAt: new Date().toISOString(),
        verificationMessage: verification.message,
      })

      logger.warn('Issue may require additional investigation', {
        incidentId,
      })
    }
  } catch (error) {
    logger.error('❌ Verification failed', {
      incidentId,
      error: error instanceof Error ? error.message : String(error),
    })

    // Store verification failure
    await state.set('verification-results', incidentId, {
      incidentId,
      verifiedAt: new Date().toISOString(),
      resolved: false,
      error: error instanceof Error ? error.message : String(error),
    })

    // Don't throw - verification failure shouldn't crash the system
  }
}
