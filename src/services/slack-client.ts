/**
 * Slack Client for Sentinal
 *
 * Handles Slack API interactions for notifications and approvals
 */

export interface SlackMessage {
  incidentId: string
  summary: string
  rootCause: string
  proposedFix: string
  riskLevel: 'low' | 'medium' | 'high'
  estimatedImpact: string
}

export interface SlackAttachment {
  color: string
  blocks: any[]
}

export class SlackClient {
  private webhookUrl: string

  constructor(webhookUrl?: string) {
    this.webhookUrl = webhookUrl || process.env.SLACK_WEBHOOK_URL || ''

    if (!this.webhookUrl) {
      throw new Error('SLACK_WEBHOOK_URL environment variable is required')
    }
  }

  /**
   * Send approval request to Slack
   */
  async sendApprovalRequest(message: SlackMessage): Promise<void> {
    const { incidentId, summary, rootCause, proposedFix, riskLevel, estimatedImpact } = message

    // Color coding based on risk level
    const color = this.getRiskColor(riskLevel)

    // Build Slack Block Kit message
    const payload = {
      text: `🚨 Incident Alert: ${summary}`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🚨 Incident Requires Your Approval',
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
              text: `*Risk Level:*\n${this.getRiskEmoji(riskLevel)} ${riskLevel.toUpperCase()}`,
            },
          ],
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Summary:*\n${summary}`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Root Cause:*\n${rootCause}`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Proposed Fix:*\n${proposedFix}`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Estimated Impact:*\n${estimatedImpact}`,
          },
        },
        {
          type: 'divider',
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '✅ Approve',
                emoji: true,
              },
              style: 'primary',
              value: `approve_${incidentId}`,
              action_id: 'approve_fix',
              url: `${this.getBaseUrl()}/approve?incident=${incidentId}`,
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '❌ Reject',
                emoji: true,
              },
              style: 'danger',
              value: `reject_${incidentId}`,
              action_id: 'reject_fix',
              url: `${this.getBaseUrl()}/reject?incident=${incidentId}`,
            },
          ],
        },
      ],
      attachments: [
        {
          color: color,
          footer: 'Sentinal SRE Agent',
          footer_icon: 'https://platform.slack-edge.com/img/default_application_icon.png',
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    }

    await this.sendWebhook(payload)
  }

  /**
   * Send generic notification to Slack
   */
  async sendNotification(text: string, details?: Record<string, string>): Promise<void> {
    const blocks: any[] = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: text,
        },
      },
    ]

    if (details) {
      blocks.push({
        type: 'section',
        fields: Object.entries(details).map(([key, value]) => ({
          type: 'mrkdwn',
          text: `*${key}:*\n${value}`,
        })),
      })
    }

    const payload = {
      text: text,
      blocks: blocks,
    }

    await this.sendWebhook(payload)
  }

  /**
   * Send raw webhook payload
   */
  private async sendWebhook(payload: any): Promise<void> {
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
  }

  /**
   * Get risk color for Slack message
   */
  private getRiskColor(riskLevel: string): string {
    switch (riskLevel) {
      case 'low':
        return '#36a64f' // Green
      case 'medium':
        return '#ff9900' // Orange
      case 'high':
        return '#ff0000' // Red
      default:
        return '#cccccc' // Gray
    }
  }

  /**
   * Get risk emoji
   */
  private getRiskEmoji(riskLevel: string): string {
    switch (riskLevel) {
      case 'low':
        return '🟢'
      case 'medium':
        return '🟡'
      case 'high':
        return '🔴'
      default:
        return '⚪'
    }
  }

  /**
   * Get base URL for approval buttons
   * In production, this would be your deployed API URL
   * For dev, use ngrok or similar tunnel
   */
  private getBaseUrl(): string {
    return process.env.CALLBACK_URL || 'http://localhost:3001'
  }
}

// Singleton instance
let slackClient: SlackClient | null = null

export function getSlackClient(): SlackClient {
  if (!slackClient) {
    slackClient = new SlackClient()
  }
  return slackClient
}
