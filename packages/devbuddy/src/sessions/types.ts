export interface DevBuddySession {
  id: string
  projectId: string
  startedAt: number
  endedAt?: number
  duration?: number
  activeBranch?: string
  currentTaskId?: string
  filesTouched: string[]
  toolsUsed: string[]
  messagesSent: number
  timeCreated: number
  timeUpdated: number
}
