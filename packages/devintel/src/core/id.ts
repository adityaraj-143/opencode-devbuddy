const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

function base62Encode(n: number): string {
  if (n === 0) return "0"
  let result = ""
  while (n > 0) {
    result = BASE62[n % 62] + result
    n = Math.floor(n / 62)
  }
  return result
}

function ascendingTimestamp(): string {
  const now = Date.now()
  const base36 = now.toString(36).padStart(8, "0")
  const random = base62Encode(Math.floor(Math.random() * 62 * 62 * 62 * 62)).padStart(4, "0")
  return base36 + random
}

export function createID(prefix: string): string {
  return `${prefix}_${ascendingTimestamp()}`
}

export const ProjectID = () => createID("dip")
export const MemoryID = () => createID("dim")
export const SessionID = () => createID("dis")
export const ActivityID = () => createID("dia")
export const TaskID = () => createID("dit")
export const DecisionID = () => createID("did")
export const EmbeddingID = () => createID("die")
