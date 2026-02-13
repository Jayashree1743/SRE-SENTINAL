import type { EventConfig, Handlers } from '#/types'
import { z } from 'zod'

/**
 * Component C: Policy Engine (TypeScript Event Step)
 *
 * Safety and governance checks for proposed fixes
 * - Evaluates risk level from AI analysis
 * - Auto-approves low-risk fixes
 * - Requires human approval for medium/high-risk fixes
 * - Applies organizational policies
 *
 * Features showcased:
 * - Conditional emits
 * - Business logic in TypeScript
 * - State queries
 * - Risk-based decision making
 */

const RCAResultSchema = z.object({
  incidentId: z.string(),
  summary: z.string(),
  rootCause: z.string(),
  proposedFix: z.string(),
  riskLevel: z.enum(['low', 'medium', 'high']),
  estimatedImpact: z.string(),
  timestamp: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export const config: EventConfig = {
  name: 'PolicyEngineSafetyCheck',
  type: 'event',
  description: 'Evaluates RCA results and applies safety policies',
  subscribes: ['rca.completed'],
  emits: [
    {
      topic: 'fix.approved',
      label: 'Auto-approved (low risk)',
      conditional: true,
    },
    {
      topic: 'approval.required',
      label: 'Requires human approval',
      conditional: true,
    },
  ],
  input: RCAResultSchema,
  flows: ['sentinal-sre'],
}

export const handler: Handlers['PolicyEngineSafetyCheck'] = async (
  rcaResult,
  { logger, emit, state, streams }
) => {
  logger.info('⚖️ Policy Engine: Evaluating RCA result', {
    incidentId: rcaResult.incidentId,
    riskLevel: rcaResult.riskLevel,
  })

  try {
    const { incidentId, riskLevel, proposedFix, summary } = rcaResult

    // Load policy rules from state (can be configured dynamically)
    const policyRules = await loadPolicyRules(state)

    logger.info('Policy rules loaded', {
      autoApproveThreshold: policyRules.autoApproveThreshold,
      requireApprovalFor: policyRules.requireApprovalFor,
    })

    // Evaluate risk against policy
    const decision = evaluatePolicy(rcaResult, policyRules)

    logger.info('Policy decision made', {
      incidentId,
      decision: decision.action,
      reason: decision.reason,
    })

    // Store policy decision in state
    await state.set('policy-decisions', incidentId, {
      incidentId,
      decision: decision.action,
      reason: decision.reason,
      riskLevel,
      evaluatedAt: new Date().toISOString(),
      rcaSummary: summary,
      proposedFix,
    })

    // Conditional emit based on decision
    if (decision.action === 'auto-approve') {
      logger.info('✅ Auto-approving fix (low risk)', { incidentId })

      await emit({
        topic: 'fix.approved',
        data: {
          incidentId,
          approvalType: 'automatic',
          approvedBy: 'policy-engine',
          approvedAt: new Date().toISOString(),
          rcaResult,
        },
      })
    } else if (decision.action === 'require-approval') {
      logger.warn('⚠️ Human approval required', {
        incidentId,
        riskLevel,
        reason: decision.reason,
      })

      await emit({
        topic: 'approval.required',
        data: {
          incidentId,
          riskLevel,
          reason: decision.reason,
          rcaResult,
          requestedAt: new Date().toISOString(),
        },
      })

      // Store pending approval
      await state.set('approval-pending', incidentId, {
        incidentId,
        status: 'pending',
        requestedAt: new Date().toISOString(),
        riskLevel,
        rcaSummary: summary,
        proposedFix,
      })
    } else {
      // Rejected by policy
      logger.error('❌ Fix rejected by policy', {
        incidentId,
        reason: decision.reason,
      })

      await state.set('policy-rejections', incidentId, {
        incidentId,
        reason: decision.reason,
        rejectedAt: new Date().toISOString(),
      })
    }

    logger.info('Policy Engine: Completed successfully', { incidentId })
  } catch (error) {
    logger.error('Policy Engine: Failed', {
      incidentId: rcaResult.incidentId,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

/**
 * Load policy rules from state
 * This allows dynamic configuration of policies
 */
async function loadPolicyRules(state: any) {
  const defaultRules = {
    autoApproveThreshold: 'low',
    requireApprovalFor: ['medium', 'high'],
    rejectFor: [] as string[],
    allowedActions: ['restart', 'scale', 'clear-cache', 'update-config'],
    blockedActions: ['delete-data', 'drop-database'],
  }

  try {
    const savedRules = await state.get('policy-rules', 'default')
    return savedRules || defaultRules
  } catch {
    // If no rules in state, save and return defaults
    await state.set('policy-rules', 'default', defaultRules)
    return defaultRules
  }
}

/**
 * Evaluate RCA result against policy rules
 */
function evaluatePolicy(
  rcaResult: z.infer<typeof RCAResultSchema>,
  rules: any
): { action: 'auto-approve' | 'require-approval' | 'reject'; reason: string } {
  const { riskLevel, proposedFix, metadata } = rcaResult

  // SPECIAL CASE: Always require approval for sandbox cleanup
  // Even if LLM classifies as low risk, sandbox cleanup needs human oversight
  if (metadata?.alertType === 'sandbox_disk_full') {
    return {
      action: 'require-approval',
      reason: 'Sandbox cleanup always requires human approval for safety',
    }
  }

  // Check for blocked actions
  for (const blockedAction of rules.blockedActions) {
    if (proposedFix.toLowerCase().includes(blockedAction.toLowerCase())) {
      return {
        action: 'reject',
        reason: `Proposed fix contains blocked action: ${blockedAction}`,
      }
    }
  }

  // Check risk level
  if (riskLevel === 'low' && rules.autoApproveThreshold === 'low') {
    return {
      action: 'auto-approve',
      reason: 'Low-risk fix meets auto-approval criteria',
    }
  }

  if (rules.requireApprovalFor.includes(riskLevel)) {
    return {
      action: 'require-approval',
      reason: `Risk level '${riskLevel}' requires human approval per policy`,
    }
  }

  // Default to requiring approval for safety
  return {
    action: 'require-approval',
    reason: 'Default policy: require human approval',
  }
}
