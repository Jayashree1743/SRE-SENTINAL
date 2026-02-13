/**
 * Slack Interactive Service - PRO Edition
 *
 * Handles interactive Slack notifications with:
 * - Real container stats from Docker
 * - Action buttons (Clear Sandbox, Restart Container, Both)
 * - Dropdown for container selection
 * - Real execution of approved actions
 */

import { dockerStatsService } from './docker-stats'
import { sandboxMonitor } from './sandbox-monitor'

export interface InteractiveSlackMessage {
  incidentId: string
  alertType: string
  summary: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  diskUsage?: number
  includeContainerStats?: boolean
}

export interface SlackAction {
  incidentId: string
  action: 'clear_sandbox' | 'restart_container' | 'both'
  containerName?: string
  userId: string
  timestamp: string
}

export class SlackInteractiveService {
  private webhookUrl: string
  private callbackUrl: string

  constructor() {
    this.webhookUrl = process.env.SLACK_WEBHOOK_URL || ''
    this.callbackUrl = process.env.PUBLIC_URL || 'http://localhost:3001'
1
    if (!this.webhookUrl) {
      console.warn('⚠️ SLACK_WEBHOOK_URL not set - Slack notifications disabled')
    }
  }

  /**
   * Send interactive approval request with container stats and action buttons
   */
  async sendInteractiveApproval(message: InteractiveSlackMessage): Promise<void> {
    if (!this.webhookUrl) {
      console.warn('Slack webhook not configured, skipping notification')
      return
    }

    const { incidentId, alertType, summary, severity, diskUsage, includeContainerStats } = message

    // Get real container stats
    let containerStatsText = ''
    let containerOptions: any[] = []

    if (includeContainerStats !== false) {
      const stats = await dockerStatsService.getContainerStats()
      containerStatsText = dockerStatsService.formatStatsForSlack(stats)

      // Build container dropdown options
      containerOptions = stats.containers.map((c) => ({
        text: {
          type: 'plain_text',
          text: `${c.name} (${c.memoryPercentage.toFixed(1)}% mem)`,
        },
        value: c.name,
      }))
    }

    // Build Slack Block Kit message
    const blocks: any[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🚨 Disk Alert - Action Required',
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Incident ID:*\n\`${incidentId}\``,
          },
          {
            type: 'mrkdwn',
            text: `*Severity:*\n${this.getSeverityEmoji(severity)} ${severity.toUpperCase()}`,
          },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Alert:*\n${summary}`,
        },
      },
    ]

    // Add disk usage if provided
    if (diskUsage !== undefined) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Disk Usage:* ${diskUsage}% ${diskUsage > 95 ? '🔴' : diskUsage > 90 ? '🟡' : '🟢'}`,
        },
      })
    }

    // Add container stats
    if (containerStatsText) {
      blocks.push({
        type: 'divider',
      })
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: containerStatsText,
        },
      })
    }

    blocks.push({
      type: 'divider',
    })

    // Add action header
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Select an action to resolve this incident:*',
      },
    })

    // Action buttons with URLs for click handling
    // Show different buttons based on alert type
    const isDiskAlert = alertType === 'disk_full' || alertType === 'sandbox_disk_full'
    const isMemoryAlert = alertType === 'high_memory'

    const actionBlocks: any = {
      type: 'actions',
      block_id: 'incident_actions',
      elements: [],
    }

    // For DISK alerts: Show sandbox clearing buttons
    if (isDiskAlert) {
      // Clear Sandbox button (requires admin)
      actionBlocks.elements.push({
        type: 'button',
        text: {
          type: 'plain_text',
          text: '🧹 Clear Sandbox (Admin)',
          emoji: true,
        },
        style: 'primary',
        value: `clear_sandbox_${incidentId}`,
        action_id: 'clear_sandbox',
        url: `${this.callbackUrl}/manual-approval?incident=${incidentId}&action=approve&execute=clear_sandbox&apiKey=sk-sentinal-admin-demo-key-12345`,
      })

      // Both button (requires admin)
      actionBlocks.elements.push({
        type: 'button',
        text: {
          type: 'plain_text',
          text: '🔧 Clear + Restart (Admin)',
          emoji: true,
        },
        style: 'primary',
        value: `both_${incidentId}`,
        action_id: 'both_actions',
        url: `${this.callbackUrl}/manual-approval?incident=${incidentId}&action=approve&execute=both&apiKey=sk-sentinal-admin-demo-key-12345`,
      })
    }

    // For MEMORY alerts: No sandbox buttons, only container restart (shown below)

    // Reject button (always shown)
    actionBlocks.elements.push({
      type: 'button',
      text: {
        type: 'plain_text',
        text: '❌ Reject',
        emoji: true,
      },
      style: 'danger',
      value: `reject_${incidentId}`,
      action_id: 'reject_incident',
      url: `${this.callbackUrl}/manual-approval?incident=${incidentId}&action=reject&apiKey=sk-sentinal-operator-demo-key-67890`,
    })

    blocks.push(actionBlocks)

    // Add container restart options if we have containers
    if (containerOptions.length > 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Or restart a specific container:*',
        },
      })

      // Add a button for each container (all containers, not just top 3)
      // Note: Slack allows max 5 buttons per action block, so we'll split into multiple blocks if needed
      const maxButtonsPerBlock = 5

      for (let i = 0; i < containerOptions.length; i += maxButtonsPerBlock) {
        const containersChunk = containerOptions.slice(i, i + maxButtonsPerBlock)
        const restartActions: any = {
          type: 'actions',
          block_id: `container_restart_actions_${i}`,
          elements: containersChunk.map((container) => ({
            type: 'button',
            text: {
              type: 'plain_text',
              text: `🔄 ${container.text.text}`,
              emoji: true,
            },
            value: `restart_${incidentId}_${container.value}`,
            action_id: `restart_${container.value}`,
            url: `${this.callbackUrl}/manual-approval?incident=${incidentId}&action=approve&execute=restart_container&container=${container.value}&apiKey=sk-sentinal-operator-demo-key-67890`,
          })),
        }
        blocks.push(restartActions)
      }
    }

    // Footer
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `🤖 Sentinal SRE | Incident detected at <!date^${Math.floor(Date.now() / 1000)}^{date_short_pretty} {time}|${new Date().toISOString()}>`,
        },
      ],
    })

    const payload = {
      text: `🚨 ${summary}`,
      blocks: blocks,
      attachments: [
        {
          color: this.getSeverityColor(severity),
        },
      ],
    }

    await this.sendWebhook(payload)
  }

  /**
   * Send action result notification
   */
  async sendActionResult(
    incidentId: string,
    action: string,
    success: boolean,
    message: string,
    logs: string[]
  ): Promise<void> {
    if (!this.webhookUrl) {
      return
    }

    const emoji = success ? '✅' : '❌'
    const color = success ? '#36a64f' : '#ff0000'

    const blocks: any[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${emoji} Action ${success ? 'Completed' : 'Failed'}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Incident:*\n\`${incidentId}\``,
          },
          {
            type: 'mrkdwn',
            text: `*Action:*\n${action}`,
          },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Result:*\n${message}`,
        },
      },
    ]

    // Add execution logs
    if (logs.length > 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Execution Logs:*\n\`\`\`${logs.slice(0, 10).join('\n')}\`\`\``,
        },
      })
    }

    const payload = {
      text: `${emoji} ${action} ${success ? 'completed' : 'failed'}`,
      blocks: blocks,
      attachments: [
        {
          color: color,
        },
      ],
    }

    await this.sendWebhook(payload)
  }

  /**
   * Execute approved action (REAL EXECUTION)
   */
  async executeAction(action: SlackAction): Promise<{
    success: boolean
    message: string
    logs: string[]
  }> {
    const { action: actionType, containerName } = action
    const allLogs: string[] = []

    try {
      switch (actionType) {
        case 'clear_sandbox': {
          allLogs.push('🧹 Executing sandbox cleanup...')
          const result = await sandboxMonitor.executeCleanup()
          allLogs.push(...result.details)

          return {
            success: result.success,
            message: result.message,
            logs: allLogs,
          }
        }

        case 'restart_container': {
          if (!containerName) {
            throw new Error('Container name is required for restart action')
          }

          allLogs.push(`🔄 Restarting container: ${containerName}`)
          const result = await dockerStatsService.restartContainer(containerName)
          allLogs.push(...result.logs)

          return {
            success: result.success,
            message: result.message,
            logs: allLogs,
          }
        }

        case 'both': {
          allLogs.push('🔧 Executing combined actions...')

          // 1. Clear sandbox
          allLogs.push('\n--- Clearing Sandbox ---')
          const sandboxResult = await sandboxMonitor.executeCleanup()
          allLogs.push(...sandboxResult.details)

          if (!sandboxResult.success) {
            return {
              success: false,
              message: 'Sandbox cleanup failed',
              logs: allLogs,
            }
          }

          // 2. Restart high-memory container
          const stats = await dockerStatsService.getContainerStats()
          if (stats.highMemoryContainers.length > 0) {
            const targetContainer = stats.highMemoryContainers[0].name

            allLogs.push(`\n--- Restarting High Memory Container: ${targetContainer} ---`)
            const restartResult = await dockerStatsService.restartContainer(targetContainer)
            allLogs.push(...restartResult.logs)

            return {
              success: sandboxResult.success && restartResult.success,
              message: `Cleared ${sandboxResult.freedMB}MB from sandbox and restarted ${targetContainer}`,
              logs: allLogs,
            }
          }

          return {
            success: true,
            message: `Cleared ${sandboxResult.freedMB}MB from sandbox (no containers to restart)`,
            logs: allLogs,
          }
        }

        default:
          throw new Error(`Unknown action type: ${actionType}`)
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      allLogs.push(`❌ Error: ${errorMsg}`)

      return {
        success: false,
        message: `Action failed: ${errorMsg}`,
        logs: allLogs,
      }
    }
  }

  /**
   * Send webhook payload
   */
  private async sendWebhook(payload: any): Promise<void> {
    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`Slack webhook failed: ${response.status} - ${text}`)
      }
    } catch (error) {
      console.error('Failed to send Slack webhook:', error)
      // Don't throw - we don't want to break the flow if Slack is unavailable
    }
  }

  /**
   * Get severity emoji
   */
  private getSeverityEmoji(severity: string): string {
    switch (severity) {
      case 'critical':
        return '🔴'
      case 'high':
        return '🟠'
      case 'medium':
        return '🟡'
      case 'low':
        return '🟢'
      default:
        return '⚪'
    }
  }

  /**
   * Get severity color
   */
  private getSeverityColor(severity: string): string {
    switch (severity) {
      case 'critical':
        return '#ff0000'
      case 'high':
        return '#ff6600'
      case 'medium':
        return '#ffaa00'
      case 'low':
        return '#36a64f'
      default:
        return '#808080'
    }
  }

  /**
   * Check if Slack is configured
   */
  isConfigured(): boolean {
    return !!this.webhookUrl
  }
}

// Export singleton
export const slackInteractive = new SlackInteractiveService()
