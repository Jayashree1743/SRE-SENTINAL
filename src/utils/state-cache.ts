/**
 * State Cache Utility with TTL Support
 *
 * Provides caching layer on top of Motia state with:
 * - Time-to-live (TTL) for automatic expiration
 * - In-memory cache for frequently accessed data
 * - Automatic refresh strategies
 * - Cache invalidation patterns
 */

import type { State } from '#/types'
import { StateCacheError } from '../errors/sentinal-errors'

interface CacheEntry<T> {
  data: T
  timestamp: number
  expiresAt: number
}

interface CacheConfig {
  ttl: number // Time-to-live in milliseconds
  refreshOnAccess?: boolean // Extend TTL on access
  maxSize?: number // Maximum cache entries (LRU eviction)
}

export class StateCache {
  private cache: Map<string, CacheEntry<any>> = new Map()
  private accessOrder: string[] = [] // For LRU eviction

  /**
   * Get value with caching and TTL
   */
  async get<T>(
    state: State,
    group: string,
    key: string,
    config: CacheConfig
  ): Promise<T | null> {
    const cacheKey = `${group}:${key}`

    // Check in-memory cache first
    const cached = this.cache.get(cacheKey)
    if (cached) {
      const now = Date.now()

      // Check if expired
      if (now > cached.expiresAt) {
        this.cache.delete(cacheKey)
        this.removeFromAccessOrder(cacheKey)
      } else {
        // Cache hit! Update access order for LRU
        this.updateAccessOrder(cacheKey)

        // Optionally extend TTL on access
        if (config.refreshOnAccess) {
          cached.expiresAt = now + config.ttl
        }

        return cached.data as T
      }
    }

    // Cache miss - fetch from state
    try {
      const data = await state.get(group, key)

      if (data !== null) {
        // Store in cache
        this.set(cacheKey, data, config)
      }

      return data as T
    } catch (error) {
      throw new StateCacheError(
        group,
        key,
        error instanceof Error ? error.message : String(error),
        { operation: 'get' }
      )
    }
  }

  /**
   * Set value with caching
   */
  async set<T>(
    state: State,
    group: string,
    key: string,
    value: T,
    config: CacheConfig
  ): Promise<void>
  set<T>(cacheKey: string, value: T, config: CacheConfig): void
  async set<T>(
    stateOrKey: State | string,
    groupOrValue: string | T,
    keyOrConfig: string | CacheConfig,
    valueOrUndefined?: T,
    configOrUndefined?: CacheConfig
  ): Promise<void> {
    // Overload 1: set(state, group, key, value, config)
    if (typeof stateOrKey === 'object' && 'get' in stateOrKey) {
      const state = stateOrKey as State
      const group = groupOrValue as string
      const key = keyOrConfig as string
      const value = valueOrUndefined as T
      const config = configOrUndefined as CacheConfig

      const cacheKey = `${group}:${key}`

      try {
        // Save to state
        await state.set(group, key, value)

        // Update cache
        this.updateCache(cacheKey, value, config)
      } catch (error) {
        throw new StateCacheError(
          group,
          key,
          error instanceof Error ? error.message : String(error),
          { operation: 'set' }
        )
      }
    }
    // Overload 2: set(cacheKey, value, config) - internal use
    else {
      const cacheKey = stateOrKey as string
      const value = groupOrValue as T
      const config = keyOrConfig as CacheConfig

      this.updateCache(cacheKey, value, config)
    }
  }

  /**
   * Update in-memory cache with TTL
   */
  private updateCache<T>(cacheKey: string, value: T, config: CacheConfig): void {
    const now = Date.now()

    // Enforce max cache size (LRU eviction)
    if (config.maxSize && this.cache.size >= config.maxSize) {
      // Remove least recently used
      const lruKey = this.accessOrder[0]
      if (lruKey) {
        this.cache.delete(lruKey)
        this.accessOrder.shift()
      }
    }

    // Store in cache with TTL
    this.cache.set(cacheKey, {
      data: value,
      timestamp: now,
      expiresAt: now + config.ttl,
    })

    this.updateAccessOrder(cacheKey)
  }

  /**
   * Invalidate cache entry
   */
  invalidate(group: string, key: string): void {
    const cacheKey = `${group}:${key}`
    this.cache.delete(cacheKey)
    this.removeFromAccessOrder(cacheKey)
  }

  /**
   * Invalidate all entries in a group
   */
  invalidateGroup(group: string): void {
    const keysToDelete: string[] = []

    for (const cacheKey of this.cache.keys()) {
      if (cacheKey.startsWith(`${group}:`)) {
        keysToDelete.push(cacheKey)
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key)
      this.removeFromAccessOrder(key)
    }
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear()
    this.accessOrder = []
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const now = Date.now()
    let expired = 0
    let valid = 0

    for (const entry of this.cache.values()) {
      if (now > entry.expiresAt) {
        expired++
      } else {
        valid++
      }
    }

    return {
      total: this.cache.size,
      valid,
      expired,
      hitRate: this.getHitRate(),
    }
  }

  /**
   * Update access order for LRU
   */
  private updateAccessOrder(cacheKey: string): void {
    this.removeFromAccessOrder(cacheKey)
    this.accessOrder.push(cacheKey)
  }

  /**
   * Remove from access order
   */
  private removeFromAccessOrder(cacheKey: string): void {
    const index = this.accessOrder.indexOf(cacheKey)
    if (index !== -1) {
      this.accessOrder.splice(index, 1)
    }
  }

  /**
   * Calculate cache hit rate (simplified - would need tracking)
   */
  private getHitRate(): number {
    // This is a placeholder - for real hit rate tracking,
    // you'd need to track hits and misses
    return 0
  }
}

/**
 * Predefined cache configurations for common use cases
 */
export const CacheProfiles = {
  /** Short-lived cache for frequently changing data (30 seconds) */
  FREQUENT: {
    ttl: 30 * 1000,
    refreshOnAccess: false,
    maxSize: 100,
  },

  /** Medium cache for moderately stable data (5 minutes) */
  MODERATE: {
    ttl: 5 * 60 * 1000,
    refreshOnAccess: true,
    maxSize: 500,
  },

  /** Long-lived cache for rarely changing data (30 minutes) */
  STABLE: {
    ttl: 30 * 60 * 1000,
    refreshOnAccess: true,
    maxSize: 1000,
  },

  /** Ultra-short cache for real-time data (5 seconds) */
  REALTIME: {
    ttl: 5 * 1000,
    refreshOnAccess: false,
    maxSize: 50,
  },

  /** Configuration cache (1 hour) */
  CONFIG: {
    ttl: 60 * 60 * 1000,
    refreshOnAccess: false,
    maxSize: 100,
  },
} as const

// Singleton instance
export const stateCache = new StateCache()
