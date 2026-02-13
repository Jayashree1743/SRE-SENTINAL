import type { ApiConfig, Handlers } from '#/types'

/**
 * Slack Reject Endpoint
 *
 * Simple GET endpoint for Slack reject button clicks
 * Updates approval state and emits rejection event
 *
 * Features showcased:
 * - Simple rejection workflow via URL buttons
 * - Integration with Slack notifications
 */

export const config: ApiConfig = {
  name: 'SlackReject',
  type: 'api',
  description: 'Reject incident via Slack button (GET endpoint)',
  method: 'GET',
  path: '/reject',
  queryParams: [
    {
      name: 'incident',
      description: 'The incident ID to reject',
    },
  ],
  emits: ['fix.rejected'],
  flows: ['sentinal-sre'],
}

export const handler: Handlers['SlackReject'] = async (req, { logger, emit, state }) => {
  const incidentId = req.queryParams.incident as string

  logger.info('Slack rejection button clicked', { incidentId })

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

    // Update approval state
    await state.set('approval-pending', incidentId, {
      ...pendingApproval,
      status: 'rejected',
      approver: 'slack-button',
      rejectedAt: new Date().toISOString(),
    })

    // Emit rejection event
    await emit({
      topic: 'fix.rejected',
      data: {
        incidentId,
        rejectedBy: 'slack-button',
        rejectedAt: new Date().toISOString(),
        reason: 'Rejected via Slack button',
      },
    })

    logger.info('❌ Incident rejected via Slack', { incidentId })

    return {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
      body: `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Rejected</title>
            <meta http-equiv="refresh" content="3;url=http://localhost:3001/dashboard" />
            <style>
              body { font-family: system-ui; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
              .rejected { background: #fee; border: 1px solid #fcc; padding: 30px; border-radius: 8px; }
              .emoji { font-size: 64px; margin: 20px 0; }
            </style>
          </head>
          <body>
            <div class="rejected">
              <div class="emoji">❌</div>
              <h2>Fix Rejected</h2>
              <p>Incident <code>${incidentId}</code> fix has been rejected.</p>
              <p>The proposed fix will not be executed.</p>
              <p><small>Redirecting to dashboard in 3 seconds...</small></p>
            </div>
          </body>
        </html>
      `,
    }
  } catch (error) {
    logger.error('Rejection failed', {
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
              <h2>❌ Error Processing Rejection</h2>
              <p>An error occurred while processing the rejection.</p>
              <p><code>${error instanceof Error ? error.message : String(error)}</code></p>
            </div>
          </body>
        </html>
      `,
    }
  }
}
