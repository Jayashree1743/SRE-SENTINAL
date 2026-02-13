import type { NoopConfig } from '#/types'

/**
 * Component D: Approval Gate (Virtual NOOP Step)
 *
 * Virtual step for workflow visualization in Motia Workbench
 * Does not execute - purely for flow diagram clarity
 *
 * Features showcased:
 * - Virtual/NOOP steps
 * - Flow visualization
 * - Documentation of human-in-the-loop
 */
export const config: NoopConfig = {
  name: 'ApprovalGate',
  type: 'noop',
  description: '👤 Human approval checkpoint - Slack notification sent',
  virtualSubscribes: ['approval.required'],
  virtualEmits: [
    {
      topic: 'fix.approved',
      label: 'Approved by human',
    },
    {
      topic: 'fix.rejected',
      label: 'Rejected by human',
    },
  ],
  flows: ['sentinal-sre'],
}

// NOOP steps don't have handlers - they're purely for visualization
