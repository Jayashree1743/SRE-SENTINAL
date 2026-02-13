#!/usr/bin/env tsx
/**
 * Fill Sandbox Script
 *
 * Generates dummy files in the sandbox to trigger disk space alerts
 * Usage: npm run fill-sandbox [size-in-mb]
 */

import * as fs from 'fs/promises'
import * as path from 'path'

const SANDBOX_PATH = '/home/sidharth/Desktop/Motia/Sandbox'

async function generateDummyFile(filePath: string, sizeMB: number): Promise<void> {
  const sizeBytes = sizeMB * 1024 * 1024
  const chunkSize = 1024 * 1024 // 1MB chunks
  const chunks = Math.ceil(sizeBytes / chunkSize)

  const handle = await fs.open(filePath, 'w')

  try {
    for (let i = 0; i < chunks; i++) {
      const remainingBytes = sizeBytes - (i * chunkSize)
      const currentChunkSize = Math.min(chunkSize, remainingBytes)
      const buffer = Buffer.alloc(currentChunkSize, 0)
      await handle.write(buffer)
    }
  } finally {
    await handle.close()
  }
}

async function fillSandbox(totalSizeMB: number = 120): Promise<void> {
  console.log(`🎯 Filling sandbox with ${totalSizeMB}MB of test data...`)
  console.log(`📁 Target: ${SANDBOX_PATH}`)

  // Create fake log files (60% of total)
  const logSizeMB = Math.floor(totalSizeMB * 0.6)
  const logCount = 10
  const logSizeEach = logSizeMB / logCount

  console.log(`\n📝 Creating ${logCount} log files (${logSizeMB}MB total)...`)
  for (let i = 0; i < logCount; i++) {
    const timestamp = new Date(Date.now() - (i * 60 * 60 * 1000)).toISOString().replace(/[:.]/g, '-')
    const logPath = path.join(SANDBOX_PATH, 'logs', `app-${timestamp}.log`)
    await generateDummyFile(logPath, logSizeEach)
    console.log(`   ✓ ${path.basename(logPath)} (${logSizeEach.toFixed(1)}MB)`)
  }

  // Create temp files (30% of total)
  const tempSizeMB = Math.floor(totalSizeMB * 0.3)
  const tempCount = 5
  const tempSizeEach = tempSizeMB / tempCount

  console.log(`\n🗑️  Creating ${tempCount} temp files (${tempSizeMB}MB total)...`)
  for (let i = 0; i < tempCount; i++) {
    const tempPath = path.join(SANDBOX_PATH, 'temp', `temp-${Date.now()}-${i}.tmp`)
    await generateDummyFile(tempPath, tempSizeEach)
    console.log(`   ✓ ${path.basename(tempPath)} (${tempSizeEach.toFixed(1)}MB)`)
  }

  // Create cache files (10% of total)
  const cacheSizeMB = Math.floor(totalSizeMB * 0.1)
  const cacheCount = 3
  const cacheSizeEach = cacheSizeMB / cacheCount

  console.log(`\n💾 Creating ${cacheCount} cache files (${cacheSizeMB}MB total)...`)
  for (let i = 0; i < cacheCount; i++) {
    const cachePath = path.join(SANDBOX_PATH, 'cache', `cache-${i}.dat`)
    await generateDummyFile(cachePath, cacheSizeEach)
    console.log(`   ✓ ${path.basename(cachePath)} (${cacheSizeEach.toFixed(1)}MB)`)
  }

  // Create some important data (should NOT be deleted)
  console.log(`\n📊 Creating protected data files...`)
  const dataPath = path.join(SANDBOX_PATH, 'data', 'important-data.json')
  await fs.writeFile(
    dataPath,
    JSON.stringify({ message: 'This file should NOT be deleted by cleanup' }, null, 2)
  )
  console.log(`   ✓ ${path.basename(dataPath)} (protected)`)

  // Show summary
  const { execSync } = await import('child_process')
  const diskUsage = execSync(`du -sh ${SANDBOX_PATH}`).toString().split('\t')[0]

  console.log(`\n✅ Sandbox filled successfully!`)
  console.log(`📦 Total size: ${diskUsage}`)
  console.log(`🚨 Threshold: 100MB - Alert should trigger!`)
  console.log(`\n💡 Next steps:`)
  console.log(`   1. Trigger alert: curl -X POST http://localhost:3001/trigger-alert -H "Content-Type: application/json" -d '{"scenario": "sandbox_disk_full"}'`)
  console.log(`   2. Watch dashboard for real-time cleanup`)
  console.log(`   3. Verify files were actually deleted`)
}

// Parse command line args
const sizeMB = process.argv[2] ? parseInt(process.argv[2]) : 120

fillSandbox(sizeMB).catch((error) => {
  console.error('❌ Failed to fill sandbox:', error)
  process.exit(1)
})
