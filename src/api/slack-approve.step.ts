import type { ApiConfig, Handlers } from '#/types'

/**
 * Slack Approve Endpoint
 *
 * Simple GET endpoint for Slack approve button clicks
 * Redirects to the manual approval API with proper formatting
 *
 * Features showcased:
 * - Simple approval workflow via URL buttons
 * - Integration with Slack notifications
 */

export const config: ApiConfig = {
  name: 'SlackApprove',
  type: 'api',
  description: 'Approve incident via Slack button (GET endpoint)',
  method: 'GET',
  path: '/approve',
  queryParams: [
    {
      name: 'incident',
      description: 'The incident ID to approve',
    },
  ],
  emits: ['fix.approved'],
  flows: ['sentinal-sre'],
}

export const handler: Handlers['SlackApprove'] = async (req, { logger, emit, state }) => {
  const incidentId = req.queryParams.incident as string

  logger.info('Slack approval button clicked', { incidentId })

  try {
    // Check if incident has pending approval
    const pendingApproval = await state.get('approval-pending', incidentId)

    if (!pendingApproval) {
      return {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
        body: `
          <!DOCTYPE html>
          <html>
            <head>
              <title>Approval Not Found</title>
              <style>
                body { font-family: system-ui; max-width: 600px; margin: 50px auto; padding: 20px; }
                .error { background: #fee; border: 1px solid #fcc; padding: 20px; border-radius: 8px; }
              </style>
            </head>
            <body>
              <div class="error">
                <h2>❌ Approval Not Found</h2>
                <p>No pending approval found for incident: <code>${incidentId}</code></p>
                <p>The incident may have already been processed.</p>
              </div>
            </body>
          </html>
        `,
      }
    }

    if (pendingApproval.status !== 'pending') {
      return {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
        body: `
          <!DOCTYPE html>
          <html>
            <head>
              <title>Already Processed</title>
              <style>
                body { font-family: system-ui; max-width: 600px; margin: 50px auto; padding: 20px; }
                .warning { background: #ffc; border: 1px solid #fc0; padding: 20px; border-radius: 8px; }
              </style>
            </head>
            <body>
              <div class="warning">
                <h2>⚠️ Already Processed</h2>
                <p>This incident has already been processed with status: <strong>${pendingApproval.status}</strong></p>
              </div>
            </body>
          </html>
        `,
      }
    }

    // Get RCA result
    const rcaResult = await state.get('rca-results', incidentId)

    if (!rcaResult) {
      logger.error('RCA result not found', { incidentId })
      return {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
        body: `
          <!DOCTYPE html>
          <html>
            <head>
              <title>Error</title>
              <style>
                body { font-family: system-ui; max-width: 600px; margin: 50px auto; padding: 20px; }
                .error { background: #fee; border: 1px solid #fcc; padding: 20px; border-radius: 8px; }
              </style>
            </head>
            <body>
              <div class="error">
                <h2>❌ Error</h2>
                <p>RCA result not found for incident: <code>${incidentId}</code></p>
              </div>
            </body>
          </html>
        `,
      }
    }

    // Update approval state
    await state.set('approval-pending', incidentId, {
      ...pendingApproval,
      status: 'approved',
      approver: 'slack-button',
      approvedAt: new Date().toISOString(),
    })

    // Emit approval event
    await emit({
      topic: 'fix.approved',
      data: {
        incidentId,
        approvalType: 'slack',
        approvedBy: 'slack-button',
        approvedAt: new Date().toISOString(),
        rcaResult,
      },
    })

    logger.info('✅ Incident approved via Slack', { incidentId })

    return {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
      body: `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Approved</title>
            <meta http-equiv="refresh" content="3;url=http://localhost:3001/dashboard" />
            <style>
              body { font-family: system-ui; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
              .success { background: #efe; border: 1px solid #cfc; padding: 30px; border-radius: 8px; }
              .emoji { font-size: 64px; margin: 20px 0; }
            </style>
          </head>
          <body>
            <div class="success">
              <div class="emoji">✅</div>
              <h2>Fix Approved!</h2>
              <p>Incident <code>${incidentId}</code> has been approved for remediation.</p>
              <p>The fix will be executed automatically.</p>
              <p><small>Redirecting to dashboard in 3 seconds...</small></p>
            </div>
          </body>
        </html>
      `,
    }
  } catch (error) {
    logger.error('Approval failed', {
      incidentId,
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
      body: `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Error</title>
            <style>
              body { font-family: system-ui; max-width: 600px; margin: 50px auto; padding: 20px; }
              .error { background: #fee; border: 1px solid #fcc; padding: 20px; border-radius: 8px; }
            </style>
          </head>
          <body>
            <div class="error">
              <h2>❌ Error Processing Approval</h2>
              <p>An error occurred while processing the approval.</p>
              <p><code>${error instanceof Error ? error.message : String(error)}</code></p>
            </div>
          </body>
        </html>
      `,
    }
  }
}
