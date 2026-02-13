import type { ApiConfig, Handlers } from '#/types'

/**
 * Incidents SSE API
 *
 * Server-Sent Events endpoint for real-time incident updates
 * Clients can connect and receive live status updates as incidents progress
 *
 * Features showcased:
 * - Server-Sent Events (SSE)
 * - Real-time streaming
 * - Stream subscriptions
 * - Live data push
 *
 * Usage:
 * const eventSource = new EventSource('http://localhost:3001/incidents/stream');
 * eventSource.onmessage = (event) => {
 *   const incident = JSON.parse(event.data);
 *   console.log('Incident update:', incident);
 * };
 *
 * Note: SSE endpoints should NOT use standard middlewares as they interfere
 * with the long-lived stream connection.
 */
export const config: ApiConfig = {
  name: 'IncidentsSSE',
  type: 'api',
  description: 'Server-Sent Events stream for real-time incident updates',
  method: 'GET',
  path: '/incidents/stream',
  emits: [],
  flows: ['sentinal-sre'],
  // No middlewares for SSE - they interfere with streaming
}

export const handler: Handlers['IncidentsSSE'] = async (req, { logger, streams }) => {
  logger.info('SSE client connected to incidents stream')

  try {
    // Get all current incidents from the stream
    const incidents = await streams.incident.getGroup('incidents')

    // Convert to SSE format
    const incidentsList = Object.entries(incidents).map(([key, value]) => ({
      id: key,
      ...value,
    }))

    logger.info('Returning incidents stream', {
      count: incidentsList.length,
    })

    // Return SSE stream
    // Note: Motia handles the SSE connection automatically when accessing streams
    return {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
      body: {
        stream: 'incident',
        group: 'incidents',
      },
    }
  } catch (error) {
    logger.error('Failed to create SSE stream', {
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      status: 500,
      body: {
        error: 'Failed to create incident stream',
      },
    }
  }
}
