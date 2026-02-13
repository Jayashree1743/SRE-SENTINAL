import type { ApiConfig, Handlers } from '#/types'
import { z } from 'zod'
import { coreMiddleware } from '../middlewares/core.middleware'
import { authMiddleware, requireRole, UserRole } from '../middlewares/auth.middleware'
import { slackInteractive } from '../services/slack-interactive'

/**
 * Manual Approval API - PRO Edition
 *
 * Allows manual approval/rejection of incidents via HTTP API or Slack interactive buttons
 * Supports both POST (API) and GET (Slack button clicks) methods
 *
 * Features showcased:
 * - API endpoints for human interaction
 * - Slack interactive buttons integration
 * - Real execution of approved actions (sandbox cleanup, container restart)
 * - State queries for pending approvals
 * - Event emission after approval
 */

const ApprovalRequestSchema = z.object({
  incidentId: z.string(),
  action: z.enum(['approve', 'reject']),
  approver: z.string().optional(),
  notes: z.string().optional(),
})

// Query params schema for Slack interactive buttons (GET requests)
const ApprovalQuerySchema = z.object({
  incident: z.string(),
  action: z.enum(['approve', 'reject']),
  execute: z.enum(['clear_sandbox', 'restart_container', 'both']).optional(),
  container: z.string().optional(),
  approver: z.string().optional(),
})

const ApprovalResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  incidentId: z.string(),
  action: z.string(),
})

const PendingApprovalsResponseSchema = z.object({
  pending: z.array(
    z.object({
      incidentId: z.string(),
      status: z.string(),
      requestedAt: z.string(),
      riskLevel: z.string(),
      rcaSummary: z.string(),
      proposedFix: z.string(),
    })
  ),
})

export const config: ApiConfig = {
  name: 'ManualApproval',
  type: 'api',
  description: 'Manual approval/rejection of incidents - supports POST (API) and GET (Slack buttons)',
  method: 'GET', // Changed to GET for Slack button compatibility
  middleware: [coreMiddleware, authMiddleware, requireRole(UserRole.OPERATOR)],
  path: '/manual-approval',
  queryParams: [
    { name: 'incident', description: 'Incident ID' },
    { name: 'action', description: 'Action to take (approve/reject)' },
    { name: 'execute', description: 'Action to execute (clear_sandbox/restart_container/both)' },
    { name: 'container', description: 'Container name for restart action' },
    { name: 'approver', description: 'Approver name' },
    { name: 'apiKey', description: 'API key for authentication' },
  ],
  responseSchema: {
    200: ApprovalResponseSchema,
    404: z.object({ error: z.string() }),
    400: z.object({ error: z.string() }),
  },
  emits: ['fix.approved', 'fix.rejected'],
  flows: ['sentinal-sre'],
}

// POST version for programmatic API access
export const configPost: ApiConfig = {
  name: 'ManualApprovalPost',
  type: 'api',
  description: 'Manual approval/rejection of incidents via POST (programmatic API)',
  method: 'POST',
  middleware: [coreMiddleware, authMiddleware, requireRole(UserRole.OPERATOR)],
  path: '/manual-approval',
  bodySchema: ApprovalRequestSchema,
  responseSchema: {
    200: ApprovalResponseSchema,
    404: z.object({ error: z.string() }),
    400: z.object({ error: z.string() }),
  },
  emits: ['fix.approved', 'fix.rejected'],
  flows: ['sentinal-sre'],
}

// GET handler for Slack interactive buttons
export const handler: Handlers['ManualApproval'] = async (req, { logger, emit, state }) => {
  // Parse query parameters from Slack button click
  const incidentId = req.queryParams.incident as string
  const action = req.queryParams.action as string
  const execute = req.queryParams.execute as string
  const containerName = req.queryParams.container as string
  const approver = (req.queryParams.approver as string) || 'slack-interactive'

  logger.info('🔘 Interactive approval request received', {
    incidentId,
    action,
    execute,
    containerName,
    approver,
  })

  try {
    // Check if incident has pending approval
    const pendingApproval = await state.get('approval-pending', incidentId)

    if (!pendingApproval) {
      logger.warn('No pending approval found', { incidentId })
      return {
        status: 404,
        body: {
          error: `No pending approval found for incident: ${incidentId}`,
        },
      }
    }

    if (pendingApproval.status !== 'pending') {
      logger.warn('Approval already processed', {
        incidentId,
        currentStatus: pendingApproval.status,
      })
      return {
        status: 400,
        body: {
          error: `Approval already processed with status: ${pendingApproval.status}`,
        },
      }
    }

    // Get RCA result
    const rcaResult = await state.get('rca-results', incidentId)

    if (!rcaResult) {
      logger.error('RCA result not found', { incidentId })
      return {
        status: 404,
        body: {
          error: `RCA result not found for incident: ${incidentId}`,
        },
      }
    }

    let executionResult: any = null

    // Execute action if specified (Slack interactive mode)
    if (action === 'approve' && execute) {
      // Check if clear_sandbox or both actions require admin role
      if (execute === 'clear_sandbox' || execute === 'both') {
        // Verify user has admin role
        const user = req.user as any
        if (!user || user.role !== UserRole.ADMIN) {
          logger.warn('Unauthorized: clear_sandbox action requires admin role', {
            incidentId,
            userRole: user?.role || 'unknown',
          })
          return {
            status: 403,
            body: {
              error: 'Unauthorized: clear_sandbox action requires admin role',
            },
          }
        }
      }

      logger.info(`🎯 Executing real action: ${execute}`, { incidentId, containerName })

      executionResult = await slackInteractive.executeAction({
        incidentId,
        action: execute,
        containerName,
        userId: approver,
        timestamp: new Date().toISOString(),
      })

      logger.info('Execution result', {
        incidentId,
        success: executionResult.success,
        message: executionResult.message,
      })

      // Send result notification to Slack
      await slackInteractive.sendActionResult(
        incidentId,
        execute,
        executionResult.success,
        executionResult.message,
        executionResult.logs
      )
    }

    // Update approval state
    await state.set('approval-pending', incidentId, {
      ...pendingApproval,
      status: action === 'approve' ? 'approved' : 'rejected',
      approver,
      approvedAt: new Date().toISOString(),
      executionResult,
      actionType: execute || 'none',
    })

    logger.info(`Incident ${action}d`, {
      incidentId,
      approver,
    })

    // Emit appropriate event
    if (action === 'approve') {
      await emit({
        topic: 'fix.approved',
        data: {
          incidentId,
          approvalType: 'interactive',
          approvedBy: approver,
          approvedAt: new Date().toISOString(),
          rcaResult,
          executionResult,
          actionType: execute || 'none',
        },
      })

      logger.info('✅ Fix approved - event emitted', { incidentId })
    } else {
      await emit({
        topic: 'fix.rejected',
        data: {
          incidentId,
          rejectedBy: approver,
          rejectedAt: new Date().toISOString(),
          reason: 'Rejected via Slack interactive button',
        },
      })

      logger.info('❌ Fix rejected - event emitted', { incidentId })
    }

    return {
      status: 200,
      body: {
        success: true,
        message: executionResult
          ? executionResult.message
          : `Incident ${action}d successfully`,
        incidentId,
        action,
      },
    }
  } catch (error) {
    logger.error('Manual approval failed', {
      incidentId,
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      status: 400,
      body: {
        error: 'Failed to process approval',
      },
    }
  }
}

// POST handler for programmatic API access (backward compatibility)
export const handlerPost: Handlers['ManualApprovalPost'] = async (req, { logger, emit, state }) => {
  const { incidentId, action, approver, notes } = req.body

  logger.info('Manual approval request received (POST)', {
    incidentId,
    action,
    approver: approver || 'anonymous',
  })

  try {
    // Check if incident has pending approval
    const pendingApproval = await state.get('approval-pending', incidentId)

    if (!pendingApproval) {
      logger.warn('No pending approval found', { incidentId })
      return {
        status: 404,
        body: {
          error: `No pending approval found for incident: ${incidentId}`,
        },
      }
    }

    if (pendingApproval.status !== 'pending') {
      logger.warn('Approval already processed', {
        incidentId,
        currentStatus: pendingApproval.status,
      })
      return {
        status: 400,
        body: {
          error: `Approval already processed with status: ${pendingApproval.status}`,
        },
      }
    }

    // Get RCA result
    const rcaResult = await state.get('rca-results', incidentId)

    if (!rcaResult) {
      logger.error('RCA result not found', { incidentId })
      return {
        status: 404,
        body: {
          error: `RCA result not found for incident: ${incidentId}`,
        },
      }
    }

    // Update approval state
    await state.set('approval-pending', incidentId, {
      ...pendingApproval,
      status: action === 'approve' ? 'approved' : 'rejected',
      approver: approver || 'manual-api',
      approvedAt: new Date().toISOString(),
      notes,
    })

    logger.info(`Incident ${action}d`, {
      incidentId,
      approver: approver || 'manual-api',
    })

    // Emit appropriate event
    if (action === 'approve') {
      await emit({
        topic: 'fix.approved',
        data: {
          incidentId,
          approvalType: 'manual',
          approvedBy: approver || 'manual-api',
          approvedAt: new Date().toISOString(),
          rcaResult,
          notes,
        },
      })

      logger.info('✅ Fix approved - event emitted', { incidentId })
    } else {
      await emit({
        topic: 'fix.rejected',
        data: {
          incidentId,
          rejectedBy: approver || 'manual-api',
          rejectedAt: new Date().toISOString(),
          reason: notes || 'Manual rejection via API',
        },
      })

      logger.info('❌ Fix rejected - event emitted', { incidentId })
    }

    return {
      status: 200,
      body: {
        success: true,
        message: `Incident ${action}d successfully`,
        incidentId,
        action,
      },
    }
  } catch (error) {
    logger.error('Manual approval failed', {
      incidentId,
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      status: 400,
      body: {
        error: 'Failed to process approval',
      },
    }
  }
}

// Additional endpoint to list pending approvals
export const listPendingConfig: ApiConfig = {
  name: 'ListPendingApprovals',
  type: 'api',
  description: 'List all pending approvals (requires VIEWER role)',
  method: 'GET',
  path: '/approvals/pending',
  middleware: [coreMiddleware, authMiddleware, requireRole(UserRole.VIEWER)],
  emits: [],
  responseSchema: {
    200: PendingApprovalsResponseSchema,
  },
  flows: ['sentinal-sre'],
}

export const listPendingHandler: Handlers['ListPendingApprovals'] = async (
  req,
  { logger, state }
) => {
  logger.info('Listing pending approvals')

  try {
    const pendingApprovalsGroup = await state.getGroup('approval-pending')

    const pending = Object.values(pendingApprovalsGroup)
      .filter((approval: any) => approval.status === 'pending')
      .map((approval: any) => ({
        incidentId: approval.incidentId,
        status: approval.status,
        requestedAt: approval.requestedAt,
        riskLevel: approval.riskLevel,
        rcaSummary: approval.rcaSummary,
        proposedFix: approval.proposedFix,
      }))

    logger.info('Pending approvals retrieved', { count: pending.length })

    return {
      status: 200,
      body: {
        pending,
      },
    }
  } catch (error) {
    logger.error('Failed to list pending approvals', {
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      status: 200,
      body: {
        pending: [],
      },
    }
  }
}
