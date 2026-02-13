import type { EventConfig, Handlers } from '#/types'
import { z } from 'zod'
import { getSlackClient } from '../services/slack-client'
import { slackInteractive } from '../services/slack-interactive'
import { prometheusClient } from '../services/prometheus-client'

/**
 * Component D: Slack Notification - PRO Edition (Event Step)
 *
 * Sends approval requests to Slack when human review is needed
 * Uses interactive notifications with real container stats for disk alerts
 *
 * Features showcased:
 * - Event-driven notifications
 * - Interactive Slack buttons with real execution
 * - Real Docker container stats integration
 * - Conditional notification types based on alert severity
 * - External API integration (Slack)
 * - Error handling for third-party services
 */

const ApprovalRequiredSchema = z.object({
  incidentId: z.string(),
  riskLevel: z.enum(['low', 'medium', 'high']),
  reason: z.string(),
  rcaResult: z.object({
    incidentId: z.string(),
    summary: z.string(),
    rootCause: z.string(),
    proposedFix: z.string(),
    riskLevel: z.enum(['low', 'medium', 'high']),
    estimatedImpact: z.string(),
    timestamp: z.string(),
  }),
  requestedAt: z.string(),
})

export const config: EventConfig = {
  name: 'SendSlackNotification',
  type: 'event',
  description: 'Sends approval request to Slack',
  subscribes: ['approval.required'],
  emits: [],
  input: ApprovalRequiredSchema,
  flows: ['sentinal-sre'],
}

export const handler: Handlers['SendSlackNotification'] = async (
  approvalRequest,
  { logger, state }
) => {
  logger.info('📨 Sending Slack notification', {
    incidentId: approvalRequest.incidentId,
    riskLevel: approvalRequest.riskLevel,
  })

  try {
    const { incidentId, rcaResult } = approvalRequest

    // Check if Slack is configured
    if (!process.env.SLACK_WEBHOOK_URL) {
      logger.warn('Slack webhook URL not configured, skipping notification', {
        incidentId,
      })

      // Store notification skip record
      await state.set('slack-notifications', incidentId, {
        incidentId,
        status: 'skipped',
        reason: 'Slack not configured',
        timestamp: new Date().toISOString(),
      })

      return
    }

    // Extract alert type and resource metrics from RCA metadata
    const alertType = rcaResult.metadata?.alertType as string | undefined
    const diskUsagePercent = rcaResult.metadata?.diskUsagePercent as number | undefined

    logger.info('Alert details', {
      incidentId,
      alertType,
      diskUsagePercent,
    })

    // 🎯 PRO FEATURE: Use interactive Slack notification for disk and memory alerts
    const isDiskAlert = alertType === 'disk_full' || alertType === 'sandbox_disk_full'
    const isMemoryAlert = alertType === 'high_memory'
    const isHighDiskUsage = diskUsagePercent && diskUsagePercent > 92

    if (isDiskAlert || isHighDiskUsage || isMemoryAlert) {
      logger.info('🚀 Sending INTERACTIVE Slack notification with container stats', {
        incidentId,
        alertType,
        diskUsagePercent,
      })

      // Get current disk usage if not provided (for disk alerts)
      let currentDiskUsage = diskUsagePercent
      if ((isDiskAlert || isHighDiskUsage) && !currentDiskUsage) {
        try {
          const metrics = await prometheusClient.collectMetrics()
          currentDiskUsage = metrics.disk.percentage
        } catch (error) {
          logger.warn('Failed to get current disk usage', { error })
          currentDiskUsage = 0
        }
      }

      // Send interactive notification with real container stats and action buttons
      await slackInteractive.sendInteractiveApproval({
        incidentId: rcaResult.incidentId,
        alertType: alertType || 'disk_full',
        summary: rcaResult.summary,
        severity: rcaResult.riskLevel === 'high' ? 'critical' : rcaResult.riskLevel,
        diskUsage: currentDiskUsage,
        includeContainerStats: true,
      })

      logger.info('✅ Interactive Slack notification sent successfully', {
        incidentId,
      })
    } else {
      // Use standard Slack notification for non-disk alerts
      logger.info('📤 Sending standard Slack notification', {
        incidentId,
        alertType,
      })

      const slackClient = getSlackClient()

      await slackClient.sendApprovalRequest({
        incidentId: rcaResult.incidentId,
        summary: rcaResult.summary,
        rootCause: rcaResult.rootCause,
        proposedFix: rcaResult.proposedFix,
        riskLevel: rcaResult.riskLevel,
        estimatedImpact: rcaResult.estimatedImpact,
      })

      logger.info('✅ Slack notification sent successfully', {
        incidentId,
      })
    }

    // Store notification record in state
    await state.set('slack-notifications', incidentId, {
      incidentId,
      status: 'sent',
      sentAt: new Date().toISOString(),
      riskLevel: rcaResult.riskLevel,
      interactive: isDiskAlert || isHighDiskUsage,
      alertType,
    })
  } catch (error) {
    logger.error('❌ Failed to send Slack notification', {
      incidentId: approvalRequest.incidentId,
      error: error instanceof Error ? error.message : String(error),
    })

    // Store failure record
    await state.set('slack-notifications', approvalRequest.incidentId, {
      incidentId: approvalRequest.incidentId,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
      failedAt: new Date().toISOString(),
    })

    // Don't throw - we don't want to retry Slack notifications
    // The approval can still be done via the manual API
  }
}
