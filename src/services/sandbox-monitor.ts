/**
 * Sandbox Monitor - Real Disk Space Monitoring & Cleanup
 *
 * Monitors a dedicated sandbox directory instead of the entire filesystem
 * Allows for REAL execution of cleanup commands in a safe, isolated environment
 *
 * Safety Features:
 * - Isolated to /home/sidharth/Desktop/Motia/Sandbox only
 * - Never touches system files or important data
 * - Only cleans logs/, temp/, and cache/ subdirectories
 * - Preserves data/ subdirectory
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { execSync } from 'child_process'

const SANDBOX_PATH = '/home/sidharth/Desktop/Motia/Sandbox'
const THRESHOLD_MB = 100 // Alert when sandbox exceeds 100MB
const SAFE_CLEANUP_DIRS = ['logs', 'temp', 'cache'] // Only clean these

export interface SandboxMetrics {
  totalSizeMB: number
  totalSizeBytes: number
  percentage: number // Percentage of threshold
  files: {
    logs: number
    temp: number
    cache: number
    data: number
  }
}

export class SandboxMonitor {
  /**
   * Get the size of a directory in bytes
   */
  private async getDirectorySize(dirPath: string): Promise<number> {
    try {
      const stat = await fs.stat(dirPath)

      if (!stat.isDirectory()) {
        return stat.size
      }

      const files = await fs.readdir(dirPath)
      const sizes = await Promise.all(
        files.map(async (file) => {
          const filePath = path.join(dirPath, file)
          return this.getDirectorySize(filePath)
        })
      )

      return sizes.reduce((total, size) => total + size, 0)
    } catch (error) {
      // Directory doesn't exist or can't be read
      return 0
    }
  }

  /**
   * Count files in a directory
   */
  private async countFiles(dirPath: string): Promise<number> {
    try {
      const files = await fs.readdir(dirPath)
      return files.length
    } catch (error) {
      return 0
    }
  }

  /**
   * Collect sandbox metrics
   */
  async collectMetrics(): Promise<SandboxMetrics> {
    const totalSizeBytes = await this.getDirectorySize(SANDBOX_PATH)
    const totalSizeMB = Math.round(totalSizeBytes / (1024 * 1024))
    const percentage = Math.round((totalSizeMB / THRESHOLD_MB) * 100)

    const files = {
      logs: await this.countFiles(path.join(SANDBOX_PATH, 'logs')),
      temp: await this.countFiles(path.join(SANDBOX_PATH, 'temp')),
      cache: await this.countFiles(path.join(SANDBOX_PATH, 'cache')),
      data: await this.countFiles(path.join(SANDBOX_PATH, 'data')),
    }

    return {
      totalSizeMB,
      totalSizeBytes,
      percentage,
      files,
    }
  }

  /**
   * Check if sandbox is over threshold
   */
  async isOverThreshold(): Promise<boolean> {
    const metrics = await this.collectMetrics()
    return metrics.totalSizeMB >= THRESHOLD_MB
  }

  /**
   * Execute real cleanup - SAFE, only in sandbox directories
   */
  async executeCleanup(): Promise<{
    success: boolean
    message: string
    freedMB: number
    details: string[]
  }> {
    const beforeMetrics = await this.collectMetrics()
    const details: string[] = []

    console.log('🧹 Starting sandbox cleanup...')
    console.log(`   Current size: ${beforeMetrics.totalSizeMB}MB`)

    try {
      // Clean up temp files (older than 1 hour)
      const tempDir = path.join(SANDBOX_PATH, 'temp')
      try {
        const tempFiles = await fs.readdir(tempDir)
        let tempDeleted = 0

        for (const file of tempFiles) {
          const filePath = path.join(tempDir, file)
          const stat = await fs.stat(filePath)
          const ageHours = (Date.now() - stat.mtime.getTime()) / (1000 * 60 * 60)

          if (ageHours > 0.01) { // Delete files older than ~36 seconds for demo
            await fs.unlink(filePath)
            tempDeleted++
          }
        }

        if (tempDeleted > 0) {
          details.push(`Deleted ${tempDeleted} temp files`)
        }
      } catch (error) {
        details.push('Temp directory cleanup skipped (not found)')
      }

      // Clean up old logs (keep last 5)
      const logsDir = path.join(SANDBOX_PATH, 'logs')
      try {
        const logFiles = await fs.readdir(logsDir)
        const logStats = await Promise.all(
          logFiles.map(async (file) => ({
            name: file,
            path: path.join(logsDir, file),
            mtime: (await fs.stat(path.join(logsDir, file))).mtime,
          }))
        )

        // Sort by modified time, oldest first
        logStats.sort((a, b) => a.mtime.getTime() - b.mtime.getTime())

        // Delete all but the 5 newest
        const toDelete = logStats.slice(0, -5)
        for (const file of toDelete) {
          await fs.unlink(file.path)
        }

        if (toDelete.length > 0) {
          details.push(`Deleted ${toDelete.length} old log files`)
        }
      } catch (error) {
        details.push('Logs cleanup skipped (not found)')
      }

      // Clean up cache (all files)
      const cacheDir = path.join(SANDBOX_PATH, 'cache')
      try {
        const cacheFiles = await fs.readdir(cacheDir)
        for (const file of cacheFiles) {
          await fs.unlink(path.join(cacheDir, file))
        }

        if (cacheFiles.length > 0) {
          details.push(`Cleared ${cacheFiles.length} cache files`)
        }
      } catch (error) {
        details.push('Cache cleanup skipped (not found)')
      }

      // Get new metrics
      const afterMetrics = await this.collectMetrics()
      const freedMB = beforeMetrics.totalSizeMB - afterMetrics.totalSizeMB

      console.log(`✅ Cleanup complete! Freed ${freedMB}MB`)
      console.log(`   New size: ${afterMetrics.totalSizeMB}MB`)

      return {
        success: true,
        message: `Successfully freed ${freedMB}MB of disk space in sandbox`,
        freedMB,
        details,
      }
    } catch (error) {
      console.error('❌ Cleanup failed:', error)
      return {
        success: false,
        message: `Cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
        freedMB: 0,
        details: ['Cleanup encountered an error'],
      }
    }
  }

  /**
   * Verify cleanup was successful
   */
  async verifyCleanup(): Promise<{
    success: boolean
    message: string
    currentSizeMB: number
    belowThreshold: boolean
  }> {
    const metrics = await this.collectMetrics()
    const belowThreshold = metrics.totalSizeMB < THRESHOLD_MB

    return {
      success: belowThreshold,
      message: belowThreshold
        ? `Sandbox size (${metrics.totalSizeMB}MB) is now below threshold (${THRESHOLD_MB}MB)`
        : `Sandbox size (${metrics.totalSizeMB}MB) is still above threshold (${THRESHOLD_MB}MB)`,
      currentSizeMB: metrics.totalSizeMB,
      belowThreshold,
    }
  }

  /**
   * Get sandbox path for reference
   */
  getSandboxPath(): string {
    return SANDBOX_PATH
  }

  /**
   * Get threshold in MB
   */
  getThresholdMB(): number {
    return THRESHOLD_MB
  }
}

// Export singleton instance
export const sandboxMonitor = new SandboxMonitor()
