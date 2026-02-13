import type { ApiConfig, Handlers } from '#/types'
import { z } from 'zod'

/**
 * List Pending Approvals API
 *
 * Query all incidents awaiting approval
 *
 * Features showcased:
 * - GET endpoint
 * - State group queries
 * - Data aggregation
 */

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
  count: z.number(),
})

export const config: ApiConfig = {
  name: 'ListPendingApprovals',
  type: 'api',
  description: 'List all pending approvals',
  method: 'GET',
  path: '/approvals/pending',
  emits: [],
  responseSchema: {
    200: PendingApprovalsResponseSchema,
  },
  flows: ['sentinal-sre'],
}

export const handler: Handlers['ListPendingApprovals'] = async (req, { logger, state }) => {
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
        rcaSummary: approval.rcaSummary || 'N/A',
        proposedFix: approval.proposedFix || 'N/A',
      }))
      .sort(
        (a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime()
      )

    logger.info('Pending approvals retrieved', { count: pending.length })

    return {
      status: 200,
      body: {
        pending,
        count: pending.length,
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
        count: 0,
      },
    }
  }
}
