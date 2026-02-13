import { z } from 'zod'

// Severity levels
export const SeveritySchema = z.enum(['low', 'medium', 'high', 'critical'])
export type Severity = z.infer<typeof SeveritySchema>

// Alert types
export const AlertTypeSchema = z.enum([
  'high_memory',
  'container_down',
  'disk_full',
  'network_latency',
  'cpu_spike',
  'sandbox_disk_full', // Real execution demo - safe sandbox cleanup
])
export type AlertType = z.infer<typeof AlertTypeSchema>

// Incident status
export const IncidentStatusSchema = z.enum([
  'detected',
  'analyzing',
  'pending_approval',
  'executing',
  'resolved',
  'failed',
])
export type IncidentStatus = z.infer<typeof IncidentStatusSchema>

// Alert data structure
export const AlertDataSchema = z.object({
  id: z.string(),
  alertType: AlertTypeSchema,
  severity: SeveritySchema,
  timestamp: z.string(),
  metric: z.string(),
  currentValue: z.number(),
  threshold: z.number(),
  affectedResource: z.string(),
  logs: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})
export type AlertData = z.infer<typeof AlertDataSchema>

// Health check result
export const HealthCheckResultSchema = z.object({
  resource: z.string(),
  status: z.enum(['healthy', 'unhealthy']),
  metric: z.string(),
  value: z.number(),
  threshold: z.number(),
  timestamp: z.string(),
})
export type HealthCheckResult = z.infer<typeof HealthCheckResultSchema>

// Infrastructure metrics
export interface InfrastructureMetrics {
  memory: {
    used: number
    total: number
    percentage: number
  }
  cpu: {
    usage: number
  }
  disk: {
    used: number
    total: number
    percentage: number
  }
  containers: {
    name: string
    status: 'running' | 'stopped' | 'crashed'
    restartCount: number
  }[]
  network: {
    latency: number
    errorRate: number
  }
}

// RCA (Root Cause Analysis) result
export const RCAResultSchema = z.object({
  incidentId: z.string(),
  summary: z.string(),
  rootCause: z.string(),
  proposedFix: z.string(),
  riskLevel: z.enum(['low', 'medium', 'high']),
  estimatedImpact: z.string(),
  timestamp: z.string(),
})
export type RCAResult = z.infer<typeof RCAResultSchema>

// Incident full data structure
export const IncidentSchema = z.object({
  id: z.string(),
  alertType: AlertTypeSchema,
  severity: SeveritySchema,
  status: IncidentStatusSchema,
  rcaSummary: z.string().optional(),
  proposedFix: z.string().optional(),
  riskLevel: z.enum(['low', 'medium', 'high']).optional(),
  approvalStatus: z.enum(['pending', 'approved', 'rejected']).optional(),
  executionLogs: z.array(z.string()).optional(),
  timestamps: z.object({
    detected: z.string(),
    rcaCompleted: z.string().optional(),
    approved: z.string().optional(),
    executed: z.string().optional(),
    resolved: z.string().optional(),
  }),
  metadata: z.record(z.string(), z.unknown()).optional(),
})
export type Incident = z.infer<typeof IncidentSchema>
