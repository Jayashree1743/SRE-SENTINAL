/**
 * Authentication & Authorization Middleware for Sentinal
 *
 * Provides:
 * - API key authentication
 * - Role-based access control (RBAC)
 * - Request validation
 * - Security headers
 *
 * Protects sensitive endpoints from unauthorized access
 */

import type { ApiMiddleware } from '#/types'

/**
 * User roles for RBAC
 */
export enum UserRole {
  ADMIN = 'admin', // Full access - can approve, trigger, rollback
  OPERATOR = 'operator', // Can view and approve incidents
  VIEWER = 'viewer', // Read-only access
}

/**
 * API Key configuration
 * In production, these should be stored in a secure vault (HashiCorp Vault, AWS Secrets Manager)
 */
interface ApiKeyConfig {
  key: string
  role: UserRole
  name: string
  createdAt: string
  expiresAt?: string
}

/**
 * In-memory API keys (for demo)
 * In production: Load from secure storage
 */
const API_KEYS: Map<string, ApiKeyConfig> = new Map([
  [
    'sk-sentinal-admin-demo-key-12345', // Admin key
    {
      key: 'sk-sentinal-admin-demo-key-12345',
      role: UserRole.ADMIN,
      name: 'Demo Admin',
      createdAt: new Date().toISOString(),
    },
  ],
  [
    'sk-sentinal-operator-demo-key-67890', // Operator key
    {
      key: 'sk-sentinal-operator-demo-key-67890',
      role: UserRole.OPERATOR,
      name: 'Demo Operator',
      createdAt: new Date().toISOString(),
    },
  ],
  [
    'sk-sentinal-viewer-demo-key-11111', // Viewer key (read-only)
    {
      key: 'sk-sentinal-viewer-demo-key-11111',
      role: UserRole.VIEWER,
      name: 'Demo Viewer',
      createdAt: new Date().toISOString(),
    },
  ],
])

/**
 * Extract API key from request headers or query parameters
 */
function extractApiKey(req: any): string | null {
  // Check Authorization header (Bearer token)
  const authHeader = req.headers?.authorization

  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7)
  }

  // Check X-API-Key header
  const apiKeyHeader = req.headers?.['x-api-key']
  if (apiKeyHeader) {
    return apiKeyHeader
  }

  // Check query parameter (for Slack button URLs)
  // In Motia, query params are accessed via req.queryParams
  const apiKeyQuery = req.queryParams?.apiKey || req.query?.apiKey
  if (apiKeyQuery) {
    return apiKeyQuery
  }

  return null
}

/**
 * Validate API key and return user config
 */
function validateApiKey(apiKey: string): ApiKeyConfig | null {
  const config = API_KEYS.get(apiKey)

  if (!config) {
    return null
  }

  // Check expiration
  if (config.expiresAt && new Date(config.expiresAt) < new Date()) {
    return null
  }

  return config
}

/**
 * Check if user has required role for operation
 */
function hasPermission(userRole: UserRole, requiredRole: UserRole): boolean {
  const rolePriority: Record<UserRole, number> = {
    [UserRole.VIEWER]: 1,
    [UserRole.OPERATOR]: 2,
    [UserRole.ADMIN]: 3,
  }

  return rolePriority[userRole] >= rolePriority[requiredRole]
}

/**
 * Authentication Middleware
 *
 * Validates API key and attaches user info to request
 */
export const authMiddleware: ApiMiddleware = async (req, ctx, next) => {
  const { logger } = ctx

  // Extract API key
  const apiKey = extractApiKey(req)

  if (!apiKey) {
    logger.warn('Authentication failed: No API key provided')

    return {
      status: 401,
      body: {
        error: 'Unauthorized',
        message: 'API key required. Provide via Authorization header or X-API-Key header.',
      },
    }
  }

  // Validate API key
  const userConfig = validateApiKey(apiKey)

  if (!userConfig) {
    logger.warn('Authentication failed: Invalid API key', {
      keyPrefix: apiKey.substring(0, 10) + '...',
    })

    return {
      status: 401,
      body: {
        error: 'Unauthorized',
        message: 'Invalid or expired API key',
      },
    }
  }

  // Attach user info to request context
  ;(req as any).user = {
    role: userConfig.role,
    name: userConfig.name,
    apiKey: apiKey.substring(0, 10) + '...', // Redacted for logging
  }

  logger.info('User authenticated', {
    user: userConfig.name,
    role: userConfig.role,
  })

  // Continue to next middleware/handler
  return await next()
}

/**
 * Authorization Middleware Factory
 *
 * Creates middleware that checks for required role
 *
 * @param requiredRole - Minimum role required for this endpoint
 */
export function requireRole(requiredRole: UserRole): ApiMiddleware {
  return async (req, ctx, next) => {
    const { logger } = ctx

    const user = (req as any).user

    if (!user) {
      logger.error('Authorization check failed: No user in request (auth middleware not run?)')

      return {
        status: 500,
        body: {
          error: 'Internal Server Error',
          message: 'Authentication middleware not configured',
        },
      }
    }

    // Check permission
    if (!hasPermission(user.role, requiredRole)) {
      logger.warn('Authorization failed: Insufficient permissions', {
        user: user.name,
        userRole: user.role,
        requiredRole,
      })

      return {
        status: 403,
        body: {
          error: 'Forbidden',
          message: `This operation requires ${requiredRole} role or higher. You have: ${user.role}`,
        },
      }
    }

    logger.info('Authorization check passed', {
      user: user.name,
      role: user.role,
      requiredRole,
    })

    // Permission granted
    return await next()
  }
}

/**
 * Combined auth middleware (authenticate + authorize)
 *
 * Convenience function for common use case
 */
export function protectWith(requiredRole: UserRole): ApiMiddleware[] {
  return [authMiddleware, requireRole(requiredRole)]
}

/**
 * Security headers middleware
 *
 * Adds security-related HTTP headers to all responses
 */
export const securityHeadersMiddleware: ApiMiddleware = async (req, ctx, next) => {
  const response = await next()

  // Add security headers
  if (!response.headers) {
    response.headers = {}
  }

  response.headers['X-Content-Type-Options'] = 'nosniff'
  response.headers['X-Frame-Options'] = 'DENY'
  response.headers['X-XSS-Protection'] = '1; mode=block'
  response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'

  return response
}

/**
 * Rate limiting middleware (simple in-memory implementation)
 *
 * In production: Use Redis or similar distributed cache
 */
const rateLimitStore: Map<string, { count: number; resetAt: number }> = new Map()

export function rateLimit(maxRequests: number, windowMs: number): ApiMiddleware {
  return async (req, ctx, next) => {
    const { logger } = ctx

    const user = (req as any).user
    const identifier = user?.apiKey || req.headers?.['x-forwarded-for'] || 'anonymous'

    const now = Date.now()
    const limitData = rateLimitStore.get(identifier)

    if (!limitData || now > limitData.resetAt) {
      // Reset window
      rateLimitStore.set(identifier, {
        count: 1,
        resetAt: now + windowMs,
      })
    } else {
      limitData.count++

      if (limitData.count > maxRequests) {
        logger.warn('Rate limit exceeded', {
          identifier: identifier.substring(0, 20),
          count: limitData.count,
          maxRequests,
        })

        return {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((limitData.resetAt - now) / 1000)),
          },
          body: {
            error: 'Too Many Requests',
            message: `Rate limit exceeded. Max ${maxRequests} requests per ${windowMs / 1000}s.`,
          },
        }
      }
    }

    return await next()
  }
}
