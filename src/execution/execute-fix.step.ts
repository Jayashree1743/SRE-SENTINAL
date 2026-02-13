import type { EventConfig, Handlers } from '#/types'
import { z } from 'zod'
import { fixExecutor } from '../services/fix-executor'
import { rollbackManager } from '../services/rollback-manager'

/**
 * Component E: Execute Fix (TypeScript Event Step)
 *
 * Executes approved fixes with retry logic and error handling
 *
 * Features showcased:
 * - Event-driven execution
 * - Retry mechanism (built-in)
 * - Error handling
 * - State updates
 * - Execution logging
 */

const FixApprovedSchema = z.object({
  incidentId: z.string(),
  approvalType: z.enum(['automatic', 'manual']),
  approvedBy: z.string(),
  approvedAt: z.string(),
  rcaResult: z.object({
    incidentId: z.string(),
    summary: z.string(),
    rootCause: z.string(),
    proposedFix: z.string(),
    riskLevel: z.enum(['low', 'medium', 'high']),
    estimatedImpact: z.string(),
    timestamp: z.string(),
    metadata: z
      .object({
        alertType: z.string(),
        severity: z.string(),
      })
      .optional(),
  }),
  notes: z.string().optional(),
})

export const config: EventConfig = {
  name: 'ExecuteFix',
  type: 'event',
  description: 'Executes approved infrastructure fixes',
  subscribes: ['fix.approved'],
  emits: ['fix.executed'],
  input: FixApprovedSchema,
  flows: ['sentinal-sre'],
  infrastructure: {
    handler: {
      retries: 3, // Retry up to 3 times on failure
    },
  },
}

export const handler: Handlers['ExecuteFix'] = async (approval, { logger, emit, state }) => {
  const { incidentId, approvedBy, rcaResult } = approval
  const alertType = rcaResult.metadata?.alertType || 'unknown'

  logger.info('🔧 Executing approved fix', {
    incidentId,
    alertType,
    approvedBy,
  })

  try {
    // Store execution start in state
    await state.set('execution-status', incidentId, {
      incidentId,
      status: 'executing',
      startedAt: new Date().toISOString(),
      alertType,
      approvedBy,
    })

    // STEP 1: Create rollback snapshot before applying fix
    logger.info('📸 Creating rollback snapshot', { incidentId })

    const snapshot = await rollbackManager.createSnapshot(
      state,
      incidentId,
      alertType as any,
      rcaResult.metadata?.alertType || 'unknown',
      {
        proposedFix: rcaResult.proposedFix,
        riskLevel: rcaResult.riskLevel,
        approvedBy,
      }
    )

    logger.info('Snapshot created', {
      incidentId,
      snapshotTimestamp: snapshot.timestamp,
    })

    // STEP 2: Execute the fix
    logger.info('Starting fix execution', {
      incidentId,
      proposedFix: rcaResult.proposedFix.substring(0, 100) + '...',
    })

    const executionResult = await fixExecutor.executeFix(
      alertType,
      rcaResult.proposedFix,
      incidentId
    )

    if (!executionResult.success) {
      logger.error('❌ Fix execution failed', {
        incidentId,
        message: executionResult.message,
      })

      // STEP 3: Attempt rollback on failure
      logger.warn('⏪ Initiating automatic rollback due to fix failure', { incidentId })

      try {
        const rollbackResult = await rollbackManager.executeRollback(
          state,
          incidentId,
          `Fix execution failed: ${executionResult.message}`
        )

        logger.info('Rollback completed', {
          incidentId,
          rollbackSuccess: rollbackResult.success,
          duration: `${rollbackResult.duration}ms`,
        })

        // Store failure in state with rollback info
        await state.set('execution-status', incidentId, {
          incidentId,
          status: 'failed_with_rollback',
          startedAt: executionResult.startTime,
          completedAt: executionResult.endTime,
          duration: executionResult.duration,
          error: executionResult.message,
          logs: executionResult.logs,
          rollback: rollbackResult,
        })
      } catch (rollbackError) {
        logger.error('❌ Rollback also failed!', {
          incidentId,
          rollbackError: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
        })

        // Store failure without rollback
        await state.set('execution-status', incidentId, {
          incidentId,
          status: 'failed_rollback_failed',
          startedAt: executionResult.startTime,
          completedAt: executionResult.endTime,
          duration: executionResult.duration,
          error: executionResult.message,
          logs: executionResult.logs,
          rollbackError: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
        })
      }

      // Store execution logs separately
      await state.set('execution-logs', incidentId, executionResult.logs)

      throw new Error(executionResult.message)
    }

    logger.info('✅ Fix executed successfully', {
      incidentId,
      duration: `${executionResult.duration}ms`,
      actions: executionResult.executedActions,
    })

    // Store execution result in state
    await state.set('execution-status', incidentId, {
      incidentId,
      status: 'completed',
      startedAt: executionResult.startTime,
      completedAt: executionResult.endTime,
      duration: executionResult.duration,
      executedActions: executionResult.executedActions,
      logs: executionResult.logs,
    })

    // Store execution logs separately
    await state.set('execution-logs', incidentId, executionResult.logs)

    // Emit fix.executed event for verification
    await emit({
      topic: 'fix.executed',
      data: {
        incidentId,
        alertType,
        executionResult,
        rcaResult,
        executedAt: new Date().toISOString(),
      },
    })

    logger.info('🚀 Fix execution event emitted', {
      incidentId,
      nextStep: 'VerifyResolution',
    })
  } catch (error) {
    logger.error('💥 Fix execution encountered error', {
      incidentId,
      error: error instanceof Error ? error.message : String(error),
    })

    // Re-throw to trigger retry mechanism
    throw error
  }
}
