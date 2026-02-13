import type { ApiConfig, Handlers } from '#/types'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Logo Image API
 *
 * Serves the SENTINEL logo image for the dashboard
 */
export const config: ApiConfig = {
  name: 'Logo',
  type: 'api',
  description: 'Serves the SENTINEL logo image',
  method: 'GET',
  path: '/image.png',
  emits: [],
  flows: ['sentinal-sre'],
}

export const handler: Handlers['Logo'] = async (req, { logger }) => {
  logger.info('Logo image requested')

  try {
    const imagePath = join(process.cwd(), 'public', 'image.png')
    const imageBuffer = readFileSync(imagePath)

    logger.info('Logo image served successfully')

    return {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
      },
      body: imageBuffer,
    }
  } catch (error) {
    logger.error('Failed to serve logo image', {
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      status: 404,
      body: 'Logo not found',
    }
  }
}
